import fs from 'node:fs';
import path from 'node:path';

/**
 * Triagem automática de mídia enviada pela comunidade. NÃO substitui a moderação
 * humana: segura o post como "pendente de revisão" quando a imagem parece imprópria.
 *
 * Política (pedido explícito do dono do site): ser BEM restritivo. Falso positivo
 * custa uma aprovação manual; falso negativo expõe a comunidade. Por isso:
 *  - modelo mais preciso disponível (InceptionV3, 299px) com fallback para MobileNetV2;
 *  - limiares baixos e soma das classes "adultas" (Porn + Hentai + Sexy);
 *  - GIF/WebP animado: analisa vários quadros e usa o pior;
 *  - vídeo: não dá para analisar localmente -> SEMPRE fica pendente para aprovação manual.
 *
 * Motores, em ordem de preferência:
 *  1. Sightengine (API) — se SIGHTENGINE_USER e SIGHTENGINE_SECRET estiverem no .env.
 *  2. NSFWJS local (TensorFlow.js puro + sharp) — sem chave, roda no próprio servidor.
 * Se nenhum estiver disponível, imagens ficam PENDENTES (política restritiva: sem triagem, sem publicar sozinho).
 */

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ANIMATED_MIMES = new Set(['image/gif', 'image/webp']);

// Limiares individuais + soma. Qualquer um estourando = sinalizado.
export const NSFW_POLICY = {
  Porn: 0.12,
  Hentai: 0.12,
  Sexy: 0.22,
  adultSum: 0.30, // Porn + Hentai + Sexy
  // Sightengine
  se: { sexual_activity: 0.15, sexual_display: 0.15, erotica: 0.30, suggestive: 0.45, gore: 0.30 },
  videoAlwaysPending: true,
  pendingWhenNoEngine: true,
};

let model = null;
let modelName = null;
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
        // InceptionV3 = mais preciso (empacotado no próprio nsfwjs, sem rede). Fallback: MobileNetV2 padrão.
        try {
          model = await load('InceptionV3', { size: 299 });
          modelName = 'nsfwjs/InceptionV3';
        } catch (e) {
          console.warn('[moderation] InceptionV3 indisponível, usando MobileNetV2:', e.message);
          model = await load();
          modelName = 'nsfwjs/MobileNetV2';
        }
        console.log(`[moderation] ${modelName} carregado — triagem local de imagens ativa (modo restritivo).`);
      } catch (e) {
        localDisabled = true;
        console.warn('[moderation] triagem local indisponível (nsfwjs/tfjs/sharp):', e.message);
      }
      return model;
    })();
  }
  return modelLoading;
}

function judgeScores(scores) {
  const hits = [];
  for (const k of ['Porn', 'Hentai', 'Sexy']) if ((scores[k] || 0) >= NSFW_POLICY[k]) hits.push(`${k} ${Math.round(scores[k] * 100)}%`);
  const sum = (scores.Porn || 0) + (scores.Hentai || 0) + (scores.Sexy || 0);
  if (sum >= NSFW_POLICY.adultSum && !hits.length) hits.push(`adulto (soma) ${Math.round(sum * 100)}%`);
  return { hits, adultSum: +sum.toFixed(3) };
}

async function classifyBuffer(m, tf, data, info) {
  const tensor = tf.tensor3d(new Uint8Array(data.buffer, data.byteOffset, data.length), [info.height, info.width, 3], 'int32');
  try {
    const preds = await m.classify(tensor);
    return Object.fromEntries(preds.map((p) => [p.className, +p.probability.toFixed(3)]));
  } finally {
    tensor.dispose();
  }
}

