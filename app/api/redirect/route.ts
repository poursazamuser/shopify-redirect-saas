import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAccessToken } from '@/lib/shopify'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      items,
      shop_domain,
      click_ids = {},
      page_url,
    } = body as {
      items: { variant_id: string; quantity: number }[]
      shop_domain: string
      click_ids?: Record<string, string>
      page_url?: string
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Panier vide' }, { status: 400, headers: CORS_HEADERS })
    }

    const cleanDomain = (shop_domain ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()

    const { data: sourceShop } = await supabaseAdmin
      .from('shops')
      .select('id, user_id')
      .eq('shop_domain', cleanDomain)
      .eq('role', 'source')
      .single()

    if (!sourceShop) {
      console.error('[Redirect] Source shop not found for domain:', cleanDomain)
      return NextResponse.json({ error: 'Boutique source non trouvée' }, { status: 404, headers: CORS_HEADERS })
    }

    const { data: destShop } = await supabaseAdmin
      .from('shops')
      .select('id, shop_domain, client_id, client_secret')
      .eq('user_id', sourceShop.user_id)
      .eq('role', 'destination')
      .single()

    if (!destShop) {
      return NextResponse.json({ error: 'Boutique destination non configurée' }, { status: 404, headers: CORS_HEADERS })
    }

    // Mapping variantes
    const sourceVariantIds = items.map(i => String(i.variant_id))
    const { data: mappings } = await supabaseAdmin
      .from('product_mappings')
      .select('variant_id_source, variant_id_destination')
      .eq('user_id', sourceShop.user_id)
      .in('variant_id_source', sourceVariantIds)

    if (!mappings || mappings.length === 0) {
      console.error('[Redirect] No mappings found for variants:', sourceVariantIds)
      return NextResponse.json({ error: 'Aucun mapping trouvé' }, { status: 404, headers: CORS_HEADERS })
    }

    const mappingDict = Object.fromEntries(mappings.map(m => [m.variant_id_source, m.variant_id_destination]))

    const destItems = items
      .filter(i => mappingDict[String(i.variant_id)])
      .map(i => ({ variant_id: parseInt(mappingDict[String(i.variant_id)], 10), quantity: i.quantity }))

    if (destItems.length === 0) {
      return NextResponse.json({ error: 'Aucun produit mappé' }, { status: 404, headers: CORS_HEADERS })
    }

    const token = await getAccessToken(destShop.shop_domain, destShop.client_id, destShop.client_secret)
    if (!token) {
      return NextResponse.json({ error: 'Auth boutique destination impossible' }, { status: 502, headers: CORS_HEADERS })
    }

    const checkoutRes = await fetch(
      `https://${destShop.shop_domain}/admin/api/2024-01/checkouts.json`,
      {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout: { line_items: destItems } }),
      }
    )

    if (!checkoutRes.ok) {
      const errText = await checkoutRes.text()
      console.error('[Redirect] Checkout creation failed:', checkoutRes.status, errText)
      return NextResponse.json({ error: 'Erreur création checkout Shopify' }, { status: 502, headers: CORS_HEADERS })
    }

    const { checkout } = await checkoutRes.json()

    if (!checkout?.web_url) {
      return NextResponse.json({ error: 'URL de checkout non reçue' }, { status: 502, headers: CORS_HEADERS })
    }

    // Stocker la redirection avec les click IDs
    await supabaseAdmin.from('redirections').insert({
      user_id: sourceShop.user_id,
      items_source: items,
      items_destination: destItems,
      checkout_url: checkout.web_url,
      checkout_token: checkout.token ?? null,
      click_ids: click_ids,   // ← stocké pour le webhook
      status: 'pending',
    })

    return NextResponse.json({ checkoutUrl: checkout.web_url }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('[Redirect] Unexpected error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500, headers: CORS_HEADERS })
  }
}
