import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/pixels – Lister les pixels de l'utilisateur
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('pixels')
    .select('id, platform, pixel_id, created_at') // ne pas exposer access_token
    .eq('user_id', session.userId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ pixels: data ?? [] })
}

// POST /api/pixels – Créer ou mettre à jour un pixel (upsert par plateforme)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body: { platform?: string; pixel_id?: string; access_token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const { platform, pixel_id, access_token } = body

  if (!platform || !pixel_id || !access_token) {
    return NextResponse.json(
      { error: 'platform, pixel_id et access_token sont requis' },
      { status: 400 }
    )
  }

  const validPlatforms = ['meta', 'google', 'tiktok', 'snapchat']
  if (!validPlatforms.includes(platform)) {
    return NextResponse.json(
      { error: `platform doit être parmi : ${validPlatforms.join(', ')}` },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('pixels')
    .upsert(
      {
        user_id: session.userId,
        platform,
        pixel_id: pixel_id.trim(),
        access_token: access_token.trim(),
      },
      { onConflict: 'user_id,platform' }
    )
    .select('id, platform, pixel_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, pixel: data }, { status: 201 })
}
