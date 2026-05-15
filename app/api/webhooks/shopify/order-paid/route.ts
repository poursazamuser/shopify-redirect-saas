import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || ''
    const shopDomain = req.headers.get('x-shopify-shop-domain') || ''

    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ''
    if (!secret) {
      console.warn('SHOPIFY_WEBHOOK_SECRET not set')
    } else {
      const secretKey = secret.match(/^[0-9a-f]{64}$/i)
        ? Buffer.from(secret, 'hex')
        : secret

      const digest = createHmac('sha256', secretKey)
        .update(rawBody, 'utf8')
        .digest('base64')

      const hmacBuffer = Buffer.from(hmacHeader)
      const digestBuffer = Buffer.from(digest)

      if (
        hmacBuffer.length !== digestBuffer.length ||
        !timingSafeEqual(hmacBuffer, digestBuffer)
      ) {
        console.error('[Webhook] Invalid HMAC — header:', hmacHeader, 'digest:', digest)
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    const order = JSON.parse(rawBody)
    console.log('[Webhook] Order received:', order.id, 'shop:', shopDomain)

    const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const { data: destShop } = await supabaseAdmin
      .from('shops')
      .select('user_id')
      .eq('shop_domain', cleanDomain)
      .eq('role', 'destination')
      .single()

    const userId = destShop?.user_id || null
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

    if (checkoutToken && userId) {
      await supabaseAdmin
        .from('redirections')
        .update({ status: 'completed' })
        .eq('checkout_token', checkoutToken)
        .eq('user_id', userId)
        .eq('status', 'pending')
    }

    console.log('[Webhook] Order saved:', order.id)
    return new NextResponse('OK', { status: 200 })
  } catch (err) {
    console.error('[Webhook] Error:', err)
    return new NextResponse('OK', { status: 200 })
  }
}
