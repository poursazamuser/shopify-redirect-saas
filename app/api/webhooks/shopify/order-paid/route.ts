import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { fireAllConversions, type PixelConfig } from '@/lib/conversions'

const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? ''

export async function POST(req: NextRequest) {
  // ── Vérification HMAC ───────────────────────────────────────────────────────
  const rawBody = await req.text()
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256') ?? ''

  const digest = createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64')

  const trusted = Buffer.from(digest)
  const received = Buffer.from(hmacHeader)

  if (
    trusted.length !== received.length ||
    !timingSafeEqual(trusted, received)
  ) {
    console.error('[Webhook] HMAC mismatch')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse de la commande ────────────────────────────────────────────────────
  let order: {
    id: number
    checkout_token?: string
    total_price: string
    currency: string
    landing_site?: string
  }

  try {
    order = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const shopDomain = req.headers.get('x-shopify-shop-domain') ?? ''

  // ── Trouver la boutique destination ────────────────────────────────────────
  const { data: destShop } = await supabaseAdmin
    .from('shops')
    .select('id, user_id')
    .eq('shop_domain', shopDomain)
    .eq('role', 'destination')
    .single()

  if (!destShop) {
    console.warn('[Webhook] Destination shop not found for:', shopDomain)
    return NextResponse.json({ ok: true }) // on répond 200 à Shopify quand même
  }

  const userId = destShop.user_id
  const amount = parseFloat(order.total_price)
  const currency = order.currency
  const orderId = String(order.id)

  // ── Enregistrer la commande ─────────────────────────────────────────────────
  await supabaseAdmin.from('orders').insert({
    user_id: userId,
    shopify_order_id: orderId,
    amount,
    currency,
    checkout_token: order.checkout_token ?? null,
  })

  // ── Retrouver la redirection associée (pour les click IDs) ─────────────────
  let clickIds: Record<string, string> = {}
  let pageUrl: string | undefined

  if (order.checkout_token) {
    const { data: redirection } = await supabaseAdmin
      .from('redirections')
      .select('id, click_ids')
      .eq('checkout_token', order.checkout_token)
      .eq('user_id', userId)
      .single()

    if (redirection) {
      clickIds = (redirection.click_ids as Record<string, string>) ?? {}

      // Marquer la redirection comme complétée
      await supabaseAdmin
        .from('redirections')
        .update({ status: 'completed' })
        .eq('id', redirection.id)
    }
  }

  // ── Charger les pixels configurés ──────────────────────────────────────────
  const { data: pixels } = await supabaseAdmin
    .from('pixels')
    .select('platform, pixel_id, access_token')
    .eq('user_id', userId)

  if (pixels && pixels.length > 0) {
    const userIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
    const userAgent = req.headers.get('user-agent') ?? ''

    await fireAllConversions(pixels as PixelConfig[], {
      orderId,
      amount,
      currency,
      clickIds: {
        fbclid: clickIds.fbclid,
        gclid: clickIds.gclid,
        ttclid: clickIds.ttclid,
        ScCid: clickIds.ScCid,
      },
      userAgent,
      ip: userIp,
      pageUrl,
    })
  }

  return NextResponse.json({ ok: true })
}
