import { PROFILE, callClaude, readJsonBody } from './_profile.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let job;
  try {
    const body = await readJsonBody(req);
    job = body.job;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
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
    console.error('Adapt error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}
