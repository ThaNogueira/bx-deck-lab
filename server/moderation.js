import fs from 'node:fs';
import path from 'node:path';

/**
 * Triagem automática de imagens enviadas pela comunidade. NÃO substitui a moderação
 * humana: só segura o post como "pendente de revisão" quando a imagem parece imprópria.
 *
 * Dois motores, em ordem de preferência:
 *  1. Sightengine (API paga/free tier) — se SIGHTENGINE_USER e SIGHTENGINE_SECRET estiverem no .env.
 *  2. NSFWJS local (MobileNet em TensorFlow.js puro + sharp) — sem chave, roda no próprio servidor.
 * Se nenhum estiver disponível, o upload segue sem triagem (marcado como "não escaneado").
 */

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const NSFW_THRESHOLDS = { Porn: 0.6, Hentai: 0.6, Sexy: 0.9 };

let model = null;
let modelLoading = null;
let localDisabled = false;

async function loadLocalModel() {
  if (model || localDisabled) return model;
  if (!modelLoading) {
    modelLoading = (async () => {
      try {
        const tf = await import('@tensorflow/tfjs');
        tf.enableProdMode?.();
        const nsfwjs = await import('nsfwjs');
        const load = nsfwjs.load || nsfwjs.default?.load;
        model = await load(); // modelo MobileNetV2 empacotado no próprio pacote (sem rede)
        console.log('[moderation] NSFWJS carregado — triagem local de imagens ativa.');
      } catch (e) {
        localDisabled = true;
        console.warn('[moderation] triagem local indisponível (nsfwjs/tfjs/sharp):', e.message);
      }
      return model;
    })();
  }
  return modelLoading;
}

async function scanLocal(filePath) {
  const m = await loadLocalModel();
  if (!m) return { skipped: true, reason: 'sem motor de triagem' };
  const sharp = (await import('sharp')).default;
  const tf = await import('@tensorflow/tfjs');
  // Primeiro frame (GIF/WebP animado), 224x224 RGB — o que o MobileNet espera
  const { data, info } = await sharp(filePath, { pages: 1 }).removeAlpha().resize(224, 224, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const tensor = tf.tensor3d(new Uint8Array(data.buffer, data.byteOffset, data.length), [info.height, info.width, 3], 'int32');
  try {
    const preds = await m.classify(tensor);
    const scores = Object.fromEntries(preds.map((p) => [p.className, +p.probability.toFixed(3)]));
    const hits = Object.entries(NSFW_THRESHOLDS).filter(([k, t]) => (scores[k] || 0) >= t).map(([k]) => k);
    return { engine: 'nsfwjs', flagged: hits.length > 0, hits, scores };
  } finally {
    tensor.dispose();
  }
}

async function scanSightengine(filePath) {
  const user = process.env.SIGHTENGINE_USER;
  const secret = process.env.SIGHTENGINE_SECRET;
  const fd = new FormData();
  fd.append('models', 'nudity-2.1,gore-2.0');
  fd.append('api_user', user);
  fd.append('api_secret', secret);
  fd.append('media', new Blob([await fs.promises.readFile(filePath)]), path.basename(filePath));
  const res = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: fd });
  const j = await res.json();
  if (j.status !== 'success') throw new Error(j.error?.message || 'Sightengine falhou');
  const n = j.nudity || {};
  const hits = [];
  if ((n.sexual_activity || 0) > 0.5) hits.push('sexual_activity');
  if ((n.sexual_display || 0) > 0.5) hits.push('sexual_display');
  if ((n.erotica || 0) > 0.7) hits.push('erotica');
  if ((j.gore?.prob || 0) > 0.6) hits.push('gore');
  return { engine: 'sightengine', flagged: hits.length > 0, hits, scores: { ...n, gore: j.gore?.prob } };
}

export async function scanImage(filePath) {
  try {
    if (process.env.SIGHTENGINE_USER && process.env.SIGHTENGINE_SECRET) return await scanSightengine(filePath);
    return await scanLocal(filePath);
  } catch (e) {
    return { skipped: true, reason: e.message };
  }
}

/**
 * Escaneia os arquivos de um upload (multer). Vídeos não são analisados (só sinalizados
 * como não escaneados). Devolve {flagged, scanned, results}.
 */
export async function scanUploads(files = []) {
  const results = [];
  let flagged = false;
  let scanned = 0;
  for (const f of files) {
    if (!IMAGE_MIMES.has(f.mimetype)) { results.push({ file: f.filename, skipped: true, reason: 'vídeo/formato não analisado' }); continue; }
    const r = await scanImage(f.path);
    results.push({ file: f.filename, ...r });
    if (!r.skipped) scanned++;
    if (r.flagged) flagged = true;
  }
  return { flagged, scanned, results, at: new Date().toISOString() };
}

/** Aquece o modelo local no boot (em segundo plano) para o primeiro post não esperar. */
export function warmModeration() {
  if (process.env.SIGHTENGINE_USER) return;
  setTimeout(() => { loadLocalModel().catch(() => {}); }, 5000);
}
