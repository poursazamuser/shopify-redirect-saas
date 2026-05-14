import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAccessToken } from '@/lib/shopify'

// ── CORS helpers ──────────────────────────────────────────────────────────────
// Le script est chargé sur une boutique Shopify (domaine externe) et appelle
// notre API depuis le navigateur → Cross-Origin → headers CORS obligatoires.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Préflight CORS (navigateur envoie OPTIONS avant le POST)
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// POST /api/redirect – Appelé par le script JS de la boutique A
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { items, shop_domain } = body as {
      items: { variant_id: string; quantity: number }[]
      shop_domain: string
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Panier vide' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const cleanDomain = (shop_domain ?? '')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .toLowerCase()

    // Trouver la boutique source
    const { data: sourceShop } = await supabaseAdmin
      .from('shops')
      .select('id, user_id')
      .eq('shop_domain', cleanDomain)
      .eq('role', 'source')
      .single()

    if (!sourceShop) {
      console.error('[Redirect] Source shop not found for domain:', cleanDomain)
      return NextResponse.json(
        { error: 'Boutique source non trouvée' },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    // Trouver la boutique destination avec ses credentials
    const { data: destShop } = await supabaseAdmin
      .from('shops')
      .select('id, shop_domain, client_id, client_secret')
      .eq('user_id', sourceShop.user_id)
      .eq('role', 'destination')
      .single()

    if (!destShop) {
      return NextResponse.json(
        { error: 'Boutique destination non configurée' },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    // Mapper les variantes source → destination
    const sourceVariantIds = items.map(i => String(i.variant_id))
    const { data: mappings } = await supabaseAdmin
      .from('product_mappings')
      .select('variant_id_source, variant_id_destination')
      .eq('user_id', sourceShop.user_id)
      .in('variant_id_source', sourceVariantIds)

    if (!mappings || mappings.length === 0) {
      console.error('[Redirect] No mappings found for variants:', sourceVariantIds)
      return NextResponse.json(
        { error: 'Aucun mapping trouvé' },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    const mappingDict = Object.fromEntries(
      mappings.map(m => [m.variant_id_source, m.variant_id_destination])
    )

    const destItems = items
      .filter(i => mappingDict[String(i.variant_id)])
      .map(i => ({
        variant_id: parseInt(mappingDict[String(i.variant_id)], 10),
        quantity: i.quantity,
      }))

    if (destItems.length === 0) {
      return NextResponse.json(
        { error: 'Aucun produit mappé' },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    // Token frais pour la boutique destination
    const token = await getAccessToken(
      destShop.shop_domain,
      destShop.client_id,
      destShop.client_secret
    )

    if (!token) {
      return NextResponse.json(
        { error: 'Impossible de s\'authentifier sur la boutique destination' },
        { status: 502, headers: CORS_HEADERS }
      )
    }

    // Créer le checkout sur la boutique B
    const checkoutRes = await fetch(
      `https://${destShop.shop_domain}/admin/api/2024-01/checkouts.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ checkout: { line_items: destItems } }),
      }
    )

    if (!checkoutRes.ok) {
      const errText = await checkoutRes.text()
      console.error('[Redirect] Checkout creation failed:', checkoutRes.status, errText)
      return NextResponse.json(
        { error: 'Erreur création checkout Shopify' },
        { status: 502, headers: CORS_HEADERS }
      )
    }

    const checkoutData = await checkoutRes.json()
    const checkout = checkoutData.checkout

    if (!checkout?.web_url) {
      return NextResponse.json(
        { error: 'URL de checkout non reçue' },
        { status: 502, headers: CORS_HEADERS }
      )
    }

    // Enregistrer la redirection
    await supabaseAdmin.from('redirections').insert({
      user_id: sourceShop.user_id,
      items_source: items,
      items_destination: destItems,
      checkout_url: checkout.web_url,
      checkout_token: checkout.token ?? null,
      status: 'pending',
    })

    return NextResponse.json(
      { checkoutUrl: checkout.web_url },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[Redirect] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
