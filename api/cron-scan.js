// Daily cron: scrape all sources, score with Claude, dedup vs last run, email digest.
// Triggered by Vercel Crons (cf. vercel.json "crons"). Can also be invoked manually.

import { PROFILE, callClaude } from './_profile.js';
import { scrapeAll } from './_scrapers.js';
import { sendDigestEmail } from './_email.js';
import { sendToAll } from './_push.js';

const MIN_SCORE = parseInt(process.env.MIN_SCORE || '70', 10);

// Default profile config — used by cron since there's no browser to read localStorage from
const DEFAULT_KW = ['Customer Success Manager','Delivery Manager','Service Delivery Manager','CX Manager','Head of Customer Success'];
const DEFAULT_CITIES = ['Casablanca','Rabat'];

// ─── Dedup storage (optional, via Vercel KV if env vars present) ────────────
// Without KV, the cron sends all top-scored offers daily — may include re-sends.
// With KV configured, we fingerprint URLs to only email truly new offers.
async function loadSeenUrls() {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return new Set();
  try {
    const r = await fetch(`${url}/get/jobary:seen`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) return new Set();
    const { result } = await r.json();
    if (!result) return new Set();
    return new Set(JSON.parse(result));
  } catch (e) { console.warn('KV load fail:', e.message); return new Set(); }
}
async function saveSeenUrls(set) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return;
  try {
    // Cap at 1000 entries to keep memory bounded
    const arr = [...set].slice(-1000);
    await fetch(`${url}/set/jobary:seen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(arr),
    });
  } catch (e) { console.warn('KV save fail:', e.message); }
}

export default async function handler(req, res) {
  // Allow manual trigger (any method) + auto-trigger by Vercel (header check)
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const start = Date.now();
    console.log('[cron] starting daily scan');

    // 1) Scrape
    const { jobs: offers, sourcesCount } = await scrapeAll({ keywords: DEFAULT_KW, cities: DEFAULT_CITIES });
    console.log(`[cron] scraped ${offers.length} offers`, sourcesCount);

    if (offers.length === 0) {
      return res.status(200).json({ ok: true, sent: false, reason: 'no offers scraped', sourcesCount });
    }

    // 2) Dedup vs last run
    const seen = await loadSeenUrls();
    const fresh = offers.filter(o => !seen.has(o.url));
    console.log(`[cron] ${fresh.length} fresh after dedup (KV: ${seen.size > 0 ? 'on' : 'off'})`);

    // If KV is on and there's nothing new, skip the email
    if (seen.size > 0 && fresh.length === 0) {
      return res.status(200).json({ ok: true, sent: false, reason: 'no new offers since last scan', totalScraped: offers.length, sourcesCount });
    }

    // 3) Score with Claude (only fresh offers, capped to 25 to control tokens)
    const candidates = (seen.size > 0 ? fresh : offers).slice(0, 25).map((j, i) => ({
      i, title: j.title, company: j.company, location: j.location,
      summary: (j.summary || '').slice(0, 220), source: j.source,
    }));

    const prompt = `Tu es un assistant de matching d'offres d'emploi. Score chaque offre 0-100 selon l'adéquation au profil candidat (15 ans Maroc, CSM/SDM/CX, secteur ESN/BPO/banque/télécom).

PROFIL :
${PROFILE}

OFFRES (${candidates.length}) :
${JSON.stringify(candidates, null, 2)}

Pour chaque offre, donne UNIQUEMENT un tableau JSON :
[{"i":0,"score":85,"matchKw":["...","..."],"missingKw":["..."],"salary":"40-60k MAD/mois"}]

Pas de markdown, pas de texte hors JSON.`;

    let scoring = [];
    try {
      const apiRes = await callClaude({ prompt });
      const data = await apiRes.json();
      const raw = data.content[0].text.trim().replace(/```json|```/g, '').trim();
      scoring = JSON.parse(raw);
    } catch (e) {
      console.error('[cron] scoring failed:', e.message);
      scoring = candidates.map(c => ({ i: c.i, score: 60, matchKw: [], missingKw: [], salary: '' }));
    }

    // 4) Merge + filter by score
    const byIdx = new Map(scoring.map(s => [s.i, s]));
    const scoredJobs = candidates.map((c, idx) => {
      const o = (seen.size > 0 ? fresh : offers)[idx];
      const s = byIdx.get(c.i) || {};
      return {
        title: o.title, company: o.company, location: o.location, type: o.type || 'CDI',
        source: o.source, url: o.url, summary: o.summary || c.summary,
        score: s.score ?? 50, matchKw: s.matchKw || [], missingKw: s.missingKw || [], salary: s.salary || '',
      };
    }).filter(j => j.score >= MIN_SCORE).sort((a, b) => b.score - a.score);

    // 5) Email
    const emailResult = await sendDigestEmail({
      jobs: scoredJobs,
      totalScraped: offers.length,
      sourcesCount,
    });

    // 5b) Push notifications for the top match (≥ 85%)
    let pushResult = { sent: 0 };
    const topMatch = scoredJobs.find(j => j.score >= 85);
    if (topMatch) {
      try {
        const extras = scoredJobs.filter(j => j.score >= 85).length - 1;
        pushResult = await sendToAll({
          title: `🎯 ${topMatch.score}% — ${topMatch.title}`,
          body: `${topMatch.company} · ${topMatch.location}${extras > 0 ? ` (+${extras} autres ≥ 85%)` : ''}`,
          url: '/',
          jobUrl: topMatch.url,
          tag: 'jobary-high-match',
        });
      } catch (e) { console.error('[push]', e.message); }
    }

    // 6) Persist seen URLs (include ALL scraped, not just emailed, to avoid re-emails)
    if (process.env.KV_REST_API_URL) {
      offers.forEach(o => seen.add(o.url));
      await saveSeenUrls(seen);
    }

    const took = ((Date.now() - start) / 1000).toFixed(1);
    return res.status(200).json({
      ok: true,
      took: `${took}s`,
      totalScraped: offers.length,
      freshCount: fresh.length,
      scoredAboveThreshold: scoredJobs.length,
      sourcesCount,
      email: emailResult,
      push: pushResult,
    });
  } catch (err) {
    console.error('[cron] FAIL:', err);
    return res.status(500).json({ error: err.message });
  }
}
