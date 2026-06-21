// Returns live market salary data for a given role from Bayt + Glassdoor Morocco.
// Cached 24h server-side. Used by the frontend when user opens a job detail
// or hovers the salary chip for the first time.
import { readJsonBody } from './_profile.js';
import { fetchMarketData } from './_market.js';
import { estimateSalary } from './_salaries.js';

export default async function handler(req, res) {
  let role, title, company;
  if (req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      title = body.title;
      company = body.company;
      role = body.role;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  } else {
    // Parse query string from raw URL (works in Vercel + dev.js)
    const u = new URL(req.url, 'http://x');
    role = u.searchParams.get('role');
    title = u.searchParams.get('title');
    company = u.searchParams.get('company');
  }

  if (!role && !title) return res.status(400).json({ error: 'role or title required' });

  // If only title is provided, get the canonical role label via estimateSalary
  if (!role && title) {
    const est = estimateSalary({ title, company, currentYear: new Date().getFullYear() });
    role = est?.label || title;
  }

  try {
    const market = await fetchMarketData(role);
    res.status(200).json({ role, ...market });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
