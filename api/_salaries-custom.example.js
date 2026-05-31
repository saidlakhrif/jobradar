// ─── EXEMPLE — table salaires custom (override personnel) ────────────────────
//
// POUR ACTIVER : copie ce fichier vers `api/_salaries-custom.js` et adapte les
// chiffres à TES connaissances du marché (entretiens, réseau RH, négociations
// passées, sources internes…).
//
// Les valeurs ici remplaceront les approximations algorithmiques du modèle
// pour les rôles + niveaux que tu définis. Les multiplicateurs secteur et
// l'inflation annuelle restent appliqués par-dessus.
//
// Format : k MAD BRUT mensuel (avant variable et primes).
// Le label DOIT correspondre exactement au champ `label` dans _salaries.js.
//
// Tout rôle/niveau non défini ici utilise le défaut du modèle.

export const CUSTOM_RANGES = {

  // Exemple : tu sais que les CSM senior chez TESSI/Intelcia sont à 38-55k
  'Customer Success Manager': {
    junior:   { min: 14, max: 22 },
    confirme: { min: 22, max: 38 },
    senior:   { min: 38, max: 55 },
    head:     { min: 55, max: 85 },
  },

  // Exemple : SDM marché tendu actuellement, fourchettes hautes
  'Service Delivery Manager': {
    confirme: { min: 35, max: 55 },
    senior:   { min: 55, max: 80 },
  },

  // Ajoute / retire les niveaux selon ce que tu sais.
  // Tu peux ne définir qu'1 seul niveau, les autres garderont la valeur défaut.
};
