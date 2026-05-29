// Email sender via Resend (free tier 3000 emails/month, 100/day).
// Falls back to a no-op log when RESEND_API_KEY missing — keeps the cron working locally.

const APP_URL = process.env.APP_URL || 'https://jobradar-sepia.vercel.app';
const FROM    = process.env.EMAIL_FROM || 'Jobary <onboarding@resend.dev>';
const TO      = process.env.EMAIL_TO   || 'said.lakhrif@gmail.com';

function fmtSalary(s){ return s ? `· ${s}` : ''; }
function colorForScore(n){ return n>=85?'#16A34A':n>=70?'#D97706':'#6B7280'; }

function buildHtml({ jobs, totalScraped, sourcesCount }) {
  const today = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const top = jobs.slice(0, 12);
  const sourcesBadges = Object.entries(sourcesCount||{}).map(([s,n])=>`<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;background:#EDE8DC;color:#3A3F4B;margin-right:4px;">${s} · ${n}</span>`).join('');
  const cards = top.map(j => `
    <tr><td style="padding:10px 0;border-bottom:1px solid #EDE8DC;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:15px;font-weight:700;color:#0D1B3E;line-height:1.3;margin-bottom:2px;">
              <a href="${j.url}" style="color:#0D1B3E;text-decoration:none;">${j.title}</a>
            </div>
            <div style="font-size:12px;color:#6B7280;">${j.company} · ${j.location} ${fmtSalary(j.salary)}</div>
            <div style="margin-top:5px;">
              ${(j.matchKw||[]).slice(0,3).map(k=>`<span style="display:inline-block;font-size:10px;font-weight:500;background:#DCFCE7;color:#166534;padding:2px 7px;border-radius:99px;margin-right:3px;">✓ ${k}</span>`).join('')}
            </div>
          </td>
          <td style="vertical-align:top;text-align:right;width:60px;">
            <div style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:18px;font-weight:800;color:${colorForScore(j.score)};line-height:1;">${j.score}<span style="font-size:11px;opacity:.7;">%</span></div>
            <div style="font-size:9.5px;color:#6B7280;margin-top:2px;text-transform:uppercase;letter-spacing:.04em;">${j.source}</div>
          </td>
        </tr>
        <tr><td colspan="2" style="padding-top:7px;">
          <a href="${j.url}" style="display:inline-block;font-size:11px;font-weight:600;background:#0D1B3E;color:#fff;padding:5px 11px;border-radius:6px;text-decoration:none;margin-right:5px;">Voir l'offre</a>
          <a href="${APP_URL}?focusJob=${encodeURIComponent(j.url)}" style="display:inline-block;font-size:11px;font-weight:600;background:#C9A84C;color:#0D1B3E;padding:5px 11px;border-radius:6px;text-decoration:none;">Adapter mon CV</a>
        </td></tr>
      </table>
    </td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F4EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0D1117;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F4EE;padding:30px 10px;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="600" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(13,27,62,.08);">
      <tr><td style="background:#0D1B3E;padding:20px 26px;color:#fff;">
        <div style="font-size:11px;letter-spacing:.1em;color:#C9A84C;font-weight:700;text-transform:uppercase;">Jobary · Digest du ${today}</div>
        <div style="font-size:24px;font-weight:800;margin-top:5px;">🎯 ${top.length} nouvelle${top.length>1?'s':''} offre${top.length>1?'s':''} pour toi</div>
        <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:5px;">${totalScraped} offres scannées sur Rekrute, Emploi.ma et LinkedIn</div>
        <div style="margin-top:11px;">${sourcesBadges}</div>
      </td></tr>
      <tr><td style="padding:8px 26px 20px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">${cards}</table>
        <div style="text-align:center;margin-top:18px;">
          <a href="${APP_URL}" style="display:inline-block;background:#C9A84C;color:#0D1B3E;padding:10px 22px;border-radius:9px;text-decoration:none;font-weight:700;font-size:13px;">Ouvrir Jobary →</a>
        </div>
      </td></tr>
      <tr><td style="padding:16px 26px;background:#F7F4EE;color:#6B7280;font-size:11px;line-height:1.5;text-align:center;">
        Tu reçois ce mail parce que ton radar Jobary tourne tous les matins.<br>Pour ajuster le seuil de score ou la fréquence, modifie les variables d'env Vercel.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function sendDigestEmail({ jobs, totalScraped, sourcesCount }) {
  const API_KEY = process.env.RESEND_API_KEY;
  const top = jobs.slice(0, 12);
  if (top.length === 0) return { skipped: true, reason: 'no jobs above threshold' };
  if (!API_KEY) return { skipped: true, reason: 'RESEND_API_KEY missing' };

  const subject = `🎯 ${top.length} nouvelle${top.length>1?'s':''} offre${top.length>1?'s':''} ce matin · Jobary`;
  const html = buildHtml({ jobs, totalScraped, sourcesCount });

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0,200)}`);
  return await r.json();
}
