import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow images from Shopify CDN
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
  // Required for webhook raw body parsing
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

export default nextConfig
