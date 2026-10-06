/* eslint-disable no-undef */
process.env.NEXT_IGNORE_INCORRECT_LOCKFILE = '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        // Proxy all /api/* requests to the backend during development
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL ?? 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
