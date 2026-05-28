export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    version: '2.0',
    apiKey: process.env.ANTHROPIC_API_KEY ? '✓ configurée' : '✗ manquante',
    timestamp: new Date().toISOString(),
  });
}
