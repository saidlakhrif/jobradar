// Render an HTML page (sent in the POST body) to a 1-page A4 PDF.
// Two backends:
//   - LOCAL  (Windows/Mac/Linux dev): spawn Edge or Chrome headless (faster, uses installed browser)
//   - VERCEL (serverless Linux):      puppeteer-core + @sparticuz/chromium-min (downloads Chromium at runtime)

import { writeFile, readFile, unlink, access } from 'fs/promises';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const IS_VERCEL = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
// Pin Chromium version aligned with installed @sparticuz/chromium-min (147)
const CHROMIUM_VERSION = 'v147.0.0';
const CHROMIUM_PACK_URL = `https://github.com/Sparticuz/chromium/releases/download/${CHROMIUM_VERSION}/chromium-${CHROMIUM_VERSION}-pack.x64.tar`;

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

// ─── Vercel / serverless path via puppeteer-core + chromium-min ─────────────
async function renderViaPuppeteer(html) {
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 }, // A4 @ 96 DPI
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 });
    // Give web fonts a moment to settle (DM Sans from Google Fonts)
    try { await page.evaluateHandle('document.fonts.ready'); } catch {}
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(()=>{});
  }
}

// ─── Local path via Edge/Chrome spawn (existing behaviour) ──────────────────
async function renderViaSpawn(html) {
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
    return await readFile(pdfPath);
  } finally {
    unlink(htmlPath).catch(()=>{});
    unlink(pdfPath).catch(()=>{});
  }
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

  try {
    // Prefer explicit signal (Vercel/Lambda), else try installed browser, else fall back to puppeteer
    let pdf;
    if (IS_VERCEL) {
      pdf = await renderViaPuppeteer(html);
    } else {
      try {
        pdf = await renderViaSpawn(html);
      } catch (e) {
        if (/No Edge\/Chrome/i.test(e.message)) {
          console.log('[render-cv-pdf] no local browser, falling back to puppeteer');
          pdf = await renderViaPuppeteer(html);
        } else throw e;
      }
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdf);
  } catch (e) {
    console.error('[render-cv-pdf]', e);
    res.status(500).json({ error: e.message, stack: e.stack?.split('\n').slice(0,3) });
  }
}
