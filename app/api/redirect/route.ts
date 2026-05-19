import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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

    const { data: destShop } = await supabaseAdmin
      .from('shops')
      .select('id, shop_domain')
      .eq('user_id', sourceShop.user_id)
      .eq('role', 'destination')
      .single()

    if (!destShop) {
      return NextResponse.json(
        { error: 'Boutique destination non configurée' },
        { status: 404, headers: CORS_HEADERS }
      )
    }

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
        variant_id: mappingDict[String(i.variant_id)],
        quantity: i.quantity,
      }))

    if (destItems.length === 0) {
      return NextResponse.json(
        { error: 'Aucun produit mappé' },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    // Permalien panier Shopify — aucune API nécessaire
    const cartPath = destItems
      .map(i => `${i.variant_id}:${i.quantity}`)
      .join(',')

    const checkoutUrl = `https://${destShop.shop_domain}/cart/${cartPath}`

    await supabaseAdmin.from('redirections').insert({
      user_id: sourceShop.user_id,
      items_source: items,
      items_destination: destItems,
      checkout_url: checkoutUrl,
      checkout_token: null,
      status: 'pending',
    })

    return NextResponse.json(
      { checkoutUrl },
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
