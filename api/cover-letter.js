import { PROFILE, callClaude, readJsonBody } from './_profile.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let job;
  try {
    const body = await readJsonBody(req);
    job = body.job;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!job) return res.status(400).json({ error: 'Job requis' });

  const prompt = `Tu es expert en lettres de motivation pour le marché de l'emploi marocain et francophone. Rédige une LM pour ce candidat ciblant cette offre.

PROFIL DU CANDIDAT :
${PROFILE}

OFFRE CIBLE :
Poste : ${job.title}
Entreprise : ${job.company}
Localisation : ${job.location}
Description : ${job.summary}
Mots-clés présents : ${(job.matchKw || []).join(', ')}
Mots-clés manquants à intégrer : ${(job.missingKw || []).join(', ')}

Génère une lettre de motivation structurée en 4 blocs nommés EXACTEMENT comme ci-dessous, dans cet ordre, avec ces titres en majuscules entre triples crochets. RIEN d'autre : pas de notes, pas de compteurs, pas de "[Vérification...]", pas d'annotations.

[[OBJET]]
Candidature au poste de [intitulé exact du poste cible, sans le nom de l'entreprise]

[[ACCROCHE]]
[2-3 phrases percutantes. Montre que tu connais ${job.company} (secteur, contexte au Maroc, défi métier que l'offre suggère). Pas de "Je vous écris pour postuler" — accroche directe et engagée.]

[[POURQUOI MOI]]
[4-5 phrases denses. Cite 2 à 3 réalisations CHIFFRÉES issues du parcours (TESSI 4 CSMs, FedEx Hub Worldwide, CGI 250 agents, Crédit Mutuel 350 agents, YNNA 1M clients) qui correspondent EXACTEMENT aux exigences de l'offre. Utilise les mots-clés de l'offre. Évite "je pense que" / "il me semble" — sois affirmatif.]

[[MOTIVATION]]
[2-3 phrases : pourquoi ${job.company} maintenant, ce que tu veux y construire / apporter, quel impact à 6-12 mois. Doit sonner spécifique à cette entreprise, pas générique.]

[[FORMULE]]
[1 phrase courte de clôture pro : "Je serai ravi d'échanger plus en détail lors d'un entretien. [Formule]." Pas plus.]

CONTRAINTES GLOBALES :
- Français impeccable, accents complets (é, è, à, ç, ù, ô…)
- Ton : confiant, factuel, sans complaisance, sans flagornerie
- Aucun bullet point, aucune liste — uniquement de la prose fluide
- Total cible : 280-340 mots (ce qui fait ~1 page A4 standard)
- INTERDIT : nom du candidat, adresse, téléphone, email (ils sont déjà dans l'en-tête généré)
- INTERDIT : "[Vérification]", "= NN ✓", "(NN mots)" ou toute annotation
- INTERDIT : nom de l'entreprise dans l'OBJET (l'objet doit être générique : juste le poste)`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const apiRes = await callClaude({ prompt, stream: true });
    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
          }
        } catch {}
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Cover letter error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}
