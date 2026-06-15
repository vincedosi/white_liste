/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['maplibre-gl', 'react-map-gl'],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:8020/api/:path*' },
    ];
  },
};

module.exports = nextConfig;
