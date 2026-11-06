// Cards HTML do BeybladeHub: o nome e a imagem vêm sempre do mesmo card.
// Não depende da tradução da página nem do proxy de Markdown.
const text = (s) => String(s || '').replace(/<!--[^]*?-->/g, '').replace(/<[^>]*>/g, ' ')
  .replace(/&#x([a-f0-9]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const CX = { chip: 'lock', main: 'main', metal: 'main', assist: 'assist', over: 'over' };

function cardHtml(html, start) {
  const tags = /<\/?div\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 0, tag;
  while ((tag = tags.exec(html))) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  return ''; // Card incompleto: não aproveita texto dos vizinhos ou rodapé.
}

export function parseHubHtml(html, category) {
  const prefix = { blades: 'blade', ratchets: 'ratchet', bits: 'bit' }[category];
  if (!prefix) return [];
  const cards = [...html.matchAll(new RegExp(`<div\\b[^>]*\\bid="${prefix}-([^"<>]+)"[^>]*>`, 'g'))];
  const records = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const block = cardHtml(html, card.index);
    const image = block.match(/<img\b[^>]*\bsrc="(https:\/\/img\.beybladehub\.app\/[^"<>]+)"/)?.[1];
    if (!image) continue;
    const hiddenName = block.match(/<span\b[^>]*translate="no"[^>]*>([^]*?)<\/span>/)?.[1];
    const visibleName = block.match(/<div\b[^>]*class="[^"]*text-sm font-bold text-white truncate[^"]*"[^>]*>([^]*?)<\/div>/)?.[1];
    const name = text(category === 'ratchets' ? card[1] : hiddenName || visibleName);
    if (!name || name.length > 70) continue;
    const cx = image.match(/\/blades-cx\/(chip|main|metal|assist|over)-/);
    const plain = text(block);
    const fused = /Ratchet[- ]Integrated|\bFused\b|一體型|一体型/i.test(plain);
    const kind = cx ? CX[cx[1]] : category === 'blades' ? (fused ? 'integrated' : 'blade')
      : category === 'bits' ? (fused ? 'rib' : 'bit') : 'ratchet';
    if ((category === 'blades' && !/\/blades-(db|cx)\//.test(image))
      || (category === 'bits' && !/\/bits\//.test(image))
      || (category === 'ratchets' && !/\/ratchets\//.test(image))) continue;
    const type = plain.match(/\b(Attack|Defense|Stamina|Balance)\b/)?.[1];
    const hasbro = block.match(/<span[^>]*>Hasbro:([^]*?)<\/span>/)?.[1];
    records.push({ kind, name, image: text(image), ...(type ? { type } : {}),
      ...(hasbro ? { aliases: [text(hasbro)] } : {}),
      ...(['bit', 'rib', 'ratchet'].includes(kind) ? { abbrev: card[1] } : {}),
      source: `https://beybladehub.app/en/parts/${category}` });
  }
  return records;
}
