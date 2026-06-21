// Import a single offer by URL: scrape → extract → score → return job object.
// Supports LinkedIn / Rekrute / Emploi.ma natively + generic fallback via Claude.
import * as cheerio from 'cheerio';
import { fetchHtml } from './_scrapers.js';
import { PROFILE, callClaude, readJsonBody } from './_profile.js';
import { estimateSalary, parseSalaryFromDescription } from './_salaries.js';

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

function detectSource(url) {
  if (/linkedin\.com/i.test(url))   return 'LinkedIn';
  if (/rekrute\.com/i.test(url))    return 'Rekrute';
  if (/emploi\.ma/i.test(url))      return 'Emploi.ma';
  if (/anapec\.org/i.test(url))     return 'ANAPEC';
  if (/bayt\.com/i.test(url))       return 'Bayt';
  if (/indeed\./i.test(url))        return 'Indeed';
  if (/welcometothejungle/i.test(url)) return 'Welcome to the Jungle';
  return new URL(url).hostname.replace(/^www\./, '');
}

// ─── Host-specific extractors ───────────────────────────────────────────────
function extractLinkedIn($, html) {
  // LinkedIn public job page
  const title = norm($('h1.top-card-layout__title, h1.topcard__title').first().text());
  const company = norm($('a.topcard__org-name-link, .topcard__org-name-link, .topcard__flavor a').first().text());
  const locationRaw = norm($('.topcard__flavor--bullet, .topcard__flavor:nth-of-type(2)').first().text());
  const location = locationRaw || norm($('span.topcard__flavor:contains(",")').first().text());
  const description = norm(
    $('.show-more-less-html__markup, .description__text, .description__text--rich').first().text()
  );
  const type = norm($('.description__job-criteria-text, li.description__job-criteria-item .description__job-criteria-text').first().text()) || 'CDI';
  return { title, company, location, description, type };
}

function extractRekrute($, html) {
  const title = norm($('h1, h2.titreJob, .titreJob').first().text());
  const company = norm($('.cstr-company-name, .info-recruteur span, .nomSociete').first().text())
                || norm($('a.lib_lien_societe').first().text());
  const location = norm($('.info-poste:contains("Ville"), .info-offre:contains("Ville")').next().text())
                || norm($('[itemprop="addressLocality"]').first().text())
                || 'Casablanca';
  // Description: aggregate all main sections under headings
  const parts = [];
  $('h2, h3, h4').each((_, h) => {
    const t = norm($(h).text());
    if (/Description|Mission|Profil|Compétences|Conditions|Avantages|Offre/i.test(t)) {
      let chunk = '';
      let next = $(h).next();
      let safety = 0;
      while (next.length && !next.is('h1,h2,h3,h4') && safety++ < 30) {
        chunk += '\n' + norm(next.text());
        next = next.next();
      }
      if (chunk.trim()) parts.push(`${t}\n${chunk.trim()}`);
    }
  });
  const description = parts.length ? parts.join('\n\n') : norm($('.info-offre, .col-md-9, article, main').first().text());
  const type = norm($(':contains("Type de contrat"):not(:has(*))').first().text().replace(/.*:\s*/, '')) || 'CDI';
  return { title, company, location, description, type };
}

function extractEmploiMa($, html) {
  const title = norm($('h1.title-job, h1.page-title, h1').first().text());
  const company = norm($('.field-name-field-company a, .field--name-field-company, .company-name').first().text());
  const location = norm($('.field-name-field-location, .location, [itemprop="addressLocality"]').first().text()) || 'Maroc';
  const description = norm(
    $('.field-name-body, .job-description, .field--name-body, article .field').first().text()
  );
  const type = norm($('.field-name-field-contract-type, .contract-type').first().text()) || 'CDI';
  return { title, company, location, description, type };
}

function extractGeneric($, html) {
  // Try OpenGraph + schema.org as a fallback
  const title = norm($('meta[property="og:title"]').attr('content'))
             || norm($('h1, h2').first().text())
             || norm($('title').text());
  const company = norm($('meta[property="og:site_name"]').attr('content')) || '';
  const description = norm($('meta[property="og:description"]').attr('content'))
                   || norm($('[itemprop="description"], .description, article, main p').first().text());
  return { title, company, location: '', description, type: '' };
}

async function extractFromHtml(html, url) {
  const $ = cheerio.load(html);
  if (/linkedin\.com/i.test(url))  return extractLinkedIn($, html);
  if (/rekrute\.com/i.test(url))   return extractRekrute($, html);
  if (/emploi\.ma/i.test(url))     return extractEmploiMa($, html);
  return extractGeneric($, html);
}

