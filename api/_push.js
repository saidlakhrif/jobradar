// Web Push helper — wraps web-push library, plus KV-backed subscription storage.
import webpush from 'web-push';

// Public key embedded — used by the browser to subscribe (it's not secret).
export const VAPID_PUBLIC = 'BCYM5Y-Hx0ugfX4cdMc-fQSFKE6z_LWSaIeh0RGum6xpXJXvlyDzy1__BCkV6p4GT5DJF7e-G0oIpwlZqyd5U4E';
// Private key MUST come from env. Falls back to the dev key for local testing.
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'zkLeQ61qj6Bdj4RLhfZqyymHcZ4baFkgaipixCMu53k';
const VAPID_CONTACT = process.env.VAPID_CONTACT || 'mailto:said.lakhrif@gmail.com';

webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC, VAPID_PRIVATE);

// ── Subscription storage (Vercel KV in prod, in-memory in dev) ──────────────
const memStore = new Set();

async function kvCall(path, body) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return null;
  const res = await fetch(`${url}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return null;
  return res.json();
}

export async function loadSubscriptions() {
  const r = await kvCall('/get/jobary:push_subs');
  if (r?.result) {
    try { return JSON.parse(r.result); } catch { return []; }
  }
  return [...memStore].map(s => JSON.parse(s));
}

export async function saveSubscription(sub) {
  const key = JSON.stringify(sub);
  if (process.env.KV_REST_API_URL) {
    const existing = await loadSubscriptions();
    if (!existing.some(s => s.endpoint === sub.endpoint)) {
      existing.push(sub);
      await kvCall(`/set/jobary:push_subs`, existing);
    }
  } else {
    memStore.add(key);
  }
}

export async function removeSubscription(endpoint) {
  if (process.env.KV_REST_API_URL) {
    const existing = await loadSubscriptions();
    const filtered = existing.filter(s => s.endpoint !== endpoint);
    if (filtered.length !== existing.length) await kvCall(`/set/jobary:push_subs`, filtered);
  } else {
    for (const k of memStore) {
      try { if (JSON.parse(k).endpoint === endpoint) memStore.delete(k); } catch {}
    }
  }
}

// ── Send a notification to all subscribers ──────────────────────────────────
export async function sendToAll(payload) {
  const subs = await loadSubscriptions();
  if (subs.length === 0) return { sent: 0, failed: 0 };
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const results = await Promise.allSettled(subs.map(sub =>
    webpush.sendNotification(sub, body, { TTL: 24 * 3600, urgency: 'normal' })
  ));
  let sent = 0, failed = 0, gone = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') sent++;
    else {
      failed++;
      const status = r.reason?.statusCode;
      if (status === 410 || status === 404) gone.push(subs[i].endpoint);
    }
  });
  for (const ep of gone) await removeSubscription(ep);
  return { sent, failed, expired: gone.length };
}
