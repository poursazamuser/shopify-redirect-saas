import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// DELETE /api/mappings/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params

  const { error } = await supabaseAdmin
    .from('product_mappings')
    .delete()
    .eq('id', id)
    .eq('user_id', session.userId) // Ensure ownership

  if (error) return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 })

  return NextResponse.json({ success: true })
}