// ─── Claude fallback for tough hosts ────────────────────────────────────────
async function claudeExtractStructure(html) {
  // Strip script/style/nav, keep body text
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header').remove();
  const text = norm($('body').text()).slice(0, 8000);

  const prompt = `Extrait les informations clés de cette offre d'emploi en JSON strict (rien d'autre).

PAGE :
${text}

Réponds en JSON exactement comme :
{"title":"…","company":"…","location":"…","type":"CDI/CDD/Stage/Freelance","description":"…"}

Pas d'autres clés, pas de markdown, pas de \`\`\`json. Si une info manque, mets une chaîne vide.`;
  const res = await callClaude({ prompt, stream: false, maxTokens: 1200 });
  const data = await res.json();
  const raw = data?.content?.[0]?.text || '{}';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// ─── Score against profile (same shape as search.js) ────────────────────────
async function scoreJob({ title, company, location, description }) {
  const prompt = `Tu es expert recrutement. Donne un score 0-100 d'adéquation entre ce candidat et cette offre.

CANDIDAT :
${PROFILE}

OFFRE :
Poste : ${title}
Entreprise : ${company}
Lieu : ${location}
Description : ${(description || '').slice(0, 2200)}

Réponds en JSON STRICT (rien d'autre) :
{"score": 0-100, "matchKw": ["mot1","mot2","mot3","mot4","mot5"], "missingKw": ["mot1","mot2","mot3"]}

- matchKw : 4-6 mots-clés/compétences du candidat qui correspondent à l'offre
- missingKw : 2-4 mots-clés de l'offre que le candidat n'a pas explicitement
- score : élevé (80+) si forte correspondance métier+secteur ; moyen (60-79) si correspondance partielle ; faible (<60) sinon`;
  try {
    const res = await callClaude({ prompt, stream: false, maxTokens: 800 });
    const data = await res.json();
    const raw = data?.content?.[0]?.text || '{}';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { score: 50, matchKw: [], missingKw: [] };
    const parsed = JSON.parse(m[0]);
    return {
      score: Math.max(0, Math.min(100, parseInt(parsed.score) || 50)),
      matchKw: Array.isArray(parsed.matchKw) ? parsed.matchKw.slice(0, 6) : [],
      missingKw: Array.isArray(parsed.missingKw) ? parsed.missingKw.slice(0, 4) : [],
    };
  } catch (e) {
    console.warn('[score]', e.message);
    return { score: 50, matchKw: [], missingKw: [] };
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let url;
  try { url = (await readJsonBody(req))?.url; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'URL invalide (doit commencer par http:// ou https://)' });

  try {
    const source = detectSource(url);
    const html = await fetchHtml(url, { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' });
    let base = await extractFromHtml(html, url);

    // If host-specific scraper failed (missing title or description), fall back to Claude extraction
    if (!base.title || (!base.description && !base.company)) {
      try {
        const claudeData = await claudeExtractStructure(html);
        if (claudeData) base = { ...base, ...claudeData };
      } catch {}
    }
    if (!base.title) return res.status(422).json({ error: "Impossible d'extraire l'offre. Vérifie l'URL ou copie-colle la description manuellement." });

    // Score
    const scored = await scoreJob(base);

    // Salary estimate (reference table) + parse announced from description
    const salaryEstimate = estimateSalary({
      title: base.title, company: base.company, description: base.description,
      currentYear: new Date().getFullYear(),
    });
    const announced = parseSalaryFromDescription(base.description);

    const summary = (base.description || '').slice(0, 280);
    const salary = announced ? announced.formatted : (salaryEstimate?.formatted || '');
    const salaryMeta = announced
      ? { source: 'announced', formatted: announced.formatted }
      : salaryEstimate ? {
          source: salaryEstimate.source,
          provider: salaryEstimate.provider,
          studyYear: salaryEstimate.studyYear,
          inflationPct: salaryEstimate.inflationPct,
          sector: salaryEstimate.sector,
          level: salaryEstimate.level,
          label: salaryEstimate.label,
          basis: salaryEstimate.basis,
        } : null;

    const job = {
      title: base.title,
      company: base.company || '—',
      location: base.location || 'Maroc',
      type: base.type || 'CDI',
      source,
      url,
      summary,
      fullDescription: base.description,
      salary, salaryMeta,
      ...scored,
    };

    res.status(200).json({ success: true, job });
  } catch (e) {
    console.error('[import-url]', e);
    res.status(500).json({ error: e.message });
  }
}
