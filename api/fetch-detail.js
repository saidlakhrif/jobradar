// Fetch the full job description from a source URL (LinkedIn / Rekrute / Emploi.ma).
// The listing scrapers only get a short summary; this endpoint pulls the full text on demand.
import * as cheerio from 'cheerio';
import { fetchHtml } from './_scrapers.js';
import { readJsonBody } from './_profile.js';

const norm = (s) => (s || '').replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

function extractByHost(html, url) {
  const $ = cheerio.load(html);
  let text = '';

  if (url.includes('linkedin.com')) {
    // LinkedIn public job page: description is in .show-more-less-html__markup
    text = $('.show-more-less-html__markup, .description__text, .description__text--rich, [data-test-job-description] .description').first().text();
    if (!text) text = $('section.description, section[class*="description"]').first().text();
  } else if (url.includes('rekrute.com')) {
    // Rekrute job page: structured content under .col-md-9 > .info-offre
    const parts = [];
    $('h2, h3').each((_, h) => {
      const $h = $(h);
      const title = norm($h.text());
      if (/Description|Mission|Profil|Compétences|Conditions|Avantages|Offre/i.test(title)) {
        let chunk = '';
        let next = $h.next();
        let safety = 0;
        while (next.length && !next.is('h1, h2, h3') && safety++ < 30) {
          chunk += '\n' + norm(next.text());
          next = next.next();
        }
        if (chunk.trim()) parts.push(`${title}\n${chunk.trim()}`);
      }
    });
    if (parts.length) text = parts.join('\n\n');
    else text = $('.info-offre, .col-md-9, article, main').first().text();
  } else if (url.includes('emploi.ma')) {
    // Emploi.ma job page: .field-name-body or .group-right > .field
    text = $('.field-name-body, .job-description, .field--name-body, .post-body, article .field').first().text();
    if (!text) text = $('article, main').first().text();
  } else {
    // Generic fallback
    text = $('[itemprop="description"], .job-description, .description, article, main').first().text();
  }

  // Strip nav/footer noise via length filter — paragraphs only
  text = norm(text);
  if (text.length > 6000) text = text.slice(0, 6000) + '…';
  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let url;
  try {
    const body = await readJsonBody(req);
    url = body.url;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'URL invalide' });

  try {
    const html = await fetchHtml(url, { 'Accept-Language': 'fr-FR,fr,en;q=0.9' });
    const description = extractByHost(html, url);
    if (!description || description.length < 80) {
      return res.status(200).json({ description: null, error: 'Description introuvable sur cette page' });
    }
    res.status(200).json({ description });
  } catch (e) {
    console.error('[fetch-detail]', e.message);
    res.status(500).json({ error: e.message });
  }
}
