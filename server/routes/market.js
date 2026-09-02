import { Router } from 'express';
import { prisma } from '../db.js';
import { requireUser, publicUser } from '../auth.js';
import { json, waLink } from '../util.js';
import { partDto } from './catalog.js';

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** Vitrine geral de vendas: peças e combos à venda de vendedores ativos. */
router.get('/api/market', ah(async (_req, res) => {
  const [items, combos] = await Promise.all([
    prisma.collectionItem.findMany({
      where: { forSale: true, hidden: false, user: { status: 'ACTIVE', canSell: true } },
      include: { user: true },
      take: 300,
    }),
    prisma.combo.findMany({
      where: { forSale: true, status: 'VISIBLE', user: { status: 'ACTIVE', canSell: true } },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  const partIds = [...new Set([...items.map((i) => i.partId), ...combos.flatMap((c) => json(c.partsJson, []))])];
  const parts = await prisma.part.findMany({ where: { id: { in: partIds } } });
  const byId = new Map(parts.map((p) => [p.id, partDto(p)]));

  res.json({
    items: items
      .filter((i) => byId.has(i.partId))
      .map((i) => ({
        partId: i.partId,
        part: byId.get(i.partId),
        qty: i.qty,
        condition: i.condition,
        priceCents: i.priceCents,
        seller: publicUser(i.user),
        whatsappUrl: i.user.whatsapp
          ? waLink(i.user.whatsapp, `Olá! Tenho interesse na peça ${byId.get(i.partId).displayName} que você anunciou no BX Deck Lab.`)
          : null,
      })),
    combos: combos.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      parts: json(c.partsJson, []).map((id) => byId.get(id)).filter(Boolean),
      condition: c.condition,
      priceCents: c.priceCents,
      seller: publicUser(c.user),
      whatsappUrl: c.user.whatsapp
        ? waLink(c.user.whatsapp, `Olá! Tenho interesse no combo "${c.title}" que você anunciou no BX Deck Lab.`)
        : null,
    })),
  });
}));

/** Denúncias (2.3): qualquer usuário logado pode denunciar conteúdo. */
router.post('/api/reports', requireUser, ah(async (req, res) => {
  const b = req.body || {};
  const targetType = ['DECK', 'USER', 'LISTING', 'COMBO', 'TOURNAMENT', 'POST', 'COMMENT'].includes(b.targetType) ? b.targetType : null;
  const targetId = String(b.targetId || '').slice(0, 64);
  const category = ['INAPPROPRIATE', 'SPAM', 'SCAM', 'HARASSMENT', 'OTHER'].includes(b.category) ? b.category : null;
  const reason = String(b.reason || '').trim().slice(0, 500) || (category ? { INAPPROPRIATE: 'Conteúdo impróprio', SPAM: 'Spam / propaganda', SCAM: 'Golpe / venda falsa', HARASSMENT: 'Assédio / ofensa', OTHER: 'Outro' }[category] : '');
  if (!targetType || !targetId || !reason) return res.status(422).json({ error: 'Denúncia incompleta.' });
  const recent = await prisma.report.count({
    where: { reporterId: req.user.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= 10) return res.status(429).json({ error: 'Muitas denúncias na última hora — aguarde um pouco.' });
  await prisma.report.create({ data: { reporterId: req.user.id, targetType, targetId, reason, category } });
  res.json({ ok: true });
}));

export default router;
