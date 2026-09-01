import { Router } from 'express';
import { prisma } from '../db.js';
import { getSetting } from '../settings.js';
import { isStaff } from '../auth.js';

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** Config pública do site: nome, redes, flags, manutenção e avisos ativos. */
router.get('/api/site', ah(async (req, res) => {
  const [site, flags, maintenance] = await Promise.all([
    getSetting('site'),
    getSetting('flags'),
    getSetting('maintenance'),
  ]);
  const now = new Date();
  const announcements = (await prisma.announcement.findMany({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })).filter((a) => (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt >= now));

  res.json({
    site,
    flags,
    maintenance: { on: !!maintenance.on && !isStaff(req.user), message: maintenance.message },
    announcements: announcements.map((a) => ({ id: a.id, message: a.message, href: a.href })),
    googleLogin: !!process.env.GOOGLE_CLIENT_ID,
    devLogin: process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production',
  });
}));

export default router;
