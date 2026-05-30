import puppeteer from 'puppeteer-core';
const edge = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const browser = await puppeteer.launch({ executablePath: edge, headless: 'new' });
async function run(label, w, h, ua) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  if (ua) await page.setUserAgent(ua);
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('jobradar.cfg.v2', JSON.stringify({
      kw: ['Customer Success Manager','Delivery Manager','Service Delivery Manager','CX Manager','Head of Customer Success','Account Manager','Operations Manager','Director of Delivery'],
      ci: ['Casablanca','Rabat','Tanger','Marrakech','Agadir','Fès','Mohammedia','Salé'],
      src: { LinkedIn: true, Rekrute: true, 'Emploi.ma': true }
    }));
  });
  await page.goto('http://localhost:1403/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.evaluate(() => window.openConfigSheet());
  await new Promise(r => setTimeout(r, 400));
  const diag = await page.evaluate(() => {
    const sheet = document.getElementById('sheet');
    const cs = getComputedStyle(sheet);
    const lastCi = document.getElementById('shCiChips').lastElementChild;
    const cta = document.getElementById('sheetScanCta');
    return {
      vh: window.innerHeight, dvh: typeof CSS !== 'undefined' && CSS.supports('height','100dvh') ? 'supported' : 'no',
      sheetMaxH: cs.maxHeight, sheetH: sheet.offsetHeight, sheetScrollH: sheet.scrollHeight,
      sheetClientH: sheet.clientHeight, sheetOverflow: cs.overflowY,
      canScroll: sheet.scrollHeight > sheet.clientHeight,
      lastCiInViewport: lastCi ? (lastCi.getBoundingClientRect().bottom <= window.innerHeight) : null,
      lastCiY: lastCi?.getBoundingClientRect().y,
      ctaInViewport: cta ? (cta.getBoundingClientRect().bottom <= window.innerHeight) : null,
      ctaY: cta?.getBoundingClientRect().y,
    };
  });
  console.log('\n['+label+'] '+w+'x'+h);
  console.log(JSON.stringify(diag, null, 2));
  await page.screenshot({path:`C:/Users/L15/Downloads/bug2-${label}.png`});
  await page.close();
}
await run('s8-android', 360, 740, 'Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML) Chrome/126 Mobile Safari/537.36');
await run('iphone-13', 390, 844, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1');
await run('iphone-se', 375, 667, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1');
await browser.close();
