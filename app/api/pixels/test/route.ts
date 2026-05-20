import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

async function testMeta(pixel_id: string, access_token: string): Promise<string> {
  const url = `https://graph.facebook.com/v19.0/${pixel_id}/events?access_token=${access_token}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: { em: [] },
        custom_data: { currency: 'EUR', value: 0.01, order_id: 'test_' + Date.now() },
      }],
      test_event_code: 'TEST',
    }),
  })
  const data = await res.json()
  if (!res.ok) return `Erreur Meta : ${data?.error?.message || res.status}`
  return 'ok'
}

async function testTikTok(pixel_id: string, access_token: string): Promise<string> {
  const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Access-Token': access_token },
    body: JSON.stringify({
      pixel_code: pixel_id,
      event: 'PlaceAnOrder',
      timestamp: new Date().toISOString(),
      context: {},
      properties: { order_id: 'test_' + Date.now(), currency: 'EUR', value: 0.01 },
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
  return 'ok'
}

async function testSnapchat(pixel_id: string, access_token: string): Promise<string> {
  const res = await fetch('https://tr.snapchat.com/v2/conversion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
    body: JSON.stringify({
      pixel_id,
      event_type: 'PURCHASE',
      event_conversion_type: 'WEB',
      timestamp: Date.now(),
      order_id: 'test_' + Date.now(),
      price: 0.01,
      currency: 'EUR',
    }),
  })
  const data = await res.json()
  if (!res.ok) return `Erreur Snapchat : ${data?.error_message || res.status}`
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
    } else {
      return NextResponse.json({ ok: false, message: result })
    }
  } catch (err) {
    return NextResponse.json({ ok: false, message: `Erreur réseau : ${err}` })
  }
}
