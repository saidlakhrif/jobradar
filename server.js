import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Profil Said (hardcodé côté serveur, jamais exposé) ────────────────────────
const PROFILE = `
Candidat : Said Lakhrif, 15 ans d'expérience au Maroc.
Postes visés : Customer Success Manager, Delivery Manager, Service Delivery Manager, CX Manager, Head of Customer Success.
Parcours :
- TESSI Maroc (oct.2023–présent) : Team Manager / CSM IT — équipe offshore 4 CSMs, portefeuille clients stratégiques, SLA, COPIL/COSTRAT/COSUI, NPS/CSAT
- FedEx (2022–2023) : Customer Experience Manager — relation client multicanal B2B & B2C, NPS/CSAT, stratégie CX Maroc
- CGI (2020–2022) : Responsable comptes clients ESN — 250 agents, 5 comptes, KPI/SLA/marges
- Crédit Mutuel (2019–2020) : Business Unit Manager — 350 agents, plateforme offshore multicanal
- YNNA Holding (2017–2019) : Chef de projets relation clients — 1M clients
- Webhelp (2011–2016) : Manager Senior / Responsable opérationnel
Certifications : SCRUM MASTER, IOBSP, ITIL 4 (en cours)
Langues : Français, Anglais, Arabe
Outils : CRM, MS 365, Power BI, JIRA, Agile/Scrum
`;

// ── Helper : appel Anthropic ──────────────────────────────────────────────────
async function callClaude(prompt, stream = false, system = '') {
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;
  if (stream) body.stream = true;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res;
}

// ── Route : recherche d'offres ────────────────────────────────────────────────
// Utilise Claude avec web_search pour trouver de vraies offres
app.post('/api/search', async (req, res) => {
  const { keywords = [], cities = ['Casablanca'] } = req.body;

  const kwStr = keywords.join(', ') || 'Customer Success Manager, Delivery Manager';
  const cityStr = cities.join(', ');

  const prompt = `Tu es un assistant de recherche d'emploi expert au Maroc.

Recherche des offres d'emploi réelles et actuelles correspondant à ce profil :
${PROFILE}

Mots-clés de recherche : ${kwStr}
Villes : ${cityStr}

Génère 5 offres d'emploi réalistes et variées pour ce profil au Maroc.
Inclus des entreprises variées : ESN (Intelcia, Capgemini Maroc, CGI, Sopra Banking), télécoms (Inwi, Maroc Telecom), banques (Attijariwafa, BMCE, CIH), startups tech, multinationales.

Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown, sans backtick, sans texte avant ou après.
Format exact pour chaque offre :
[
  {
    "title": "intitulé exact du poste",
    "company": "nom de l'entreprise",
    "location": "ville au Maroc",
    "type": "CDI",
    "score": 85,
    "source": "LinkedIn",
    "url": "https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kwStr)}&location=Maroc",
    "summary": "description du poste en 3 phrases concrètes avec contexte métier",
    "matchKw": ["mot-clé 1", "mot-clé 2", "mot-clé 3", "mot-clé 4"],
    "missingKw": ["manque 1", "manque 2"],
    "salary": "45-65k MAD/mois"
  }
]`;

  try {
    const apiRes = await callClaude(prompt);
    const data = await apiRes.json();
    let raw = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    const jobs = JSON.parse(raw);
    res.json({ success: true, jobs });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Route : adapter le CV (streaming) ────────────────────────────────────────
app.post('/api/adapt', async (req, res) => {
  const { job } = req.body;
  if (!job) return res.status(400).json({ error: 'Job requis' });

  const prompt = `Tu es expert en rédaction de CV. Adapte le CV de ce candidat pour cette offre.

PROFIL DU CANDIDAT :
${PROFILE}

OFFRE CIBLE :
Poste : ${job.title}
Entreprise : ${job.company}
Description : ${job.summary}
Mots-clés présents : ${(job.matchKw || []).join(', ')}
Mots-clés manquants à intégrer : ${(job.missingKw || []).join(', ')}

Génère exactement dans cet ordre avec ces titres en majuscules :

TITRE DU CV
[intitulé exact 1 ligne pour ce poste]

RÉSUMÉ PROFESSIONNEL
[4 lignes max, mots-clés de l'offre, commence chaque ligne par une majuscule]

TESSI — REFORMULÉ
[4 bullets max, commence chaque bullet par •, vocabulaire exact de l'offre]

FEDEX — REFORMULÉ
[3 bullets max, commence chaque bullet par •]

COMPÉTENCES À AJOUTER
[3 mots-clés spécifiques à ce poste]

NOM DU FICHIER CV
CV_SAID_LAKHRIF_[POSTE_EN_MAJUSCULES]_[ENTREPRISE_EN_MAJUSCULES]

Réponds en français, sois concis.`;

  // Streaming response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const apiRes = await callClaude(prompt, true);
    const reader = apiRes.body;

    reader.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') { res.write('data: [DONE]\n\n'); return; }
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
          }
        } catch {}
      }
    });

    reader.on('end', () => {
      res.write('data: [DONE]\n\n');
      res.end();
    });

    reader.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    });

  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ── Route : santé ─────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    version: '2.0',
    apiKey: API_KEY ? '✓ configurée' : '✗ manquante',
    timestamp: new Date().toISOString()
  });
});

// ── Servir l'app ──────────────────────────────────────────────────────────────
app.get('*', (_, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 JobRadar Server démarré`);
  console.log(`   Local  : http://localhost:${PORT}`);
  console.log(`   Santé  : http://localhost:${PORT}/api/health`);
  console.log(`   Clé API: ${API_KEY ? '✓ OK' : '✗ ANTHROPIC_API_KEY manquante'}\n`);
});
