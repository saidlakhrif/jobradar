import { PROFILE, callClaude, readJsonBody } from './_profile.js';
import { scrapeAll } from './_scrapers.js';
import { estimateSalary } from './_salaries.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { keywords = ['Customer Success Manager'], cities = ['Casablanca'] } = await readJsonBody(req);

    // 1) Scrape real offers from Rekrute + Emploi.ma + LinkedIn
    const { jobs: offers, sourcesCount } = await scrapeAll({ keywords, cities });

    if (offers.length === 0) {
      return res.status(200).json({
        success: true, jobs: [], sourcesCount,
        warning: 'Aucune offre trouvée. Les sources bloquent peut-être les IPs serverless — réessaie en local (npm run dev).',
      });
    }

    // 2) Trim payload sent to Claude (keep top 25 most informative)
    const candidates = offers.slice(0, 25).map((j, i) => ({
      i,
      title: j.title,
      company: j.company,
      location: j.location,
      summary: (j.summary || '').slice(0, 220),
      source: j.source,
    }));

    // 3) Ask Claude to SCORE only — not to invent
    const prompt = `Tu es un assistant de matching d'offres d'emploi. Voici le profil candidat puis une liste d'offres scrapées sur Rekrute, Indeed et Google.

PROFIL CANDIDAT :
${PROFILE}

OFFRES À SCORER (${candidates.length}) :
${JSON.stringify(candidates, null, 2)}

Pour chaque offre, calcule :
- score : entier 0-100 reflétant l'adéquation au profil (15 ans Maroc CSM/SDM/CX, secteur ESN/BPO/banque/télécom)
- matchKw : 3-5 mots-clés du profil que l'offre couvre
- missingKw : 1-3 compétences attendues qu'on ne voit pas dans le profil
- salary : estimation fourchette en MAD/mois (ex "40-55k MAD/mois") basée sur le poste et le secteur au Maroc

Réponds UNIQUEMENT avec un tableau JSON, même format que ci-dessous, dans le même ordre que l'entrée, et avec le même "i" :
[
  { "i": 0, "score": 85, "matchKw": ["...","..."], "missingKw": ["..."], "salary": "..." }
]
Pas de markdown, pas de backtick, pas de texte avant/après.`;

    let scoring = [];
    try {
      const apiRes = await callClaude({ prompt });
      const data = await apiRes.json();
      const raw = data.content[0].text.trim().replace(/```json|```/g, '').trim();
      scoring = JSON.parse(raw);
    } catch (e) {
      console.error('[scoring]', e.message);
      scoring = candidates.map((c) => ({ i: c.i, score: 50, matchKw: [], missingKw: [], salary: '' }));
    }

    // 4) Merge scoring into the offers + compute salary estimate from reference table
    const currentYear = new Date().getFullYear();
    const byIndex = new Map(scoring.map((s) => [s.i, s]));
    const jobs = candidates.map((c, idx) => {
      const o = offers[idx];
      const s = byIndex.get(c.i) || {};
      // Try the reference table first; fall back to Claude's estimate if not matched
      const ref = estimateSalary({ title: o.title, company: o.company, description: o.summary, currentYear });
      let salary = '';
      let salaryMeta = null;
      if (ref) {
        salary = ref.formatted;
        salaryMeta = {
          source: 'estimated',
          provider: 'Rekrute/Michael Page',
          studyYear: ref.studyYear,
          inflationPct: ref.inflationPct,
          sector: ref.sector,
          level: ref.level,
          label: ref.label,
        };
      } else if (s.salary) {
        salary = s.salary;
        salaryMeta = { source: 'estimated', provider: 'Claude (rôle non référencé)' };
      }
      return {
        title: o.title,
        company: o.company,
        location: o.location,
        type: o.type || 'CDI',
        score: s.score ?? 50,
        source: o.source,
        url: o.url,
        summary: o.summary || c.summary,
        matchKw: s.matchKw || [],
        missingKw: s.missingKw || [],
        salary, salaryMeta,
      };
    });

    jobs.sort((a, b) => b.score - a.score);

    res.status(200).json({ success: true, jobs, sourcesCount, totalScraped: offers.length });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
