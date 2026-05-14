import type { NextConfig } from 'next'

const nextConfig = {
  allowedHosts: [
    'shopify-redirect-saas-production.up.railway.app',
    'localhost',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.shopify.com',
      },
      {
        protocol: 'https',
        hostname: '**.shopifycdn.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
} as NextConfig

export default nextConfig
