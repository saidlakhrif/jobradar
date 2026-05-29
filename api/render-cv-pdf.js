// Render an HTML page (sent in the POST body) to a 1-page A4 PDF using Edge / Chrome headless.
// Used locally via dev.js. On Vercel a different backend (puppeteer-core + chromium) is needed.

import { writeFile, readFile, unlink, access } from 'fs/promises';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const CANDIDATE_BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

let _cachedBrowser = null;
async function findBrowser() {
  if (_cachedBrowser) return _cachedBrowser;
  for (const p of CANDIDATE_BROWSERS) {
    try { await access(p); _cachedBrowser = p; return p; } catch {}
  }
  throw new Error('No Edge/Chrome found on this machine');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let html = '';
  const ct = req.headers['content-type'] || '';
  try {
    if (ct.includes('application/json')) {
      const body = req.body || JSON.parse(await readBody(req) || '{}');
      html = body.html || '';
    } else {
      html = await readBody(req);
    }
  } catch (e) {
    return res.status(400).json({ error: 'Bad body: ' + e.message });
  }
  if (!html || html.length < 100) return res.status(400).json({ error: 'No HTML provided' });

  const tmp = tmpdir();
  const id = randomBytes(8).toString('hex');
  const htmlPath = join(tmp, `cv-${id}.html`);
  const pdfPath  = join(tmp, `cv-${id}.pdf`);

  try {
    const browser = await findBrowser();
    await writeFile(htmlPath, html, 'utf8');

    await new Promise((resolve, reject) => {
      const args = [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        '--no-pdf-header-footer', '--hide-scrollbars',
        '--run-all-compositor-stages-before-draw',
        `--print-to-pdf=${pdfPath}`,
        `file:///${htmlPath.replace(/\\/g, '/')}`,
      ];
      const proc = spawn(browser, args, { windowsHide: true });
      let err = '';
      proc.stderr.on('data', d => err += d.toString());
      proc.on('exit', code => code === 0 ? resolve() : reject(new Error(`browser exited ${code}: ${err.slice(0,300)}`)));
      proc.on('error', reject);
      setTimeout(() => { try { proc.kill(); } catch {} reject(new Error('browser timeout')); }, 25000);
    });

    const pdf = await readFile(pdfPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdf);
  } catch (e) {
    console.error('[render-cv-pdf]', e);
    res.status(500).json({ error: e.message });
  } finally {
    unlink(htmlPath).catch(()=>{});
    unlink(pdfPath).catch(()=>{});
  }
}
