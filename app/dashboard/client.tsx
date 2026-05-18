'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Stats {
  totalRedirections: number
  totalOrders: number
  totalAmount: number
}

interface Redirection {
  id: string
  created_at: string
  items_source: { variant_id: string; quantity: number }[]
  status: 'pending' | 'completed' | 'failed'
  checkout_url: string | null
}

interface Order {
  id: string
  created_at: string
  shopify_order_id: string
  amount: number
  currency: string
}

interface Props {
  stats: Stats
  recentRedirections: Redirection[]
  recentOrders: Order[]
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '32px', fontWeight: '700', color: '#e2e2f0', marginBottom: '4px' }}>
        {value}
      </div>
      <div style={{ fontSize: '14px', color: '#6b6b8a' }}>{label}</div>
      {sub && <div style={{ fontSize: '12px', color: '#6b6b8a', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

export default function DashboardClient({ stats, recentRedirections, recentOrders }: Props) {
  const router = useRouter()

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const fmtAmount = (n: number, currency = 'EUR') =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(n)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#e2e2f0' }}>ShopBridge</span>
          <nav style={{ display: 'flex', gap: '8px' }}>
            {[
              { href: '/setup', label: 'Configuration' },
              { href: '/mappings', label: 'Mappings' },
              { href: '/pixels', label: 'Pixels' },
              { href: '/dashboard', label: 'Dashboard' },
            ].map(l => (
              <Link key={l.href} href={l.href} style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '14px',
                color: l.href === '/dashboard' ? '#fff' : '#6b6b8a',
                background: l.href === '/dashboard' ? 'rgba(108,71,255,0.2)' : 'transparent',
                textDecoration: 'none',
              }}>{l.label}</Link>
            ))}
          </nav>
        </div>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' })
            router.push('/login')
          }}
          style={{ fontSize: '13px' }}
        >
          Déconnexion
        </button>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Dashboard</h1>
          <p style={{ color: '#6b6b8a' }}>Vue d'ensemble des redirections et ventes enregistrées.</p>
        </div>

        {/* Stats cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
          <StatCard label="Redirections totales" value={stats.totalRedirections} />
          <StatCard label="Ventes enregistrées" value={stats.totalOrders} />
          <StatCard
            label="Montant total des ventes"
            value={fmtAmount(stats.totalAmount)}
          />
        </div>

        {/* Redirections table */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>
            Dernières redirections ({recentRedirections.length})
          </h2>
          {recentRedirections.length === 0 ? (
            <p style={{ color: '#6b6b8a', textAlign: 'center', padding: '32px 0' }}>
              Aucune redirection enregistrée. Installez le script sur la boutique A pour commencer.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Produits</th>
                    <th>Statut</th>
                    <th>Checkout</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRedirections.map(r => (
                    <tr key={r.id}>
                      <td style={{ color: '#6b6b8a', fontSize: '13px', whiteSpace: 'nowrap' }}>
                        {fmtDate(r.created_at)}
                      </td>
                      <td>
                        {(r.items_source || []).map((item, i) => (
                          <span key={i} style={{ fontSize: '12px', color: '#a5b4fc', marginRight: '8px' }}>
                            #{item.variant_id} ×{item.quantity}
                          </span>
                        ))}
                      </td>
                      <td>
                        <span className={`badge badge-${r.status}`}>{r.status}</span>
                      </td>
                      <td>
                        {r.checkout_url ? (
                          <a
                            href={r.checkout_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '12px', color: '#6c47ff' }}
                          >
                            Voir ↗
                          </a>
                        ) : (
                          <span style={{ color: '#6b6b8a', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Orders table */}
        <div className="card">
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>
            Dernières ventes ({recentOrders.length})
          </h2>
          {recentOrders.length === 0 ? (
            <p style={{ color: '#6b6b8a', textAlign: 'center', padding: '32px 0' }}>
              Aucune vente enregistrée. Configurez le webhook orders/paid sur la boutique B.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order ID Shopify</th>
                    <th>Montant</th>
                    <th>Devise</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.id}>
                      <td style={{ color: '#6b6b8a', fontSize: '13px', whiteSpace: 'nowrap' }}>
                        {fmtDate(o.created_at)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '13px', color: '#a5b4fc' }}>
                        #{o.shopify_order_id}
                      </td>
                      <td style={{ fontWeight: '600', color: '#4ade80' }}>
                        {fmtAmount(o.amount, o.currency)}
                      </td>
                      <td style={{ color: '#6b6b8a', fontSize: '13px' }}>{o.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
