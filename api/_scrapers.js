import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TIMEOUT_MS = 12000;

export async function fetchHtml(url, extra = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        ...extra,
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

function matchesKeyword(text, keyword) {
  const t = (text || '').toLowerCase();
  const tokens = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!tokens.length) return true;
  return tokens.some(tok => t.includes(tok));
}

// ── REKRUTE.COM ───────────────────────────────────────────────────────────────
// The keyword param doesn't reliably filter, so we fetch recent listings and filter client-side.
export async function scrapeRekrute({ keyword, city }) {
  const url = 'https://www.rekrute.com/offres-emploi-maroc.html?s=3&p=1';
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const jobs = [];

    $('li.post-id').each((_, el) => {
      const $el = $(el);
      const a = $el.find('a.titreJob').first();
      const rawTitle = norm(a.text());
      if (!rawTitle) return;
      // Title like "Responsable RH Site | Fès (Maroc)" — split.
      const [title, locPart] = rawTitle.split('|').map(s => norm(s));
      const location = (locPart || city || 'Maroc').replace(/\(Maroc\)/i, '').trim();
      let href = a.attr('href') || '';
      if (href.startsWith('/')) href = `https://www.rekrute.com${href}`;
      const company = norm($el.find('img.photo').attr('alt')) || 'Recruteur Rekrute';
      const summary = norm($el.find('.section .text-bleuRk, .info p, .col-sm-10 .section').first().text()).slice(0, 280);

      const combined = `${title} ${summary}`.toLowerCase();
      if (!matchesKeyword(combined, keyword)) return;
      if (city && !location.toLowerCase().includes(city.toLowerCase()) && location !== 'Maroc') return;

      jobs.push({ title, company, location, url: href, source: 'Rekrute', summary, type: 'CDI' });
    });

    return jobs.slice(0, 15);
  } catch (e) {
    console.error('[rekrute]', e.message);
    return [];
  }
}

// ── EMPLOI.MA ─────────────────────────────────────────────────────────────────
export async function scrapeEmploiMa({ keyword, city }) {
  const params = new URLSearchParams({ keywords: keyword });
  if (city) params.set('search[locationKeyword]', city);
  const url = `https://www.emploi.ma/recherche-jobs-maroc?${params.toString()}`;
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const jobs = [];

    $('.card-job').each((_, el) => {
      const $el = $(el);
      const titleA = $el.find('h3 a').first();
      const title = norm(titleA.text()).replace(/\s*-\s*[A-Z][a-zéèàâ-]+$/, '').trim() || norm(titleA.attr('title'));
      if (!title) return;
      let href = $el.attr('data-href') || titleA.attr('href') || '';
      if (href.startsWith('/')) href = `https://www.emploi.ma${href}`;
      const company = norm($el.find('.card-job-company').first().text()) || 'Recruteur Emploi.ma';
      const summary = norm($el.find('.card-job-description p').first().text()).slice(0, 280);
      let location = city || 'Maroc';
      $el.find('li').each((__, li) => {
        const txt = norm($(li).text());
        if (/région/i.test(txt)) location = norm(txt.replace(/^.*?:/i, '')) || location;
      });
      jobs.push({ title, company, location, url: href, source: 'Emploi.ma', summary, type: 'CDI' });
    });

    return jobs.slice(0, 15);
  } catch (e) {
    console.error('[emploi.ma]', e.message);
    return [];
  }
}

// ── LINKEDIN (public guest jobs API) ──────────────────────────────────────────
// LinkedIn may rate-limit serverless IPs; reliable when run locally.
export async function scrapeLinkedIn({ keyword, city }) {
  const loc = city ? `${city}, Morocco` : 'Morocco';
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(loc)}&start=0`;
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const jobs = [];

    $('li').each((_, el) => {
      const $el = $(el);
      const title = norm($el.find('.base-search-card__title').first().text());
      if (!title) return;
      const company = norm($el.find('.base-search-card__subtitle').first().text()) || '—';
      const location = norm($el.find('.job-search-card__location').first().text()) || loc;
      let href = $el.find('a.base-card__full-link').first().attr('href') || '';
      href = href.split('?')[0];
      const dateTxt = norm($el.find('time').attr('datetime') || $el.find('time').text());
      jobs.push({
        title, company, location, url: href, source: 'LinkedIn',
        summary: '', type: 'CDI', posted: dateTxt,
      });
    });

    return jobs.slice(0, 15);
  } catch (e) {
    console.error('[linkedin]', e.message);
    return [];
  }
}

// ── AGGREGATOR ────────────────────────────────────────────────────────────────
export async function scrapeAll({ keywords, cities }) {
  const tasks = [];
  for (const k of keywords) {
    for (const c of cities) {
      tasks.push(scrapeRekrute({ keyword: k, city: c }));
      tasks.push(scrapeEmploiMa({ keyword: k, city: c }));
      tasks.push(scrapeLinkedIn({ keyword: k, city: c }));
    }
  }
  const results = await Promise.allSettled(tasks);
  const all = [];
  const sourcesCount = { Rekrute: 0, 'Emploi.ma': 0, LinkedIn: 0 };
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const j of r.value) {
      all.push(j);
      sourcesCount[j.source] = (sourcesCount[j.source] || 0) + 1;
    }
  }

  // Dedupe by URL, then by title|company (lowercase)
  const seen = new Set();
  const unique = [];
  for (const j of all) {
    const k1 = j.url;
    const k2 = `${j.title.toLowerCase()}|${(j.company || '').toLowerCase()}`;
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1); seen.add(k2);
    unique.push(j);
  }
  return { jobs: unique, sourcesCount };
}
