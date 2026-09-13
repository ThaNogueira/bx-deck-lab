// Read-only visual preview: production cookies and writes are never forwarded.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('public');
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.json':'application/json' };
const pages = { u:'u', deck:'deck', peca:'peca', produto:'produto', torneio:'torneio', t:'inscricao', mesa:'mesa' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Read-only preview'); }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
      const upstream = await fetch('https://beyxlab.com.br' + url.pathname + url.search);
      res.writeHead(upstream.status, { 'Content-Type':upstream.headers.get('content-type') || 'application/octet-stream', 'Cache-Control':'no-store' });
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }
    let file = decodeURIComponent(url.pathname);
    const segments = file.split('/').filter(Boolean);
    if (!path.extname(file)) file = '/' + (segments.length === 0 ? 'index' : segments[0] === 'comunidade' ? 'comunidade' : segments[2] === 'cartaz' ? 'cartaz' : pages[segments[0]] || segments[0]) + '.html';
    const target = path.resolve(root, '.' + file);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type':types[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Preview: resource unavailable'); }
}).listen(4173, '127.0.0.1', () => console.log('Read-only preview: http://127.0.0.1:4173'));
