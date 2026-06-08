// Fail-fast environment validation. Imported by server modules so that
// missing config surfaces at boot instead of as a confusing runtime error
// halfway through a request.

const REQUIRED_ALWAYS = [
  'GEMINI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
];

const REQUIRED_IN_PRODUCTION = [
  'ADMIN_PASSWORD_HASH',
];

// At least one of these must be set in production so we can actually
// deliver email. Either Resend (preferred) or n8n is fine.
const EMAIL_PROVIDERS_ANY = ['RESEND_API_KEY', 'N8N_WEBHOOK_URL'];

let _validated = false;

export function validateEnv(): void {
  if (_validated) return;
  _validated = true;

  // Skip during `next build` — env vars may legitimately not be wired at
  // build time (e.g. on Render where they're injected at runtime).
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const isProd = process.env.NODE_ENV === 'production';
  const missing: string[] = [];

  for (const key of REQUIRED_ALWAYS) {
    if (!process.env[key]) missing.push(key);
  }

  if (isProd) {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) missing.push(`${key} (required in production)`);
    }
    if (process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) {
      missing.push(
        'ADMIN_PASSWORD_HASH (plain-text ADMIN_PASSWORD is not allowed in production)'
      );
    }
    if (!EMAIL_PROVIDERS_ANY.some(k => process.env[k])) {
      missing.push(
        `at least one of ${EMAIL_PROVIDERS_ANY.join(' or ')} (need a way to deliver email)`
      );
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(k => `  - ${k}`).join('\n')}`
    );
  }

  const warnings: string[] = [];
  if (!process.env.RESEND_API_KEY && !process.env.N8N_WEBHOOK_URL) {
    warnings.push('Neither RESEND_API_KEY nor N8N_WEBHOOK_URL set — email delivery will fail');
  } else if (!process.env.RESEND_API_KEY) {
    warnings.push('RESEND_API_KEY not set — emails will go via n8n only');
  }
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    warnings.push('UPSTASH_REDIS_REST_URL not set — rate limiting disabled');
  }
  warnings.forEach(w => console.warn(`⚠ ${w}`));

  console.log('✓ Environment validated');
}
