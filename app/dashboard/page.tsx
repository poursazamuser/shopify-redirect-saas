import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DashboardClient from './client'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const userId = session.userId

  // Fetch stats + tables in parallel
  const [
    { count: totalRedirections },
    { count: totalOrders },
    { data: ordersSum },
    { data: recentRedirections },
    { data: recentOrders },
  ] = await Promise.all([
    supabaseAdmin.from('redirections').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabaseAdmin.from('orders').select('amount').eq('user_id', userId),
    supabaseAdmin
      .from('redirections')
      .select('id, created_at, items_source, status, checkout_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('orders')
      .select('id, created_at, shopify_order_id, amount, currency')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const totalAmount = (ordersSum || []).reduce((acc, o) => acc + Number(o.amount), 0)

  return (
    <DashboardClient
      stats={{
        totalRedirections: totalRedirections || 0,
        totalOrders: totalOrders || 0,
        totalAmount,
      }}
      recentRedirections={recentRedirections || []}
      recentOrders={recentOrders || []}
    />
  )
}
