import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || ''

    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ''
    if (secret) {
      const digest = createHmac('sha256', secret)
        .update(rawBody, 'utf8')
        .digest('base64')

      const hmacBuffer = Buffer.from(hmacHeader, 'base64')
      const digestBuffer = Buffer.from(digest, 'base64')

      if (
        hmacBuffer.length !== digestBuffer.length ||
        !timingSafeEqual(hmacBuffer, digestBuffer)
      ) {
        console.error('[Webhook] Invalid HMAC')
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    const order = JSON.parse(rawBody)
    console.log('[Webhook] Order received:', order.id)

    // Récupérer la boutique destination (indépendamment du domain header)
    const { data: destShop } = await supabaseAdmin
      .from('shops')
      .select('user_id')
      .eq('role', 'destination')
      .single()

    const userId = destShop?.user_id || null
    const checkoutToken = order.checkout_token || null
    const amount = parseFloat(order.total_price || '0')
    const currency = order.currency || 'EUR'

    const { error } = await supabaseAdmin.from('orders').insert({
      user_id: userId,
      shopify_order_id: String(order.id),
      amount,
      currency,
      checkout_token: checkoutToken,
    })

    if (error) {
      console.error('[Webhook] Supabase insert error:', error)
    } else {
      console.log('[Webhook] Order inserted in DB:', order.id)
    }

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
    console.error('[Webhook] Error:', err)
    return new NextResponse('OK', { status: 200 })
  }
}
