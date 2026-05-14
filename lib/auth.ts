import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret');

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  if (username !== process.env.ADMIN_USERNAME) return false;
  // Support plain text password via ADMIN_PASSWORD env var
  if (process.env.ADMIN_PASSWORD) {
    return password === process.env.ADMIN_PASSWORD;
  }
  if (!process.env.ADMIN_PASSWORD_HASH) return false;
  return bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
}

export async function createToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}
