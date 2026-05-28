import { PROFILE, callClaude, readJsonBody } from './_profile.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { keywords = [], cities = ['Casablanca'] } = await readJsonBody(req);
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

    const apiRes = await callClaude({ prompt });
    const data = await apiRes.json();
    const raw = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    const jobs = JSON.parse(raw);
    res.status(200).json({ success: true, jobs });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
