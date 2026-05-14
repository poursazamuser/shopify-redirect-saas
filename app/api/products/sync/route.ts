import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getAccessToken } from '@/lib/shopify'

// POST /api/products/sync – Synchronise les produits depuis les 2 boutiques
export async function POST(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: shops, error: shopsErr } = await supabaseAdmin
    .from('shops')
    .select('id, shop_domain, client_id, client_secret, role')
    .eq('user_id', session.userId)

  if (shopsErr || !shops || shops.length < 2) {
    return NextResponse.json(
      { error: 'Les deux boutiques doivent être connectées avant la synchronisation.' },
      { status: 400 }
    )
  }

  const results: Record<string, number> = {}

  for (const shop of shops) {
    // Générer un token frais via client_credentials
    const token = await getAccessToken(shop.shop_domain, shop.client_id, shop.client_secret)
    if (!token) {
      console.error(`[Sync] Token generation failed for ${shop.shop_domain}`)
      results[shop.role] = 0
      continue
    }

    // Supprimer les anciens produits pour ce shop (full refresh)
    await supabaseAdmin.from('products').delete().eq('shop_id', shop.id)

    let total = 0
    // Première URL — PAS de ?page=N, utiliser la pagination curseur Shopify
    let nextUrl: string | null =
      `https://${shop.shop_domain}/admin/api/2024-01/products.json?limit=250&status=active`

    while (nextUrl) {
      const res = await fetch(nextUrl, {
        headers: { 'X-Shopify-Access-Token': token },
      })

      if (!res.ok) {
        const body = await res.text()
        console.error(
          `[Sync] Shopify API error for ${shop.shop_domain}: ${res.status} — ${body}`
        )
        break
      }

      const json = await res.json()
      const shopifyProducts: ShopifyProduct[] = json.products || []

      if (shopifyProducts.length === 0) break

      // Aplatir les variantes
      const rows = []
      for (const product of shopifyProducts) {
        const imageUrl = product.images?.[0]?.src ?? null
        for (const variant of product.variants) {
          rows.push({
            shop_id: shop.id,
            shopify_product_id: String(product.id),
            shopify_variant_id: String(variant.id),
            title: product.title,
            variant_title:
              variant.title !== 'Default Title' ? variant.title : null,
            image_url: imageUrl,
            price: variant.price,
          })
        }
      }

      if (rows.length > 0) {
        const { error: insertErr } = await supabaseAdmin
          .from('products')
          .upsert(rows, { onConflict: 'shop_id,shopify_variant_id' })
        if (insertErr) {
          console.error('[Sync] Insert error:', insertErr)
        } else {
          total += rows.length
        }
      }

      // Pagination curseur : extraire l'URL "next" du header Link
      // Format : <https://...?page_info=xxx>; rel="next"
      nextUrl = parseLinkHeader(res.headers.get('link'))
    }

    results[shop.role] = total
  }

  return NextResponse.json({ success: true, synced: results })
}

// GET /api/products/sync – Retourne les produits synchronisés des 2 boutiques
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: shops } = await supabaseAdmin
    .from('shops')
    .select('id, role')
    .eq('user_id', session.userId)

  if (!shops || shops.length === 0) return NextResponse.json({ products: [] })

  const shopIds = shops.map(s => s.id)
  const roleMap = Object.fromEntries(shops.map(s => [s.id, s.role]))

  const { data: products } = await supabaseAdmin
    .from('products')
    .select('*')
    .in('shop_id', shopIds)
    .order('title', { ascending: true })

  const enriched = (products || []).map(p => ({
    ...p,
    role: roleMap[p.shop_id],
  }))

  return NextResponse.json({ products: enriched })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse le header Link Shopify et retourne l'URL de la page suivante.
 * Format : <https://...?page_info=xxx>; rel="next", <...>; rel="previous"
 */
function parseLinkHeader(linkHeader: string | null): string | null {
  if (!linkHeader) return null

  const parts = linkHeader.split(',')
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/)
    if (match && match[2] === 'next') {
      return match[1]
    }
  }
  return null
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyVariant {
  id: number
  title: string
  price: string
}

interface ShopifyProduct {
  id: number
  title: string
  variants: ShopifyVariant[]
  images: { src: string }[]
}