async function scanLocal(filePath, mimetype) {
  const m = await loadLocalModel();
  if (!m) return { skipped: true, reason: 'sem motor de triagem' };
  const sharp = (await import('sharp')).default;
  const tf = await import('@tensorflow/tfjs');
  const size = modelName?.includes('Inception') ? 299 : 224;

  // Quadros a analisar: 1 para imagem estática; até 5 espalhados para animação.
  let pages = 1;
  if (ANIMATED_MIMES.has(mimetype)) {
    try { pages = (await sharp(filePath, { pages: -1 }).metadata()).pages || 1; } catch { pages = 1; }
  }
  const frames = pages <= 1 ? [0] : [...new Set([0, Math.floor(pages * 0.25), Math.floor(pages * 0.5), Math.floor(pages * 0.75), pages - 1])];

  let worst = null;
  for (const page of frames) {
    const { data, info } = await sharp(filePath, { page, pages: 1 }).removeAlpha().resize(size, size, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const scores = await classifyBuffer(m, tf, data, info);
    const j = judgeScores(scores);
    if (!worst || j.adultSum > worst.adultSum) worst = { scores, ...j, frame: page };
    if (j.hits.length) break; // já basta para segurar o post
  }
  return { engine: modelName, flagged: worst.hits.length > 0, hits: worst.hits, scores: worst.scores, adultSum: worst.adultSum, frames: frames.length, frame: worst.frame };
}

async function scanSightengine(filePath) {
  const fd = new FormData();
  fd.append('models', 'nudity-2.1,gore-2.0');
  fd.append('api_user', process.env.SIGHTENGINE_USER);
  fd.append('api_secret', process.env.SIGHTENGINE_SECRET);
  fd.append('media', new Blob([await fs.promises.readFile(filePath)]), path.basename(filePath));
  const res = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: fd });
  const j = await res.json();
  if (j.status !== 'success') throw new Error(j.error?.message || 'Sightengine falhou');
  const n = j.nudity || {};
  const P = NSFW_POLICY.se;
  const hits = [];
  for (const k of ['sexual_activity', 'sexual_display', 'erotica', 'suggestive']) if ((n[k] || 0) >= P[k]) hits.push(`${k} ${Math.round(n[k] * 100)}%`);
  if ((j.gore?.prob || 0) >= P.gore) hits.push(`gore ${Math.round(j.gore.prob * 100)}%`);
  return { engine: 'sightengine', flagged: hits.length > 0, hits, scores: { ...n, gore: j.gore?.prob } };
}

export async function scanImage(filePath, mimetype = 'image/jpeg') {
  try {
    if (process.env.SIGHTENGINE_USER && process.env.SIGHTENGINE_SECRET) return await scanSightengine(filePath);
    return await scanLocal(filePath, mimetype);
  } catch (e) {
    return { skipped: true, reason: e.message };
  }
}

/**
 * Escaneia os arquivos de um upload (multer). Devolve {flagged, scanned, results, reasons}.
 * Regras restritivas: vídeo sempre sinaliza (aprovação manual); imagem sem motor também.
 */
export async function scanUploads(files = []) {
  const results = [];
  const reasons = [];
  let flagged = false;
  let scanned = 0;
  for (const f of files) {
    if (f.mimetype.startsWith('video/')) {
      results.push({ file: f.filename, type: 'video', skipped: true, flagged: NSFW_POLICY.videoAlwaysPending, reason: 'vídeo: aprovação manual obrigatória' });
      if (NSFW_POLICY.videoAlwaysPending) { flagged = true; reasons.push('vídeo precisa de aprovação manual'); }
      continue;
    }
    if (!IMAGE_MIMES.has(f.mimetype)) { results.push({ file: f.filename, skipped: true, reason: 'formato não analisado' }); continue; }
    const r = await scanImage(f.path, f.mimetype);
    if (r.skipped) {
      const hold = NSFW_POLICY.pendingWhenNoEngine;
      results.push({ file: f.filename, type: 'image', ...r, flagged: hold });
      if (hold) { flagged = true; reasons.push('imagem não pôde ser analisada'); }
      continue;
    }
    scanned++;
    results.push({ file: f.filename, type: 'image', ...r });
    if (r.flagged) { flagged = true; reasons.push(`imagem sinalizada: ${r.hits.join(', ')}`); }
  }
  return { flagged, scanned, results, reasons, policy: 'strict', at: new Date().toISOString() };
}

/** Aquece o modelo local no boot (em segundo plano) para o primeiro post não esperar. */
export function warmModeration() {
  if (process.env.SIGHTENGINE_USER) return;
  setTimeout(() => { loadLocalModel().catch(() => {}); }, 5000);
}
