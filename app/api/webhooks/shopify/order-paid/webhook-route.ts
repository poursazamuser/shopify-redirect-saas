import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { sendConversionEvents } from '@/lib/conversions'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || ''

    const { data: destShops } = await supabaseAdmin
      .from('shops')
      .select('user_id, shop_domain, webhook_secret')
      .eq('role', 'destination')

    if (!destShops || destShops.length === 0) {
      console.error('[Webhook] No destination shops found')
      return new NextResponse('OK', { status: 200 })
    }

    let matchedShop = null
    for (const shop of destShops) {
      const secret = shop.webhook_secret || process.env.SHOPIFY_WEBHOOK_SECRET || ''
      if (!secret) continue

      const digest = createHmac('sha256', secret)
        .update(rawBody, 'utf8')
        .digest('base64')

      const hmacBuffer = Buffer.from(hmacHeader, 'base64')
      const digestBuffer = Buffer.from(digest, 'base64')

      if (
        hmacBuffer.length === digestBuffer.length &&
        timingSafeEqual(hmacBuffer, digestBuffer)
      ) {
        matchedShop = shop
        break
      }
    }

    if (!matchedShop) {
      console.error('[Webhook] No shop matched HMAC signature')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const order = JSON.parse(rawBody)
    console.log('[Webhook] Order received:', order.id, 'shop:', matchedShop.shop_domain)

    const checkoutToken = order.checkout_token || null
    const amount = parseFloat(order.total_price || '0')
    const currency = order.currency || 'EUR'
    const email = order.email || null

    const { error } = await supabaseAdmin.from('orders').insert({
      user_id: matchedShop.user_id,
      shopify_order_id: String(order.id),
      amount,
      currency,
      checkout_token: checkoutToken,
    })

    if (error) {
      console.error('[Webhook] Supabase insert error:', error)
    } else {
      console.log('[Webhook] Order inserted:', order.id)
    }

    if (checkoutToken && matchedShop.user_id) {
      await supabaseAdmin
        .from('redirections')
        .update({ status: 'completed' })
        .eq('checkout_token', checkoutToken)
        .eq('user_id', matchedShop.user_id)
        .eq('status', 'pending')
    }

    const { data: pixels } = await supabaseAdmin
      .from('pixels')
      .select('platform, pixel_id, access_token')
      .eq('user_id', matchedShop.user_id)

    if (pixels && pixels.length > 0) {
      await sendConversionEvents(pixels, {
        orderId: String(order.id),
        amount,
        currency,
        email: email ?? undefined,
        checkoutToken: checkoutToken ?? undefined,
      })
    }

    return new NextResponse('OK', { status: 200 })
  } catch (err) {
    console.error('[Webhook] Error:', err)
    return new NextResponse('OK', { status: 200 })
  }
}
