import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

let _secret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (_secret) return _secret;
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      'JWT_SECRET environment variable is required. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  if (raw.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for security');
  }
  if (
    raw === 'fallback-secret' ||
    raw === 'secret' ||
    raw.toLowerCase().includes('changeme') ||
    raw.toLowerCase().includes('placeholder')
  ) {
    throw new Error('JWT_SECRET appears to be a default/example value. Use a strong random secret.');
  }
  _secret = new TextEncoder().encode(raw);
  return _secret;
}

// Resolve the bcrypt hash from env. Prefer ADMIN_PASSWORD_HASH_B64 (the hash
// base64-encoded) because a raw "$2b$.." bcrypt hash gets silently mangled to an
// empty string by env loaders that do shell-style "$" expansion — notably Next's
// @next/env / dotenv-expand, even when single-quoted. Base64 has no "$", so it
// survives any loader. Falls back to the raw ADMIN_PASSWORD_HASH where the loader
// preserves it (e.g. values injected directly by a host like Render).
function getAdminHash(): string | undefined {
  const b64 = process.env.ADMIN_PASSWORD_HASH_B64;
  if (b64 && b64.trim()) {
    try {
      const decoded = Buffer.from(b64.trim(), 'base64').toString('utf8').trim();
      if (decoded) return decoded;
    } catch {
      /* malformed base64 — fall through to the raw value */
    }
  }
  const raw = process.env.ADMIN_PASSWORD_HASH;
  return raw && raw.trim() ? raw.trim() : undefined;
}

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  if (username !== process.env.ADMIN_USERNAME) return false;

  const hash = getAdminHash();
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && process.env.ADMIN_PASSWORD && !hash) {
    throw new Error(
      'ADMIN_PASSWORD_HASH required in production. ' +
        'Generate with: node -e "const b=require(\'bcryptjs\'); b.hash(\'your-password\',10).then(h=>console.log(h))" ' +
        '— if your env loader expands "$" (e.g. Next.js .env), set ADMIN_PASSWORD_HASH_B64 to its base64 instead.'
    );
  }

  if (hash) {
    return bcrypt.compare(password, hash);
  }
  if (!isProd && process.env.ADMIN_PASSWORD) {
    return password === process.env.ADMIN_PASSWORD;
  }
  return false;
}

export async function createToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

// Convenience guard for route handlers: is this request carrying a valid admin
// session cookie? Typed structurally so this module needn't import next/server.
export async function isAdminRequest(req: {
  cookies?: { get(name: string): { value: string } | undefined };
}): Promise<boolean> {
  const token = req.cookies?.get('admin_token')?.value;
  return token ? verifyToken(token) : false;
}

// Operator gate for the single-operator Google features (OAuth connect + the
// GA4/GTM checks). PRODUCTION requires a valid admin session so an anonymous
// visitor can't drive the operator's stored Google token. In local development
// there is no untrusted traffic — the operator is the only user on the machine —
// so the gate is open, avoiding a needless admin login just to test locally.
export async function isOperatorRequest(req: {
  cookies?: { get(name: string): { value: string } | undefined };
}): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;
  return isAdminRequest(req);
}
