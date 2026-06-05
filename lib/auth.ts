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

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  if (username !== process.env.ADMIN_USERNAME) return false;

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) {
    throw new Error(
      'ADMIN_PASSWORD_HASH required in production. ' +
        'Generate with: node -e "const b=require(\'bcryptjs\'); b.hash(\'your-password\',10).then(h=>console.log(h))"'
    );
  }

  if (process.env.ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
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
