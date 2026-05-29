export const PROFILE = `
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

export async function callClaude({ prompt, stream = false, system = '' }) {
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY missing');

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 4500,
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

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
