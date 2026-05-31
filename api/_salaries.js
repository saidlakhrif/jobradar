// Référence salaires Maroc — sources publiques :
//   Rekrute Étude de Rémunération 2024-2025
//   Michael Page Maroc Étude de Rémunération 2024
//   Hays Morocco Salary Guide 2024
//   Glassdoor Morocco (cross-check)
//
// IMPORTANT : tous les chiffres sont en k MAD BRUT mensuel (salaire de base hors variable)
// Le NET représente environ 75-80% du brut au Maroc (IR + CNSS + AMO + retraite).
//
// Le code ajuste automatiquement selon :
//   - Année actuelle vs année de l'étude (inflation Maroc ~4%/an composé)
//   - Secteur de l'entreprise (multiplicateur appliqué sur le base range)
//   - Niveau d'expérience détecté depuis le titre + description

export const SALARY_STUDY_YEAR = 2024;
export const YEARLY_INFLATION = 0.04; // 4% par an au Maroc (HCP 2020-2024 moyenne)
export const SALARY_BASIS = 'BRUT mensuel (hors variable et primes)';

// ── Base ranges by role (BRUT k MAD/mois — Rekrute 2024 + Michael Page) ────
// Valeurs conservatrices, vérifiées vs Glassdoor Morocco
export const SALARY_REF = [
  // ─── Customer Success / Account Management ───
  {
    label: 'Customer Success Manager',
    patterns: [/\bcustomer success manager\b/i, /\bcsm\b/i, /\bcustomer success\b/i],
    ranges: {
      junior:   { min: 13, max: 20 },   // 1-3 ans
      confirme: { min: 20, max: 32 },   // 4-7 ans
      senior:   { min: 32, max: 50 },   // 8-12 ans (Team Lead)
      head:     { min: 50, max: 80 },   // Head of CS / VP / Director
    }
  },
  {
    label: 'Account Manager',
    patterns: [/\bkey account manager\b/i, /\baccount manager\b/i, /\bkam\b/i, /\bresponsable comptes?\b/i, /\bgrands? comptes?\b/i],
    ranges: {
      junior:   { min: 12, max: 20 },
      confirme: { min: 20, max: 35 },
      senior:   { min: 35, max: 50 },
      head:     { min: 45, max: 70 },
    }
  },

  // ─── Service Delivery / Project Management ───
  {
    label: 'Service Delivery Manager',
    patterns: [/\bservice delivery manager\b/i, /\bservice delivery\b/i, /\bsdm\b/i, /\bdelivery manager\b/i],
    ranges: {
      junior:   { min: 22, max: 32 },
      confirme: { min: 32, max: 50 },
      senior:   { min: 50, max: 75 },
      head:     { min: 65, max: 100 },
    }
  },
  {
    label: 'Chef de Projet',
    patterns: [/\bchef de projet\b/i, /\bproject manager\b/i, /\bpmo\b/i, /\bproject lead\b/i],
    ranges: {
      junior:   { min: 15, max: 25 },
      confirme: { min: 25, max: 40 },
      senior:   { min: 40, max: 60 },
      head:     { min: 55, max: 85 },
    }
  },
  {
    label: 'Program Manager',
    patterns: [/\bprogram manager\b/i, /\bprogramme manager\b/i, /\bdirecteur de programme\b/i],
    ranges: {
      junior:   { min: 25, max: 38 },
      confirme: { min: 38, max: 58 },
      senior:   { min: 58, max: 85 },
      head:     { min: 75, max: 115 },
    }
  },

  // ─── CX / Customer Experience ───
  {
    label: 'CX Manager',
    patterns: [/\bcx manager\b/i, /\bcustomer experience manager\b/i, /\bdirecteur de l'?expérience client\b/i, /\bexpérience client\b/i],
    ranges: {
      junior:   { min: 18, max: 28 },
      confirme: { min: 28, max: 45 },
      senior:   { min: 45, max: 65 },
      head:     { min: 60, max: 90 },
    }
  },
  {
    label: 'Customer Service Manager',
    patterns: [/\bcustomer service manager\b/i, /\bresponsable service client\b/i, /\bcustomer service\b/i],
    ranges: {
      junior:   { min: 13, max: 20 },
      confirme: { min: 20, max: 32 },
      senior:   { min: 32, max: 48 },
      head:     { min: 45, max: 70 },
    }
  },

  // ─── Operations / BPO Management ───
  {
    label: 'Operations Manager',
    patterns: [/\boperations manager\b/i, /\bops manager\b/i, /\bresponsable opérations?\b/i, /\boperations? director\b/i],
    ranges: {
      junior:   { min: 18, max: 28 },
      confirme: { min: 28, max: 45 },
      senior:   { min: 45, max: 68 },
      head:     { min: 60, max: 95 },
    }
  },
  {
    label: 'BPO Manager',
    patterns: [/\bbpo manager\b/i, /\bcontact center manager\b/i, /\bcall center manager\b/i, /\bcentre de relation client\b/i],
    ranges: {
      junior:   { min: 16, max: 25 },
      confirme: { min: 25, max: 40 },
      senior:   { min: 40, max: 60 },
      head:     { min: 55, max: 85 },
    }
  },
  {
    label: 'Business Unit Manager',
    patterns: [/\bbusiness unit manager\b/i, /\bbu manager\b/i, /\bsite manager\b/i, /\bplant manager\b/i],
    ranges: {
      junior:   { min: 28, max: 40 },
      confirme: { min: 40, max: 65 },
      senior:   { min: 65, max: 95 },
      head:     { min: 80, max: 120 },
    }
  },

  // ─── Sales / Commercial ───
  {
    label: 'Responsable Commercial',
    patterns: [/\bresponsable commercial\b/i, /\bdirecteur commercial\b/i, /\bsales director\b/i, /\bsales manager\b/i],
    ranges: {
      junior:   { min: 15, max: 25 },
      confirme: { min: 25, max: 45 },
      senior:   { min: 45, max: 68 },
      head:     { min: 60, max: 95 },
    }
  },

  // ─── IT Management ───
  {
    label: 'IT Manager',
    patterns: [/\bit manager\b/i, /\bresponsable it\b/i, /\bresponsable informatique\b/i, /\bdsi\b/i, /\bcto\b/i],
    ranges: {
      junior:   { min: 22, max: 35 },
      confirme: { min: 35, max: 55 },
      senior:   { min: 55, max: 85 },
      head:     { min: 75, max: 120 },
    }
  },
];

// ── Sector multipliers ─────────────────────────────────────────────────────
export const SECTOR_MULT = {
  international:  1.28,  // Multinationales (P&G, Coca, Nestlé, JTI…)
  banking:        1.20,  // Banques, assurances
  telecom:        1.12,  // Inwi, Maroc Telecom, Orange Business
  esn_bpo:        1.00,  // Capgemini, CGI, TESSI, Webhelp, Intelcia (baseline)
  retail:         0.95,  // Marjane, Carrefour, Décathlon, Label'Vie
  startup:        0.95,  // Tech startups (souvent equity en plus)
  public:         0.88,  // OCP, RAM, parapublic
  default:        1.00,
};

export function detectSector(company) {
  const c = (company || '').toLowerCase();
  if (/attijari|bmce|bcp|cih|sgma|société générale|crédit du maroc|barid bank|al barid|wafa|cdg\b|finéa/i.test(c)) return 'banking';
  if (/\binwi\b|maroc telecom|orange (business|services|business services|maroc)|méditel/i.test(c)) return 'telecom';
  if (/procter|coca|nestl[eé]|p&g|unilever|jti|danone|l'oréal|microsoft|cisco|oracle|sap|deloitte|kpmg|\bey\b|pwc|accenture|ibm|bosch|siemens|stellantis|renault group|psa/i.test(c)) return 'international';
  if (/capgemini|cgi\b|tessi|webhelp|intelcia|sopra|atos|sii|alten|altran|sqli|talan|akkodis|niit|hcl/i.test(c)) return 'esn_bpo';
  if (/marjane|carrefour|décathlon|hyper|aswak|label.vie|bim\b|pico|kazyon/i.test(c)) return 'retail';
  if (/\bocp\b|royal air maroc|\bram\b|onee|ona\b|caisse de dépôt|onda|adm\b|anapec|cnss|cnops/i.test(c)) return 'public';
  return 'default';
}

// ── Level detection from title + description ───────────────────────────────
export function detectLevel(title, description = '') {
  const t = (title + ' ' + description).toLowerCase();
  // Head/Director level
  if (/\bhead of\b|\bdirector\b|\bdirecteur\b|\bvp\b|\bvice[\- ]?président\b|\bchief\b|\bcco\b|\bcfo\b|\bcto\b|\bceo\b/i.test(t)) return 'head';
  // Senior level
  if (/\bsenior\b|\bsr\.?\b|\bprincipal\b|\blead\b|\bexpert\b|\bconfirmé\s+sénior\b|10\s*\+\s*ans|>\s*10\s*ans/i.test(t)) return 'senior';
  // Junior level
  if (/\bjunior\b|\bjr\.?\b|\bdébutant\b|0\s*[-à]\s*2\s*ans|2\s*[-à]\s*3\s*ans|\bstagiaire\b|\battribué\b/i.test(t)) return 'junior';
  return 'confirme'; // 5-10 ans, default for cadres
}

// ── Main estimator ─────────────────────────────────────────────────────────
export function estimateSalary({ title, company, description, currentYear }) {
  const t = (title || '').toLowerCase();
  const ref = SALARY_REF.find(r => r.patterns.some(p => p.test ? p.test(t) : t.includes(p)));
  if (!ref) return null;

  const level = detectLevel(title, description);
  const range = ref.ranges[level] || ref.ranges.confirme;
  const sector = detectSector(company);
  const sectorMult = SECTOR_MULT[sector] || 1;

  const year = currentYear || new Date().getFullYear();
  const yearsSinceStudy = Math.max(0, year - SALARY_STUDY_YEAR);
  const inflationMult = Math.pow(1 + YEARLY_INFLATION, yearsSinceStudy);

  const min = Math.round(range.min * sectorMult * inflationMult);
  const max = Math.round(range.max * sectorMult * inflationMult);

  return {
    min, max,
    label: ref.label,
    level, sector,
    studyYear: SALARY_STUDY_YEAR,
    yearsSinceStudy,
    inflationPct: Math.round((inflationMult - 1) * 100),
    sectorMult,
    basis: SALARY_BASIS,
    source: 'estimated',
    formatted: `${min}-${max}k MAD brut/mois`,
  };
}

// ── Parse explicit salary from job description text ───────────────────────
// Recognizes: "25 000 DH", "25k MAD", "25-40k MAD", "25000 dirhams", "entre 30 et 50 k"
const SAL_PATTERNS = [
  // 25-40k MAD or 25 à 40 k MAD
  /(\d{1,3})\s*[\-–à]\s*(\d{1,3})\s*[kK]?\s*(?:MAD|DH|dh|dirhams?|درهم)/g,
  // 25000-40000 MAD (without k)
  /(\d{2,3}[\s.,]?\d{3})\s*[\-–à]\s*(\d{2,3}[\s.,]?\d{3})\s*(?:MAD|DH|dh|dirhams?|درهم)/g,
  // 40k MAD (single value, treat as upper bound, infer lower as 80%)
  /(\d{1,3})\s*[kK]\s*(?:MAD|DH|dh|dirhams?|درهم)/g,
  // 40000 MAD (single value without k)
  /(\d{2,3}[\s.,]?\d{3})\s*(?:MAD|DH|dh|dirhams?|درهم)/g,
];

export function parseSalaryFromDescription(text) {
  if (!text) return null;
  // Skip text mentioning "chiffre d'affaires" / "CA de X MAD" — those aren't salaries
  const cleaned = text.replace(/chiffre d'?affaires?[^\n.]*\d+[^\n.]*(?:MAD|DH|dh)/gi, '');

  for (const re of SAL_PATTERNS) {
    re.lastIndex = 0;
    const matches = [...cleaned.matchAll(re)];
    for (const m of matches) {
      let min = parseInt(m[1].replace(/[\s.,]/g, ''));
      let max = m[2] ? parseInt(m[2].replace(/[\s.,]/g, '')) : min;
      // Normalize : si > 200, c'est en DH bruts, convertir en k
      if (min > 200) min = Math.round(min / 1000);
      if (max > 200) max = Math.round(max / 1000);
      // Si une seule valeur, on infère une fourchette ±15%
      if (min === max) { min = Math.round(min * 0.85); }
      // Sanity check : salaire mensuel cadre Maroc plausible
      if (min >= 8 && min <= 200 && max >= 8 && max <= 200 && max >= min) {
        return {
          min, max,
          source: 'announced',
          formatted: `${min === max ? min : min + '-' + max}k MAD/mois`,
        }; // 'mois' sans 'brut' — on ne sait pas si l'annonce le précise
      }
    }
  }
  return null;
}
