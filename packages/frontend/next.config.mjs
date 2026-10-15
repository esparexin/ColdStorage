/* eslint-disable no-undef */
process.env.NEXT_IGNORE_INCORRECT_LOCKFILE = '1';

// Phase 3 observability: the effective proxy target was previously silent,
// so a missing BACKEND_URL surfaced only as a hung-until-abort refresh.
// Logging once at config load distinguishes "backend down" from "bad creds".
const effectiveBackendUrl = process.env.BACKEND_URL ?? 'http://localhost:4000';
if (!process.env.BACKEND_URL) {
  console.info(`[api-proxy] BACKEND_URL unset, falling back to ${effectiveBackendUrl}`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            // No default-src/script-src: Next.js (dev and prod) relies on inline
            // bootstrap scripts, which 'self'-only would block and leave the app
            // unhydrated. Keep clickjacking/object/form/image protections only.
            value:
              "frame-ancestors 'none'; img-src 'self' https://res.cloudinary.com data:; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Proxy all /api/* requests to the backend during development
        source: '/api/:path*',
        destination: `${effectiveBackendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
