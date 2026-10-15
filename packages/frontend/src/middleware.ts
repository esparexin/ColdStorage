import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge auth gate (defense-in-depth): unauthenticated browsers are redirected to
 * /login before React renders. Data APIs still enforce authenticate server-side;
 * this only prevents UI structure disclosure for JS-disabled/cached fetches.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }
  const hasRefresh = request.cookies.has('refreshToken');
  if (!hasRefresh) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
