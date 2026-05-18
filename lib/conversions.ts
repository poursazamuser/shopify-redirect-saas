/**
 * lib/conversions.ts
 * Envoi des événements de conversion vers chaque plateforme publicitaire
 * via leurs Conversions API respectives.
 *
 * En cas d'échec d'une plateforme : on logue et on continue.
 */

export interface ConversionPayload {
  orderId: string
  amount: number        // ex: 49.99
  currency: string      // ex: 'EUR'
  clickIds: {
    fbclid?: string
    gclid?: string
    ttclid?: string
    ScCid?: string
  }
  userAgent?: string
  ip?: string
  pageUrl?: string
}

export interface PixelConfig {
  platform: 'meta' | 'google' | 'tiktok' | 'snapchat'
  pixel_id: string
  access_token: string
}

// ── Meta (Facebook) Conversions API ──────────────────────────────────────────
async function fireMetaConversion(
  pixel: PixelConfig,
  payload: ConversionPayload
): Promise<void> {
  const eventTime = Math.floor(Date.now() / 1000)

  // Format fbc : fb.1.{timestamp_ms}.{fbclid}
  const fbc = payload.clickIds.fbclid
    ? `fb.1.${Date.now()}.${payload.clickIds.fbclid}`
    : undefined

  const userData: Record<string, string> = {}
  if (fbc) userData.fbc = fbc
  if (payload.ip) userData.client_ip_address = payload.ip
  if (payload.userAgent) userData.client_user_agent = payload.userAgent

  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_time: eventTime,
        action_source: 'website',
        event_source_url: payload.pageUrl,
        user_data: userData,
        custom_data: {
          currency: payload.currency,
          value: payload.amount,
          order_id: payload.orderId,
        },
      },
    ],
  }

  const url = `https://graph.facebook.com/v20.0/${pixel.pixel_id}/events?access_token=${pixel.access_token}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Meta CAPI ${res.status}: ${err}`)
  }
}

// ── Google Analytics 4 Measurement Protocol ──────────────────────────────────
// pixel_id   = Measurement ID  (G-XXXXXXXX)
// access_token = API Secret (depuis GA4 Admin → Data Streams → Measurement Protocol API secrets)
async function fireGoogleConversion(
  pixel: PixelConfig,
  payload: ConversionPayload
): Promise<void> {
  // client_id obligatoire — on utilise le gclid ou un fallback
  const clientId = payload.clickIds.gclid ?? `server.${payload.orderId}`

  const body = {
    client_id: clientId,
    events: [
      {
        name: 'purchase',
        params: {
          currency: payload.currency,
          value: payload.amount,
          transaction_id: payload.orderId,
          ...(payload.clickIds.gclid ? { gclid: payload.clickIds.gclid } : {}),
        },
      },
    ],
  }

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${pixel.pixel_id}&api_secret=${pixel.access_token}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  // GA4 MP retourne toujours 204, on vérifie quand même
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google GA4 MP ${res.status}: ${err}`)
  }
}

// ── TikTok Events API ─────────────────────────────────────────────────────────
async function fireTikTokConversion(
  pixel: PixelConfig,
  payload: ConversionPayload
): Promise<void> {
  const body = {
    pixel_code: pixel.pixel_id,
    event: 'PlaceAnOrder',
    event_id: payload.orderId,
    timestamp: new Date().toISOString(),
    context: {
      user_agent: payload.userAgent ?? '',
      ip: payload.ip ?? '',
      page: { url: payload.pageUrl ?? '' },
      ...(payload.clickIds.ttclid ? { ad: { callback: payload.clickIds.ttclid } } : {}),
    },
    properties: {
      currency: payload.currency,
      value: payload.amount,
      order_id: payload.orderId,
    },
  }

  const res = await fetch(
    'https://business-api.tiktok.com/open_api/v1.3/pixel/track/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': pixel.access_token,
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TikTok Events API ${res.status}: ${err}`)
  }

  const data = await res.json()
  if (data.code !== 0) {
    throw new Error(`TikTok Events API error code ${data.code}: ${data.message}`)
  }
}

// ── Snapchat Conversions API ──────────────────────────────────────────────────
async function fireSnapchatConversion(
  pixel: PixelConfig,
  payload: ConversionPayload
): Promise<void> {
  const body = {
    pixel_id: pixel.pixel_id,
    event_type: 'PURCHASE',
    event_conversion_type: 'WEB',
    timestamp_micro: Date.now() * 1000,
    hashed_email: '',    // optionnel (email hashé SHA-256)
    price_micro: Math.round(payload.amount * 1_000_000),
    currency: payload.currency,
    transaction_id: payload.orderId,
    ...(payload.clickIds.ScCid ? { click_id: payload.clickIds.ScCid } : {}),
    ...(payload.ip ? { ip_address: payload.ip } : {}),
    ...(payload.userAgent ? { user_agent: payload.userAgent } : {}),
  }

  const res = await fetch('https://tr.snapchat.com/v2/conversion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pixel.access_token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Snapchat CAPI ${res.status}: ${err}`)
  }
}

// ── Dispatcher principal ──────────────────────────────────────────────────────
/**
 * Fire les conversions vers toutes les plateformes configurées.
 * En cas d'échec d'une plateforme, logue l'erreur et continue.
 */
export async function fireAllConversions(
  pixels: PixelConfig[],
  payload: ConversionPayload
): Promise<void> {
  const dispatchers: Record<string, (p: PixelConfig, d: ConversionPayload) => Promise<void>> = {
    meta: fireMetaConversion,
    google: fireGoogleConversion,
    tiktok: fireTikTokConversion,
    snapchat: fireSnapchatConversion,
  }

  await Promise.allSettled(
    pixels.map(async pixel => {
      const fn = dispatchers[pixel.platform]
      if (!fn) return

      try {
        await fn(pixel, payload)
        console.log(`[Conversions] ✓ ${pixel.platform} fired for order ${payload.orderId}`)
      } catch (err) {
        // Logue l'erreur et continue — ne bloque pas les autres plateformes
        console.error(`[Conversions] ✗ ${pixel.platform} failed for order ${payload.orderId}:`, err)
      }
    })
  )
}
