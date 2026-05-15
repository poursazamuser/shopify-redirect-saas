import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { validateShopCredentials } from '@/lib/shopify'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('shops')
    .select('id, shop_domain, role, client_id, created_at')
    .eq('user_id', session.userId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const shops = (data ?? []).map(s => ({ ...s, connected: true }))
  return NextResponse.json({ shops })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body: {
    shop_domain?: string
    client_id?: string
    client_secret?: string
    role?: string
    webhook_secret?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 })
  }

  const { shop_domain, client_id, client_secret, role, webhook_secret } = body

  if (!shop_domain || !client_id || !client_secret || !role) {
    return NextResponse.json(
      { error: 'shop_domain, client_id, client_secret et role sont requis.' },
      { status: 400 }
    )
  }

  if (!['source', 'destination'].includes(role)) {
    return NextResponse.json(
      { error: 'role doit être "source" ou "destination".' },
      { status: 400 }
    )
  }

  const normalizedDomain = shop_domain
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase()

  if (!normalizedDomain.endsWith('.myshopify.com')) {
    return NextResponse.json(
      { error: 'Le domaine doit être au format monmagasin.myshopify.com' },
      { status: 400 }
    )
  }

  const validation = await validateShopCredentials(
    normalizedDomain,
    client_id.trim(),
    client_secret.trim()
  )

  if (!validation.ok) {
    return NextResponse.json(
      { error: `Credentials invalides ou boutique introuvable. Réponse Shopify : ${validation.error}` },
      { status: 422 }
    )
  }

  const upsertData: Record<string, unknown> = {
    user_id: session.userId,
    shop_domain: normalizedDomain,
    client_id: client_id.trim(),
    client_secret: client_secret.trim(),
    access_token: null,
    role,
  }

  if (role === 'destination' && webhook_secret) {
    upsertData.webhook_secret = webhook_secret.trim()
  }

  const { error: upsertError } = await supabaseAdmin
    .from('shops')
    .upsert(upsertData, { onConflict: 'user_id,role' })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, shop_name: validation.shopName })
}
