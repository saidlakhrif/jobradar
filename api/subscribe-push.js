import { saveSubscription, removeSubscription, sendToAll, VAPID_PUBLIC } from './_push.js';
import { readJsonBody } from './_profile.js';

export default async function handler(req, res) {
  // GET → return public key (frontend uses it to subscribe)
  if (req.method === 'GET') {
    return res.status(200).json({ publicKey: VAPID_PUBLIC });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  // Subscribe
  if (req.method === 'POST') {
    const sub = body?.subscription;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Subscription required' });
    try {
      await saveSubscription(sub);
      // Send a confirmation notification right away
      await sendToAll({
        title: '🎯 Jobary activé',
        body: 'Tu recevras une notification quand le radar trouve une offre ≥ 85% qui matche.',
        url: '/'
      }).catch(() => {});
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Unsubscribe
  if (req.method === 'DELETE') {
    const endpoint = body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    try { await removeSubscription(endpoint); return res.status(200).json({ ok: true }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
