// Multi-user bug hunt — simulate real interactions and capture problems
import puppeteer from 'puppeteer-core';
const edge = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const bugs = [];

function bug(scenario, what, evidence) {
  bugs.push({ scenario, what, evidence });
  console.log(`\n🐛 [${scenario}] ${what}`);
  if (evidence) console.log(`   evidence:`, evidence);
}

const browser = await puppeteer.launch({ executablePath: edge, headless: 'new' });

// ─── Scenario A: Mobile user opens Config sheet, adds a city, looks for it ──
async function scenarioA() {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:1403/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  await page.evaluate(() => window.openConfigSheet());
  await new Promise(r => setTimeout(r, 400));

  // Try to type a new city
  const ciInputVisible = await page.evaluate(() => {
    const el = document.getElementById('shCiInput');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x:r.x, y:r.y, w:r.width, h:r.height, inView: r.y > 0 && r.y < window.innerHeight };
  });
  console.log(`  shCiInput position:`, ciInputVisible);

  await page.evaluate(() => { document.getElementById('shCiInput').focus(); });
  await page.keyboard.type('Tanger');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 300));

  // After adding, check chip visibility
  const chipsState = await page.evaluate(() => {
    const wrap = document.getElementById('shCiChips');
    if (!wrap) return null;
    const chips = wrap.querySelectorAll('.chip');
    const visible = [...chips].map(c => {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return {
        text: c.textContent.replace(/×$/,'').trim(),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        display: cs.display, opacity: cs.opacity, color: cs.color, bg: cs.backgroundColor,
        inViewport: r.y > 0 && r.y < window.innerHeight && r.x > 0 && r.x < window.innerWidth,
      };
    });
    return { count: chips.length, visible, wrapHidden: getComputedStyle(wrap).display === 'none' };
  });
  console.log(`  ci chips after Add Tanger:`, JSON.stringify(chipsState, null, 2));
  if (chipsState.count < 3) bug('A', `Expected 3 cities (Casablanca, Rabat, Tanger), got ${chipsState.count}`, chipsState);
  for (const c of chipsState.visible || []) {
    if (c.opacity === '0' || c.display === 'none' || c.w === 0 || c.h === 0) {
      bug('A', `City chip "${c.text}" rendered but invisible`, c);
    }
  }

  // Try to scroll all the way down inside the sheet
  const scrollResult = await page.evaluate(async () => {
    const sheet = document.getElementById('sheet');
    if (!sheet) return null;
    const before = sheet.scrollTop;
    const maxScroll = sheet.scrollHeight - sheet.clientHeight;
    sheet.scrollTo({ top: sheet.scrollHeight, behavior: 'auto' });
    await new Promise(r => setTimeout(r, 200));
    const after = sheet.scrollTop;
    const cta = document.getElementById('sheetScanCta');
    const ctaRect = cta?.getBoundingClientRect();
    return {
      scrollHeight: sheet.scrollHeight,
      clientHeight: sheet.clientHeight,
      maxScroll,
      scrolledTo: after,
      reachedBottom: after >= maxScroll - 2,
      ctaVisible: ctaRect ? (ctaRect.y > 0 && ctaRect.y + ctaRect.height < window.innerHeight) : false,
      ctaRect: ctaRect ? {y: Math.round(ctaRect.y), h: Math.round(ctaRect.height)} : null,
    };
  });
  console.log(`  scroll inside sheet:`, scrollResult);
  if (scrollResult && !scrollResult.reachedBottom) bug('A', 'Cannot scroll to the bottom of the Recherche sheet', scrollResult);
  if (scrollResult && !scrollResult.ctaVisible) bug('A', `"Lancer le scan" CTA not visible even after scrolling to bottom`, scrollResult);

  await page.screenshot({ path: 'C:/Users/L15/Downloads/bug-A-config.png', fullPage: false });
  await page.close();
}

// ─── Scenario B: User opens settings, scrolls through all cards ──
async function scenarioB() {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:1403/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => window.openDriveSettings());
  await new Promise(r => setTimeout(r, 500));

  const cardsState = await page.evaluate(() => {
    const body = document.getElementById('settingsBody');
    if (!body) return { error: 'settingsBody missing' };
    const cards = body.querySelectorAll('.scard');
    return {
      cardCount: cards.length,
      titles: [...cards].map(c => c.querySelector('.scard-title')?.textContent),
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      canScroll: body.scrollHeight > body.clientHeight,
    };
  });
  console.log(`  settings cards:`, cardsState);
  if (cardsState.cardCount < 5) bug('B', `Expected at least 5 setting cards, got ${cardsState.cardCount}`, cardsState);

  await page.close();
}

// ─── Scenario C: User on iPhone Safari opens detail sheet ──
async function scenarioC() {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('jobary.jobs.v1', JSON.stringify([{id:1,title:"Test CSM",company:"Test Co",location:"Casa",type:"CDI",score:88,source:"LinkedIn",url:"https://x",summary:"…",matchKw:["CSM"],missingKw:["SaaS"],salary:"40-60k",status:"new",firstSeen:Date.now(),lastSeen:Date.now()}]));
  });
  await page.goto('http://localhost:1403/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => window.sel(1));
  await new Promise(r => setTimeout(r, 500));

  const detailState = await page.evaluate(() => {
    const wrap = document.getElementById('dpWrap');
    const dp = wrap?.querySelector('.dp');
    const back = wrap?.querySelector('.dp-back');
    const foot = wrap?.querySelector('.dp-foot');
    if (!dp) return { error: 'no .dp rendered' };
    return {
      wrapHasOpen: wrap.classList.contains('open'),
      dpRect: dp.getBoundingClientRect(),
      backTopPos: back?.getBoundingClientRect().top,
      footBottomPos: foot ? window.innerHeight - foot.getBoundingClientRect().bottom : null,
      footVisible: foot ? foot.getBoundingClientRect().bottom <= window.innerHeight : null,
    };
  });
  console.log(`  detail sheet on iOS UA:`, detailState);
  if (detailState.error) bug('C', detailState.error);
  if (detailState.foot && !detailState.footVisible) bug('C', 'Detail footer with primary CTAs invisible below screen on iOS', detailState);

  await page.close();
}

// ─── Scenario D: User scans many times, JOBS grows ──
async function scenarioD() {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    const many = [];
    for (let i = 0; i < 60; i++) many.push({id:i+1,title:'Job '+i,company:'Co '+i,location:'Casa',type:'CDI',score:50+i%50,source:['LinkedIn','Rekrute','Emploi.ma'][i%3],url:'https://x'+i,summary:'…',matchKw:['CSM'],missingKw:[],salary:'40-60k',status:i%3===0?'new':'adapted',firstSeen:Date.now()-i*3600000,lastSeen:Date.now()});
    localStorage.setItem('jobary.jobs.v1', JSON.stringify(many));
  });
  await page.goto('http://localhost:1403/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  // Check that all 60 cards rendered
  const cardCount = await page.evaluate(() => document.querySelectorAll('.jcard').length);
  console.log(`  rendered cards with 60 jobs:`, cardCount);
  if (cardCount < 60) bug('D', `Expected 60 cards, got ${cardCount}`);
  await page.close();
}

await scenarioA();
await scenarioB();
await scenarioC();
await scenarioD();

await browser.close();
console.log(`\n\n===== BUGS FOUND: ${bugs.length} =====`);
bugs.forEach((b,i) => console.log(`${i+1}. [${b.scenario}] ${b.what}`));
