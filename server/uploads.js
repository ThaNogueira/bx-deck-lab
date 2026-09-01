import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import multer from 'multer';

/**
 * Uploads de imagem/vídeo curto (avatares, banners — inclusive animados —,
 * peças, produtos e cosméticos). Ficam em data/uploads e são servidos em
 * /uploads. GIF/WebP animado e MP4/WebM curtos são aceitos (item 3).
 */

export const UPLOADS_DIR = path.resolve('data/uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${EXT[file.mimetype] ?? ''}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) return cb(null, true);
    cb(new Error('Formato não suportado (use PNG, JPG, WebP, GIF, SVG, MP4 ou WebM).'));
  },
});

export function uploadedUrl(file) {
  return file ? `/uploads/${file.filename}` : null;
}

export const isVideoUrl = (url) => /\.(mp4|webm)$/i.test(url || '');
