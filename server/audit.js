import { prisma } from './db.js';

/** Log de auditoria (2.10). Nunca derruba a request se falhar. */
export async function audit(actor, action, targetType = null, targetId = null, details = null) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        action,
        targetType,
        targetId,
        details: details == null ? null : JSON.stringify(details),
      },
    });
  } catch (e) {
    console.error('[audit]', e);
  }
}

export async function logError(err, path = null) {
  try {
    await prisma.errorLog.create({
      data: {
        message: String(err?.message || err).slice(0, 2000),
        stack: err?.stack ? String(err.stack).slice(0, 8000) : null,
        path,
      },
    });
  } catch {
    /* último recurso: só console */
  }
  console.error(`[erro]${path ? ` ${path}` : ''}`, err);
}
