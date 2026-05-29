export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    version: '2.1',
    apiKey: process.env.ANTHROPIC_API_KEY ? '✓ configurée' : '✗ manquante',
    env: {
      VERCEL: process.env.VERCEL || null,
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME || null,
      RESEND: process.env.RESEND_API_KEY ? '✓' : '✗',
      KV: process.env.KV_REST_API_URL ? '✓' : '✗',
    },
    timestamp: new Date().toISOString(),
  });
}
