// ─────────────────────────────────────────────────────────────────────────────
// Sources de données salaires Maroc VÉRIFIÉES (scraping live)
//
// 1. BAYT.COM (bayt.com/en/morocco/salaries/jobrole/{cat}/)
//    → moyenne par catégorie de fonction (1 chiffre, tous niveaux confondus)
//    → données réelles déclarées sur la plateforme #1 emploi MENA
//
// 2. GLASSDOOR.COM (Morocco IN162)
//    → distribution percentile P10/P25/P50/P75/P90 par poste précis
//    → données réelles crowd-sourced, échantillon Maroc parfois petit
//    → base pay + total pay (avec variable)
//
// Les 2 sources sont cachées 24h pour éviter le rate-limit et accélérer.
// ─────────────────────────────────────────────────────────────────────────────

import * as cheerio from 'cheerio';
import { fetchHtml } from './_scrapers.js';

const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const _cache = new Map(); // in-memory; serverless instance scoped

function fromCache(key) {
  const v = _cache.get(key);
  if (!v) return null;
  if (Date.now() - v.at > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return v.data;
}
function toCache(key, data) { _cache.set(key, { at: Date.now(), data }); }

// ─── BAYT ───────────────────────────────────────────────────────────────────
// Map our internal role keys to Bayt category slugs
export const BAYT_CATEGORY_MAP = {
  'Customer Success Manager':   'customer-service-call-center',
  'Account Manager':            'sales',
  'Service Delivery Manager':   'information-technology',
  'Chef de Projet':             'management',
  'Program Manager':            'management',
  'CX Manager':                 'customer-service-call-center',
  'Customer Service Manager':   'customer-service-call-center',
  'Operations Manager':         'management',
  'BPO Manager':                'customer-service-call-center',
  'Business Unit Manager':      'management',
  'Responsable Commercial':     'sales',
  'IT Manager':                 'information-technology',
};

export async function fetchBaytAverage(category) {
  const cacheKey = 'bayt:' + category;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const url = `https://www.bayt.com/en/morocco/salaries/jobrole/${category}/`;
  try {
    const html = await fetchHtml(url, { 'User-Agent': UA_BROWSER, 'Accept-Language': 'en-US,en;q=0.9' });
    // Bayt format: "MAD\t12,175" or "MAD 12,175"
    const m = html.match(/MAD[\s\t]*([0-9]{1,3}(?:,[0-9]{3})*)/);
    if (!m) return null;
    const avgMonthly = parseInt(m[1].replace(/,/g, ''), 10);
    if (isNaN(avgMonthly) || avgMonthly < 1000 || avgMonthly > 200000) return null;
    const result = {
      avg: avgMonthly,
      avgK: Math.round(avgMonthly / 1000),
      category,
      source: 'Bayt.com',
      sourceUrl: url,
      sampleNote: 'Moyenne tous niveaux confondus',
    };
    toCache(cacheKey, result);
    return result;
  } catch (e) {
    console.warn('[bayt]', category, e.message);
    return null;
  }
}

// ─── GLASSDOOR ──────────────────────────────────────────────────────────────
const GLASSDOOR_MOROCCO_IN = 162;

// Slugify role for Glassdoor URL path
function glassdoorSlug(role) {
  return role.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function fetchGlassdoorPercentiles(role) {
  const cacheKey = 'gd:' + role.toLowerCase();
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const slug = glassdoorSlug(role);
  // URL format: /Salaries/morocco-{slug}-salary-SRCH_IL.0,7_IN162_KO8,{end}.htm
  const end = 8 + slug.length;
  const url = `https://www.glassdoor.com/Salaries/morocco-${slug}-salary-SRCH_IL.0,7_IN${GLASSDOOR_MOROCCO_IN}_KO8,${end}.htm`;
  try {
    const html = await fetchHtml(url, { 'User-Agent': UA_BROWSER, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' });

    // Parse all "median" values (usually base/total/additional)
    const medians = [...html.matchAll(/"median"\s*:\s*([0-9]+)/g)].map(m => parseInt(m[1], 10));
    // Parse percentile structures — they appear in pairs "percentile":"P_X" + nearby "value":N
    // Simpler: extract all percentile JSON blocks
    const blocks = [...html.matchAll(/"percentile"\s*:\s*"P_(\d+(?:ST|TH|ND|RD))"[^}]*?"value"\s*:\s*([0-9]+)/g)];
    const percentiles = {};
    for (const m of blocks) {
      const pct = parseInt(m[1], 10);
      const val = parseInt(m[2], 10);
      if (val > 500 && val < 500000) {
        // Bayt-style: take min value at each percentile (some pages list multiple types)
        if (!percentiles[pct] || val < percentiles[pct]) percentiles[pct] = val;
      }
    }

    // If we have a P_50 (median) and P_25/P_75, that's enough
    if (!percentiles[50] && medians.length > 0) {
      // Fallback: use first median we found
      const med = Math.min(...medians.filter(v => v > 500 && v < 500000));
      if (med) percentiles[50] = med;
    }

    const p10 = percentiles[10] || percentiles[1];
    const p25 = percentiles[25];
    const p50 = percentiles[50];
    const p75 = percentiles[75];
    const p90 = percentiles[90];

    if (!p50) return null;

    const result = {
      role,
      url,
      source: 'Glassdoor Morocco',
      sampleNote: 'Crowd-sourced, échantillon Maroc',
      p10, p25, p50, p75, p90,
      median: p50,
      medianK: Math.round(p50 / 1000),
      range: (p25 && p75) ? `${Math.round(p25/1000)}-${Math.round(p75/1000)}k MAD/mois (P25-P75)` : `${Math.round(p50/1000)}k MAD/mois (médian)`,
    };
    toCache(cacheKey, result);
    return result;
  } catch (e) {
    console.warn('[glassdoor]', role, e.message);
    return null;
  }
}

// ─── COMBINED: enrich an estimation with live market data ───────────────────
export async function fetchMarketData(roleLabel) {
  const baytCat = BAYT_CATEGORY_MAP[roleLabel];
  const [bayt, gd] = await Promise.all([
    baytCat ? fetchBaytAverage(baytCat) : Promise.resolve(null),
    fetchGlassdoorPercentiles(roleLabel),
  ]);
  return { bayt, glassdoor: gd };
}
