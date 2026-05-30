import { sendToAll } from './_push.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const result = await sendToAll({
      title: '🎯 Test Jobary',
      body: 'Si tu vois cette notif, tout fonctionne. Le radar te préviendra dès qu\'une offre ≥ 85% est repérée.',
      url: '/',
      tag: 'jobary-test',
    });
    if (result.sent === 0 && result.failed === 0) {
      return res.status(200).json({ sent: 0, error: 'Aucun abonné — active les notifs sur ton appareil d\'abord' });
    }
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
