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

  const prompt = `Tu rédiges une lettre de motivation pour un manager senior marocain. Cible : ton sobre, factuel, naturel, comme l'écrirait un cadre expérimenté de 40 ans. PAS de jargon corporate. PAS de flatterie envers l'entreprise. PAS de phrases creuses du type "votre prestigieuse entreprise", "votre rayonnement", "votre culture d'excellence", "j'admire votre vision". Le lecteur est un DRH expérimenté qui voit passer 100 LM par semaine — il déteste les lèche-bottes.

PROFIL DU CANDIDAT :
${PROFILE}

OFFRE CIBLE :
Poste : ${job.title}
Entreprise : ${job.company}
Localisation : ${job.location}
Description : ${job.summary}
Mots-clés présents : ${(job.matchKw || []).join(', ')}
Mots-clés manquants à intégrer : ${(job.missingKw || []).join(', ')}

Génère la LM en 4 blocs, dans cet ordre, sans rien autour. Aucune annotation, aucune note de relecture.

[[OBJET]]
Candidature au poste de [intitulé exact du poste, sans le nom de l'entreprise]

[[ACCROCHE]]
[2 phrases maximum. Tu commences DIRECTEMENT par parler de la fonction et du contexte métier, pas par "votre entreprise". Exemple de ton : "Le poste de Customer Success Manager que vous ouvrez chez ${job.company} cible exactement le périmètre que je pilote depuis dix ans : portefeuille stratégique, gouvernance SLA et conduite d'équipes offshore." INTERDIT : "Je suis honoré", "Votre entreprise est leader", "Forte de sa réputation".]

[[POURQUOI MOI]]
[3-4 phrases denses qui ALIGNENT le parcours sur l'offre. Tu cites des FAITS chiffrés du candidat (TESSI : équipe de 4 CSMs · FedEx : pilotage CX Maroc B2B/B2C · CGI : 5 comptes, 250 agents · Crédit Mutuel : démarrage plateforme 11 activités 350 agents · YNNA : 1 M clients programme fidélité). Pour chaque fait, montres pourquoi c'est pertinent pour l'offre. Utilise au moins 3 mots-clés exacts de l'offre. INTERDIT : "Je pense", "Il me semble", "Je suis convaincu que" — tu affirmes directement.]

[[MOTIVATION]]
[2 phrases max. Tu expliques pragmatiquement ce que tu veux faire dans ce poste — pas pourquoi l'entreprise est géniale. Exemple de ton : "Rejoindre ${job.company} sur ce poste correspond à mon prochain palier : transposer mon expérience BPO/ESN à un produit SaaS B2B, et accompagner la structuration d'une équipe CSM dans un contexte de croissance." INTERDIT : "J'admire", "Votre projet ambitieux", "Votre engagement".]

[[FORMULE]]
[1 phrase de clôture sobre. Exemple : "Je reste disponible pour échanger sur la façon dont mon parcours peut contribuer à vos enjeux. Cordialement," Pas de "Espérant que ma candidature retiendra toute votre attention".]

CONTRAINTES GLOBALES :
- Français professionnel marocain, accents complets (é, è, à, ç, ù, ô…)
- TON : direct, sobre, comme parle un manager expérimenté, pas un junior qui supplie
- Phrases courtes (15-25 mots max). Pas de phrases-fleuves.
- Prose fluide, aucun bullet point, aucune liste
- Total : 220-280 mots (LM courte = LM lue)
- INTERDIT ABSOLU : "votre entreprise", "votre groupe", "votre établissement" plus de 2 fois. "Vous" sans superlatif.
- INTERDIT : mots flatteurs (prestigieux, rayonnement, excellence, leader, dynamique, ambitieux, innovant) sauf si chiffrés/contextualisés.
- INTERDIT : nom du candidat, contact (déjà dans l'en-tête)
- INTERDIT : "[Vérification]", compteurs, métadonnées entre crochets
- INTERDIT : nom de l'entreprise dans l'OBJET`;

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
