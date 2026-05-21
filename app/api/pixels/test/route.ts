import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

async function testMeta(pixel_id: string, access_token: string): Promise<string> {
  const url = `https://graph.facebook.com/v19.0/${pixel_id}/events?access_token=${access_token}`
  const crypto = await import('crypto')
  const hashedEmail = crypto.createHash('sha256').update('test@example.com').digest('hex')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: {
          em: [hashedEmail],
          client_ip_address: '127.0.0.1',
          client_user_agent: 'Mozilla/5.0',
        },
        custom_data: {
          currency: 'EUR',
          value: 0.01,
        },
      }],
    }),
  })
  const data = await res.json()
  if (data?.error) return `Erreur Meta : ${data.error.message || JSON.stringify(data.error)}`
  if (!res.ok) return `Erreur Meta : ${res.status}`
  return 'ok'
}

async function testTikTok(pixel_id: string, access_token: string): Promise<string> {
  const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Access-Token': access_token },
    body: JSON.stringify({
      event_source: 'web',
      event_source_id: pixel_id,
      data: [{
        event: 'PlaceAnOrder',
        event_time: Math.floor(Date.now() / 1000),
        properties: { order_id: 'test_' + String(Date.now()), currency: 'EUR', value: 0.01 },
      }],
    }),
  })
  const data = await res.json()
  if (data?.code !== 0) return `Erreur TikTok : ${data?.message || res.status}`
  return 'ok'
}

async function testGoogle(pixel_id: string, access_token: string): Promise<string> {
  const res = await fetch(
    `https://www.google-analytics.com/debug/mp/collect?measurement_id=${pixel_id}&api_secret=${access_token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'test_' + Date.now(),
        events: [{ name: 'purchase', params: { transaction_id: 'test', value: 0.01, currency: 'EUR' } }],
      }),
    }
  )
  const data = await res.json()
  const errors = data?.validationMessages?.filter((m: {severity: string}) => m.severity === 'ERROR')
  if (errors?.length > 0) return `Erreur Google : ${errors[0].description}`
  if (!res.ok) return `Erreur Google : ${res.status}`
  return 'warning'
}

async function testSnapchat(pixel_id: string, access_token: string): Promise<string> {
  // Snapchat requires a valid UUID and at least one hashed user identifier
  const crypto = await import('crypto')
  const testEmail = 'test@example.com'
  const hashedEmail = crypto.createHash('sha256').update(testEmail).digest('hex')
  const testUuid = crypto.randomUUID()

  const res = await fetch('https://tr.snapchat.com/v2/conversion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
    body: JSON.stringify({
      pixel_id,
      event_type: 'PURCHASE',
      event_conversion_type: 'WEB',
      timestamp: Math.floor(Date.now() / 1000),
      hashed_email: hashedEmail,
      uuid_c1: testUuid,
      price: '0.01',
      currency: 'EUR',
      transaction_id: 'test_' + Date.now(),
    }),
  })
  const data = await res.json()
  if (data?.status === 'FAILED') return `Erreur Snapchat : ${data?.reason || JSON.stringify(data)}`
  if (!res.ok) return `Erreur Snapchat : ${res.status}`
  return 'ok'
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { platform } = await req.json()

  const { data: pixel } = await supabaseAdmin
    .from('pixels')
    .select('pixel_id, access_token')
    .eq('user_id', session.userId)
    .eq('platform', platform)
    .single()

  if (!pixel) {
    return NextResponse.json({ error: 'Pixel non configuré' }, { status: 404 })
  }

  const testers: Record<string, (id: string, token: string) => Promise<string>> = {
    meta: testMeta,
    tiktok: testTikTok,
    google: testGoogle,
    snapchat: testSnapchat,
  }

  const tester = testers[platform]
  if (!tester) return NextResponse.json({ error: 'Plateforme inconnue' }, { status: 400 })

  try {
    const result = await tester(pixel.pixel_id, pixel.access_token)
    if (result === 'ok') {
      return NextResponse.json({ ok: true, message: '✓ Connexion réussie' })
    } else if (result === 'warning') {
      return NextResponse.json({ ok: true, message: '⚠ Requête envoyée — Google ne permet pas de valider les credentials côté serveur. Vérifiez dans votre tableau de bord GA4.' })
    } else {
      return NextResponse.json({ ok: false, message: result })
    }
  } catch (err) {
    return NextResponse.json({ ok: false, message: `Erreur réseau : ${err}` })
  }
}
