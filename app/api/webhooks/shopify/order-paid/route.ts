import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/webhooks/shopify/order-paid
// Shopify sends this when an order is paid on the destination store
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || ''
    const shopDomain = req.headers.get('x-shopify-shop-domain') || ''

    // ── HMAC Verification ──────────────────────────────────────────────────────
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ''
    if (!secret) {
      console.warn('SHOPIFY_WEBHOOK_SECRET not set — skipping verification in dev')
    } else {
      const digest = createHmac('sha256', secret)
        .update(rawBody, 'utf8')
        .digest('base64')

      const hmacBuffer = Buffer.from(hmacHeader)
      const digestBuffer = Buffer.from(digest)

      if (
        hmacBuffer.length !== digestBuffer.length ||
        !timingSafeEqual(hmacBuffer, digestBuffer)
      ) {
        console.error('Invalid webhook HMAC signature')
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    const order = JSON.parse(rawBody)

    // ── Find destination shop to get user_id ──────────────────────────────────
    const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const { data: destShop } = await supabaseAdmin
      .from('shops')
      .select('user_id')
      .eq('shop_domain', cleanDomain)
      .eq('role', 'destination')
      .single()

    const userId = destShop?.user_id || null

    // ── Save order ─────────────────────────────────────────────────────────────
    const checkoutToken = order.checkout_token || null
    const amount = parseFloat(order.total_price || '0')
    const currency = order.currency || 'EUR'

    await supabaseAdmin.from('orders').insert({
      user_id: userId,
      shopify_order_id: String(order.id),
      amount,
      currency,
      checkout_token: checkoutToken,
    })

    // ── Update matching redirection status ────────────────────────────────────
    if (checkoutToken && userId) {
      await supabaseAdmin
        .from('redirections')
        .update({ status: 'completed' })
        .eq('checkout_token', checkoutToken)
        .eq('user_id', userId)
        .eq('status', 'pending')
    }

    return new NextResponse('OK', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    // Always return 200 to prevent Shopify from retrying on our errors
    return new NextResponse('OK', { status: 200 })
  }
}
