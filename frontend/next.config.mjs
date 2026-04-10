/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ESLint is run separately; don't block builds with existing component warnings
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8002/api/:path*',
      },
    ]
  },
}

export default nextConfig
