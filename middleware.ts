import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Protect /leads page (redirect to login)
  if (path === '/leads') {
    const token = req.cookies.get('admin_token')?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.redirect(new URL('/leads/login', req.url));
    }
  }

  // Protect /api/leads-admin/* (except login)
  if (path.startsWith('/api/leads-admin') && path !== '/api/leads-admin/login') {
    const token = req.cookies.get('admin_token')?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/leads', '/api/leads-admin/:path*'],
};
