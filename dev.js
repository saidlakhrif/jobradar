import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, extname, resolve } from 'path';
import { pathToFileURL } from 'url';

const PORT = process.env.PORT || 1403;
const ROOT = resolve('.');
const PUBLIC = resolve('public');
const API = resolve('api');

// .env loader (no dep)
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const MIME = {
  '.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json',
  '.woff2':'font/woff2','.woff':'font/woff','.map':'application/json',
};

// Tiny shim so api/*.js handlers (written for Vercel Node) work locally.
// Wraps Node's http req/res with the Vercel-style .status() / .json() / req.body / req.method.
function wrap(req, res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (obj) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(obj)); return res; };
  res.send = (b) => { res.end(b); return res; };
  return { req, res };
}

async function loadHandler(file) {
  const url = pathToFileURL(file).href + '?t=' + Date.now(); // bust cache for hot-ish reload
  const mod = await import(url);
  return mod.default || mod.handler;
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = join(PUBLIC, urlPath);
  if (!filePath.startsWith(PUBLIC)) { res.statusCode = 403; return res.end('Forbidden'); }
  try {
    const s = await stat(filePath);
    if (s.isFile()) {
      const data = await readFile(filePath);
      res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(data);
    }
  } catch {}
  // SPA fallback → index.html
  try {
    const data = await readFile(join(PUBLIC, 'index.html'));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(data);
  } catch {
    res.statusCode = 404; res.end('Not found');
  }
}

const server = createServer(async (rawReq, rawRes) => {
  const { req, res } = wrap(rawReq, rawRes);
  const url = req.url.split('?')[0];

  if (url.startsWith('/api/')) {
    const name = url.replace(/^\/api\//, '').replace(/\/$/, '');
    const file = join(API, name + '.js');
    if (!existsSync(file)) { res.status(404).json({ error: `No handler for ${url}` }); return; }
    try {
      const handler = await loadHandler(file);
      await handler(req, res);
    } catch (e) {
      console.error(`[${url}]`, e);
      if (!res.headersSent) res.status(500).json({ error: e.message });
      else res.end();
    }
    return;
  }

  await serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n🚀 JobRadar local dev — http://localhost:${PORT}`);
  console.log(`   API key  : ${process.env.ANTHROPIC_API_KEY ? '✓ loaded from .env' : '✗ missing (create .env with ANTHROPIC_API_KEY=sk-ant-…)'}`);
  console.log(`   Static   : ${PUBLIC}`);
  console.log(`   Functions: ${API}/*.js`);
  console.log(`   Stop     : Ctrl+C\n`);
});
