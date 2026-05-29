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

  const ORIGINAL_TESSI = [
    "Management, setup et formation d'une équipe offshore de 4 CSMs dédiés aux clients IT/ESN",
    "Pilotage d'un portefeuille stratégique en mode RUN (dématérialisation, éditique, BPO)",
    "Gouvernance SLA, KPI, tableaux de bord et reporting mensuel direction",
    "Animation de la comitologie client : COPIL, COSTRAT, COSUI · gestion des escalades et crises",
    "Représentation de la voix du client (VOC) pour orienter la roadmap service",
  ];
  const ORIGINAL_FEDEX = [
    "Pilotage de la relation client multicanal B2B & B2C — coordination avec le Hub Worldwide FedEx",
    "Définition et mise en œuvre de la stratégie relation client FedEx Maroc",
    "Suivi NPS, CSAT et plans d'amélioration continue · gestion des processus de dédouanement",
  ];

  const prompt = `Tu es expert en rédaction de CV. Tu vas ADAPTER (pas réécrire de zéro) le CV de ce candidat pour une offre précise.

PROFIL CANDIDAT :
${PROFILE}

OFFRE CIBLE :
- Poste : ${job.title}
- Entreprise : ${job.company}
- Description : ${job.summary}
- Mots-clés présents dans le profil : ${(job.matchKw || []).join(', ')}
- Mots-clés manquants à intégrer : ${(job.missingKw || []).join(', ')}

EXPÉRIENCES D'ORIGINE À REFORMULER (ne pas raccourcir, ne pas résumer en 1 ligne) :

TESSI Maroc — bullets d'origine :
${ORIGINAL_TESSI.map((b, i) => `${i + 1}. ${b}`).join('\n')}

FedEx — bullets d'origine :
${ORIGINAL_FEDEX.map((b, i) => `${i + 1}. ${b}`).join('\n')}

RÈGLES STRICTES DE REFORMULATION :
1. Garde EXACTEMENT le même nombre de bullets que l'original (${ORIGINAL_TESSI.length} pour TESSI, ${ORIGINAL_FEDEX.length} pour FedEx).
2. Chaque bullet : UNE SEULE IDÉE, format dense, MAXIMUM 70 caractères (espaces inclus) — c'est crucial, le bullet DOIT tenir sur une seule ligne du CV. Recompte les caractères avant de répondre.
3. Reformule chaque bullet pour intégrer naturellement le vocabulaire de l'offre quand c'est pertinent (mots-clés présents et manquants).
4. Ne supprime PAS de fait concret (chiffres, équipes, comités, outils). Si l'offre n'utilise pas un terme du CV, garde-le quand même.
5. Pas de bullet générique du type "Pilotage CSM IT — portefeuille stratégique RUN, SLA, NPS/CSAT" — INTERDIT (creux). Garde la substance, comprime la forme.
6. Conserve le ton manager senior, factuel, orienté résultats.
7. Pas de bullet qui dépasse 70 caractères — sinon il passe sur 2 lignes et casse la mise en page.
8. INTERDIT : aucun compteur de caractères, aucune annotation, aucun "= 60 ✓", "(65 c)", "(✓)" ou tout autre métadonnée dans le texte des bullets. Le bullet doit être un texte propre, prêt à imprimer, rien d'autre.
9. INTERDIT aussi dans le résumé : pas de "[241 caractères]", pas de balises, pas de checkmarks. Juste le texte final.
10. INTERDIT ABSOLU : tout bloc entre crochets de "[Vérification caractères : ...]" ou "[Décompte : ...]" ou "[Note : ...]" ou "[Total : ...]". Ces blocs ne doivent JAMAIS apparaître dans ta réponse. Si tu veux vérifier, fais-le mentalement, ne l'écris pas.
11. AVANT DE RENVOYER ta réponse, relis-la et SUPPRIME toute ligne contenant "Vérification", "Décompte", "= XX ✓", "(XX c)", "(XX caractères)", ou tout crochet [ ] qui n'est pas un placeholder du format final.

FORMAT DE SORTIE (respecte exactement, chaque section sur ses propres lignes, pas de markdown) :

TITRE DU CV
[1 ligne, intitulé du poste cible adapté au profil. INTERDIT : ne mentionne JAMAIS le nom de l'entreprise cible (${job.company}). Donne uniquement un intitulé de poste générique, ex : "Customer Service Experience Manager — CX & Relation Client B2B". Pas de "| ${job.company}", pas de "chez ${job.company}", pas de "pour ${job.company}".]

RÉSUMÉ PROFESSIONNEL
[STRICT : exactement 3 phrases courtes, 240 à 280 caractères au TOTAL (espaces inclus), pas une de plus. Doit tenir sur 4 lignes maximum dans une colonne de ~125mm en 9pt. Intègre 2-3 mots-clés de l'offre, reste fidèle au parcours 15 ans CSM/SDM/CX. NE DÉPASSE PAS 280 caractères, recompte avant de répondre.]

TESSI — REFORMULÉ
• [bullet 1 reformulé]
• [bullet 2 reformulé]
• [bullet 3 reformulé]
• [bullet 4 reformulé]
• [bullet 5 reformulé]

FEDEX — REFORMULÉ
• [bullet 1 reformulé]
• [bullet 2 reformulé]
• [bullet 3 reformulé]

COMPÉTENCES À AJOUTER
[2 ou 3 mots-clés spécifiques à ce poste, séparés par des virgules]

NOM DU FICHIER CV
CV_SAID_LAKHRIF_[POSTE_EN_MAJUSCULES_AVEC_UNDERSCORES]_[ENTREPRISE_EN_MAJUSCULES]

Réponds en français.`;

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
