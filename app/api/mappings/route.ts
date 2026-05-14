import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/mappings – List all mappings for current user
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('product_mappings')
    .select('*')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 })

  return NextResponse.json({ mappings: data })
}

// POST /api/mappings – Create a new mapping
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  try {
    const { variant_id_source, variant_id_destination } = await req.json()

    if (!variant_id_source || !variant_id_destination) {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
    }

    // One source variant can only map to one destination
    const { data, error } = await supabaseAdmin
      .from('product_mappings')
      .upsert(
        {
          user_id: session.userId,
          variant_id_source: String(variant_id_source),
          variant_id_destination: String(variant_id_destination),
        },
        { onConflict: 'user_id,variant_id_source' }
      )
      .select()
      .single()

    if (error) {
      console.error('Mapping insert error:', error)
      return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 })
    }

    return NextResponse.json({ success: true, mapping: data }, { status: 201 })
  } catch (err) {
    console.error('Create mapping error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
