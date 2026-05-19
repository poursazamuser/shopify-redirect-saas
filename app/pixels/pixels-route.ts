import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('pixels')
    .select('id, platform, pixel_id, created_at')
    .eq('user_id', session.userId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pixels: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { platform, pixel_id, access_token } = await req.json()

  if (!platform || !pixel_id || !access_token) {
    return NextResponse.json({ error: 'platform, pixel_id et access_token requis' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('pixels')
    .upsert(
      { user_id: session.userId, platform, pixel_id: pixel_id.trim(), access_token: access_token.trim() },
      { onConflict: 'user_id,platform' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { platform } = await req.json()
  const { error } = await supabaseAdmin
    .from('pixels')
    .delete()
    .eq('user_id', session.userId)
    .eq('platform', platform)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
