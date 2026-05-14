import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ShopBridge – Redirection Shopify cross-boutiques',
  description: 'Redirigez automatiquement les clients de votre boutique A vers le checkout de votre boutique B avec un mapping de produits intelligent.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
