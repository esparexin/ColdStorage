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
