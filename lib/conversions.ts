interface PixelConfig {
  platform: string
  pixel_id: string
  access_token: string
}

interface OrderData {
  orderId: string
  amount: number
  currency: string
  email?: string
  checkoutToken?: string
}

async function sendMeta(pixel: PixelConfig, order: OrderData) {
  const url = `https://graph.facebook.com/v19.0/${pixel.pixel_id}/events?access_token=${pixel.access_token}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: { em: order.email ? [order.email] : [] },
        custom_data: {
          currency: order.currency,
          value: order.amount,
          order_id: order.orderId,
        },
      }],
    }),
  })
  if (!res.ok) throw new Error(`Meta API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function sendTikTok(pixel: PixelConfig, order: OrderData) {
  const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Access-Token': pixel.access_token,
    },
    body: JSON.stringify({
      pixel_code: pixel.pixel_id,
      event: 'PlaceAnOrder',
      timestamp: new Date().toISOString(),
      context: { user: { email: order.email } },
      properties: {
        order_id: order.orderId,
        currency: order.currency,
        value: order.amount,
      },
    }),
  })
  if (!res.ok) throw new Error(`TikTok API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function sendGoogle(pixel: PixelConfig, order: OrderData) {
  const res = await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${pixel.pixel_id}&api_secret=${pixel.access_token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: order.checkoutToken || order.orderId,
        events: [{
          name: 'purchase',
          params: {
            transaction_id: order.orderId,
            value: order.amount,
            currency: order.currency,
          },
        }],
      }),
    }
  )
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`)
}

async function sendSnapchat(pixel: PixelConfig, order: OrderData) {
  const res = await fetch('https://tr.snapchat.com/v2/conversion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pixel.access_token}`,
    },
    body: JSON.stringify({
      pixel_id: pixel.pixel_id,
      event_type: 'PURCHASE',
      event_conversion_type: 'WEB',
      timestamp: Date.now(),
      order_id: order.orderId,
      price: order.amount,
      currency: order.currency,
    }),
  })
  if (!res.ok) throw new Error(`Snapchat API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function sendConversionEvents(pixels: PixelConfig[], order: OrderData) {
  const senders: Record<string, (p: PixelConfig, o: OrderData) => Promise<unknown>> = {
    meta: sendMeta,
    tiktok: sendTikTok,
    google: sendGoogle,
    snapchat: sendSnapchat,
  }

  await Promise.allSettled(
    pixels.map(async (pixel) => {
      const sender = senders[pixel.platform]
      if (!sender) return
      try {
        await sender(pixel, order)
        console.log(`[Pixel] ${pixel.platform} Purchase sent for order ${order.orderId}`)
      } catch (err) {
        console.error(`[Pixel] ${pixel.platform} failed for order ${order.orderId}:`, err)
      }
    })
  )
}
