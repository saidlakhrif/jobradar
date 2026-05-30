// CV Builder — parse adapted text from Claude, inject into cv-template.html,
// render to a PDF Blob via html2pdf, and offer download + Google Drive upload.

const ESC = s => (s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// Strip Claude's self-annotations that sometimes leak into bullets:
//   "(60 c)", "= 65 ✓", "[241 caractères]", "✓", "(✓)", "/70", etc.
const STRIP_ANNOTATIONS = s => (s || '')
  .replace(/\s*[\(\[]?\s*=?\s*\d{1,3}\s*(?:c|car|chars?|caract[eè]res?|\/\s*\d{1,3})?\s*[\)\]✓]\s*$/i, '')
  .replace(/\s*[\(\[]\s*\d{1,3}\s*(?:c|car|chars?|caract[eè]res?)\s*[\)\]]\s*$/gi, '')
  .replace(/\s*[✓✔]\s*$/g, '')
  .replace(/\s*\(\s*✓\s*\)\s*$/g, '')
  .trim();

const _templateCache = {};
async function loadTemplate(name) {
  if (_templateCache[name]) return _templateCache[name];
  const r = await fetch(name, { cache: 'no-store' });
  _templateCache[name] = await r.text();
  return _templateCache[name];
}

// Strip whole verification/decompte blocks Claude sometimes inserts.
// Examples it produces:
//   [Vérification caractères :
//     Pilotage ... = 60 ✓
//     ...]
//   [Décompte: 250 caractères]
//   [Note: 4 lignes]
function stripVerificationBlocks(text) {
  if (!text) return text;
  // Drop multi-line bracketed blocks whose first line starts with Vérif/Décompte/Note/Total/Recompte
  text = text.replace(/\[\s*(?:V[ée]rification|D[ée]compte|Note|Total|Recompte|Compte)[^\]]*\][\s\S]*?(?:\]|$)/gi, '');
  // Just in case the closing ] was lost — also drop any standalone "Vérification..." line
  text = text.replace(/^\s*\[?\s*(?:V[ée]rification|D[ée]compte|Recompte|Compte)\s+caract[èe]res?\s*:?\s*\]?\s*$/gim, '');
  // Drop bare "= NN ✓" trailing-stat lines
  text = text.replace(/^.*=\s*\d{1,3}\s*[✓✔].*$/gm, '');
  return text;
}

// Parse the structured text Claude returns (TITRE DU CV / RÉSUMÉ / TESSI / FEDEX / COMPÉTENCES / NOM DU FICHIER)
export function parseAdaptedCV(text) {
  text = stripVerificationBlocks(text);
  const out = { title: '', summary: '', tessi: [], fedex: [], skills: [], filename: '' };
  let sec = '';
  for (const raw of (text || '').split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    if (/^TITRE DU CV/i.test(l))          { sec = 'title';   continue; }
    if (/^R[ÉE]SUM[ÉE]/i.test(l))         { sec = 'summary'; continue; }
    if (/^TESSI/i.test(l))                { sec = 'tessi';   continue; }
    if (/^FEDEX/i.test(l))                { sec = 'fedex';   continue; }
    if (/^COMP[ÉE]TENCES/i.test(l))       { sec = 'skills';  continue; }
    if (/^NOM DU FICHIER|^CV_SAID/i.test(l)) { sec = 'filename'; }

    if (sec === 'title')        out.title += (out.title ? ' ' : '') + l;
    else if (sec === 'summary') out.summary += (out.summary ? ' ' : '') + l;
    else if (sec === 'tessi')   out.tessi.push(STRIP_ANNOTATIONS(l.replace(/^[•\-▸*]\s*/, '')));
    else if (sec === 'fedex')   out.fedex.push(STRIP_ANNOTATIONS(l.replace(/^[•\-▸*]\s*/, '')));
    else if (sec === 'skills')  out.skills.push(...l.split(/[,;·]/).map(s => STRIP_ANNOTATIONS(s.trim())).filter(Boolean));
    else if (sec === 'filename'){
      const m = l.match(/CV_SAID_LAKHRIF_[A-Z0-9_]+/);
      if (m) out.filename = m[0];
    }
  }
  out.title = STRIP_ANNOTATIONS(out.title);
  out.summary = STRIP_ANNOTATIONS(out.summary);
  out.tessi = out.tessi.filter(Boolean);
  out.fedex = out.fedex.filter(Boolean);
  return out;
}

