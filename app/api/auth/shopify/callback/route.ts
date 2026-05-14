import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// GET /api/auth/shopify/callback
// Shopify redirige ici après autorisation du marchand
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const shop = searchParams.get('shop')
  const errorParam = searchParams.get('error')

  // ── Refus de l'utilisateur ────────────────────────────────────────────────
  if (errorParam) {
    console.warn('OAuth denied:', errorParam)
    return NextResponse.redirect(new URL('/setup?error=oauth_denied', APP_URL))
  }

  if (!code || !state || !shop) {
    return NextResponse.redirect(new URL('/setup?error=missing_params', APP_URL))
  }

  // ── Vérification CSRF state ───────────────────────────────────────────────
  const cookieStore = await cookies()
  const storedState = cookieStore.get('shopify_oauth_state')?.value
  const contextRaw = cookieStore.get('shopify_oauth_context')?.value

  if (!storedState || !contextRaw) {
    return NextResponse.redirect(new URL('/setup?error=session_expired', APP_URL))
  }

  // Timing-safe comparison
  const stateBuffer = Buffer.from(state)
  const storedBuffer = Buffer.from(storedState)
  const stateValid =
    stateBuffer.length === storedBuffer.length &&
    timingSafeEqual(stateBuffer, storedBuffer)

  if (!stateValid) {
    return NextResponse.redirect(new URL('/setup?error=invalid_state', APP_URL))
  }

  // ── Parse context ─────────────────────────────────────────────────────────
  let context: { role: string; domain: string; userId: string }
  try {
    context = JSON.parse(contextRaw)
  } catch {
    return NextResponse.redirect(new URL('/setup?error=bad_context', APP_URL))
  }

  const { role, domain, userId } = context

  // ── Récupérer client_id et client_secret depuis la DB ─────────────────────
  const { data: shopRow } = await supabaseAdmin
    .from('shops')
    .select('client_id, client_secret')
    .eq('user_id', userId)
    .eq('role', role)
    .single()

  if (!shopRow) {
    return NextResponse.redirect(new URL('/setup?error=shop_not_found', APP_URL))
  }

  // ── Vérifier la signature HMAC du callback (sécurité supplémentaire) ──────
  // Shopify signe le callback avec le client_secret de l'app
  const hmac = searchParams.get('hmac')
  if (hmac) {
    const params: Record<string, string> = {}
    searchParams.forEach((v, k) => {
      if (k !== 'hmac') params[k] = v
    })
    const message = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&')
    const digest = createHmac('sha256', shopRow.client_secret)
      .update(message)
      .digest('hex')

    if (digest !== hmac) {
      console.error('HMAC mismatch on OAuth callback')
      return NextResponse.redirect(new URL('/setup?error=hmac_invalid', APP_URL))
    }
  }

  // ── Échange du code contre l'access_token ─────────────────────────────────
  const tokenRes = await fetch(
    `https://${domain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: shopRow.client_id,
        client_secret: shopRow.client_secret,
        code,
      }),
    }
  )

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('Token exchange failed:', err)
    return NextResponse.redirect(new URL('/setup?error=token_exchange', APP_URL))
  }

  const { access_token } = await tokenRes.json()

  if (!access_token) {
    return NextResponse.redirect(new URL('/setup?error=no_token', APP_URL))
  }

  // ── Sauvegarder l'access_token en base ───────────────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('shops')
    .update({ access_token })
    .eq('user_id', userId)
    .eq('role', role)

  if (updateErr) {
    console.error('Token save error:', updateErr)
    return NextResponse.redirect(new URL('/setup?error=db_error', APP_URL))
  }

  // ── Nettoyer les cookies OAuth ────────────────────────────────────────────
  const response = NextResponse.redirect(
    new URL(`/setup?success=${role}`, APP_URL)
  )
  response.cookies.delete('shopify_oauth_state')
  response.cookies.delete('shopify_oauth_context')

  return response
}