// Remove the target company name from a string (safety net if Claude slips it into the title)
function stripCompanyFromTitle(title, company) {
  if (!title || !company) return title || '';
  const co = company.trim();
  if (!co) return title;
  // Build a flexible regex catching: "| Company", "- Company", "— Company", "chez Company", "pour Company", "@ Company", " - Company"
  const coEsc = co.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\s*[\\|\\-–—@/]+\\s*${coEsc}\\s*$`, 'i'),
    new RegExp(`\\s*\\b(?:chez|pour|@)\\s+${coEsc}\\s*$`, 'i'),
    new RegExp(`\\s*\\(\\s*${coEsc}\\s*\\)\\s*$`, 'i'),
  ];
  let cleaned = title;
  for (const re of patterns) cleaned = cleaned.replace(re, '');
  return cleaned.trim() || title;
}

function fill(template, parsed, jobMeta) {
  const tessiLis = (parsed.tessi.length ? parsed.tessi : ['Pilotage CSM IT, portefeuille stratégique RUN, SLA, NPS/CSAT']).map(b => `<li>${ESC(b)}</li>`).join('');
  const fedexLis = (parsed.fedex.length ? parsed.fedex : ['Stratégie CX Maroc, NPS/CSAT, gouvernance B2B/B2C']).map(b => `<li>${ESC(b)}</li>`).join('');
  const rawRole = parsed.title || `${jobMeta?.title || 'Service Delivery Manager'} · CSM IT`;
  const role = stripCompanyFromTitle(rawRole, jobMeta?.company);
  const summary = parsed.summary || 'Manager expérimenté avec 15 ans en gestion de services IT, relation client B2B/B2C et pilotage de prestations.';

  // For the Design template: a styled extra skills block in the sidebar
  const skillsBlock = parsed.skills.length ? `
    <div class="skill-cat" style="color:#E8C97A;">Pour ${ESC((jobMeta?.company || 'cette offre').slice(0,32))}</div>
    <ul class="skill-list">
      ${parsed.skills.slice(0,2).map(s => `<li>${ESC(s)}</li>`).join('')}
    </ul>` : '';

  // For the ATS template: a plain extra-skills line — keyword-rich, no decoration
  const skillsBlockAts = parsed.skills.length ? `
    <p class="skills-row"><strong>Pour ce poste :</strong> ${parsed.skills.slice(0,4).map(s => ESC(s)).join(', ')}</p>` : '';

  return template
    .replace(/\{\{ROLE_TITLE\}\}/g, ESC(role))
    .replace(/\{\{SUMMARY\}\}/g, ESC(summary))
    .replace('{{TESSI_LIS}}', tessiLis)
    .replace('{{FEDEX_LIS}}', fedexLis)
    .replace('{{ADDED_SKILLS_BLOCK}}', skillsBlock)
    .replace('{{ADDED_SKILLS_BLOCK_ATS}}', skillsBlockAts);
}

// Server-side rendering via /api/render-cv-pdf (Edge/Chrome headless).
// Same engine as the reference CV — guarantees identical fonts, colors and 1-page layout.
async function renderToPdfBlob(html /*, filename */) {
  const r = await fetch('/api/render-cv-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error('Render PDF: ' + msg);
  }
  return await r.blob();
}

// ── Cover letter (LM) ────────────────────────────────────────────────────────
// Parse Claude's structured output: [[OBJET]] / [[ACCROCHE]] / [[POURQUOI MOI]] / [[MOTIVATION]] / [[FORMULE]]
export function parseCoverLetter(text) {
  text = stripVerificationBlocks(text);
  const out = { objet: '', accroche: '', pourquoi: '', motivation: '', formule: '' };
  const sections = text.split(/\[\[\s*([A-Z][A-Z\s_ÉÈÀ]+)\s*\]\]/g);
  // sections[0] = preamble (drop), then alternating [name, content, name, content, ...]
  for (let i = 1; i < sections.length; i += 2) {
    const name = (sections[i] || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const content = STRIP_ANNOTATIONS((sections[i+1] || '').replace(/^\s*[\r\n]+/, '').replace(/\s*\n\s*/g, ' ').trim());
    if (/^objet/.test(name))                 out.objet = content;
    else if (/^accroche/.test(name))         out.accroche = content;
    else if (/pourquoi/.test(name))          out.pourquoi = content;
    else if (/^motivation/.test(name))       out.motivation = content;
    else if (/^formule/.test(name))          out.formule = content;
  }
  return out;
}

function fillCoverLetter(template, parsed, jobMeta) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const role = stripCompanyFromTitle(jobMeta?.title || 'Service Delivery Manager', jobMeta?.company);
  return template
    .replace(/\{\{ROLE_TITLE\}\}/g, ESC(role))
    .replace(/\{\{COMPANY\}\}/g, ESC(jobMeta?.company || ''))
    .replace(/\{\{LOCATION\}\}/g, ESC(jobMeta?.location || ''))
    .replace(/\{\{DATE\}\}/g, ESC(today))
    .replace(/\{\{OBJET\}\}/g, ESC(parsed.objet || `Candidature au poste de ${role}`))
    .replace(/\{\{ACCROCHE\}\}/g, ESC(parsed.accroche))
    .replace(/\{\{POURQUOI_MOI\}\}/g, ESC(parsed.pourquoi))
    .replace(/\{\{MOTIVATION\}\}/g, ESC(parsed.motivation))
    .replace(/\{\{FORMULE\}\}/g, ESC(parsed.formule || 'Je vous prie d\'agréer, Madame, Monsieur, l\'expression de mes salutations distinguées.'));
}

export async function buildCoverLetterPdf(coverText, jobMeta) {
  const parsed = parseCoverLetter(coverText);
  const clean = s => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const filename = `LM_SAID_LAKHRIF_${clean(jobMeta?.title)}_${clean(jobMeta?.company)}`;
  const template = await loadTemplate('lm-template.html');
  const html = fillCoverLetter(template, parsed, jobMeta);
  const blob = await renderToPdfBlob(html, filename);
  return { blob, filename, parsed };
}

export async function buildCvPdf(adaptedText, jobMeta, variant = 'design') {
  const parsed = parseAdaptedCV(adaptedText);
  const clean = s => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const base = parsed.filename || `CV_SAID_LAKHRIF_${clean(jobMeta?.title)}_${clean(jobMeta?.company)}`;
  const filename = variant === 'ats' ? base.replace(/^CV_/, 'CV_LT_') : base;
  const templateName = variant === 'ats' ? 'cv-template-ats.html' : 'cv-template.html';
  const template = await loadTemplate(templateName);
  const html = fill(template, parsed, jobMeta);
  const blob = await renderToPdfBlob(html, filename);
  return { blob, filename, parsed };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename + (filename.endsWith('.pdf') ? '' : '.pdf');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ── Google Drive integration (user OAuth via Google Identity Services) ──────
// User stores their own Drive OAuth Client ID + target folder ID in localStorage.

const DRIVE_KEY = 'jobradar.drive.v1';
// Public default Client ID (PUBLIC by design — it identifies the app, not a secret).
// User can override in advanced settings if they want their own.
const DEFAULT_CLIENT_ID = '671415882968-qiueaclokrqgd34r3ipfop0i25svofpu.apps.googleusercontent.com';
export function getDriveCfg() {
  try {
    const cfg = JSON.parse(localStorage.getItem(DRIVE_KEY) || '{}');
    if (!cfg.clientId) cfg.clientId = DEFAULT_CLIENT_ID;
    return cfg;
  } catch { return { clientId: DEFAULT_CLIENT_ID }; }
}
export function setDriveCfg(cfg) {
  localStorage.setItem(DRIVE_KEY, JSON.stringify({ ...getDriveCfg(), ...cfg }));
}

let _gisLoaded = false;
async function loadGIS() {
  if (_gisLoaded) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Google Identity Services failed to load'));
    document.head.appendChild(s);
  });
  _gisLoaded = true;
}

// Returns an access token; prompts the user once, then re-uses it for the session.
let _cachedToken = null;
async function getDriveToken(clientId) {
  if (_cachedToken && _cachedToken.expiry > Date.now() + 30000) return _cachedToken.token;
  await loadGIS();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        _cachedToken = { token: resp.access_token, expiry: Date.now() + (resp.expires_in - 60) * 1000 };
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err.type || 'auth_failed')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export async function uploadToDrive(blob, filename) {
  const cfg = getDriveCfg();
  if (!cfg.clientId) throw new Error('Google Client ID non configuré (Settings → Drive).');
  if (!cfg.folderId) throw new Error('ID du dossier Drive non configuré.');

  const token = await getDriveToken(cfg.clientId);
  const metadata = {
    name: filename.endsWith('.pdf') ? filename : filename + '.pdf',
    parents: [cfg.folderId],
    mimeType: 'application/pdf',
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form,
  });
  if (!r.ok) throw new Error('Drive upload failed: ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
