'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Shop {
  id: string
  shop_domain: string
  role: 'source' | 'destination'
  client_id: string
  connected: boolean
}

function ShopForm({ role, existing, onSaved, onDisconnect }: {
  role: 'source' | 'destination'
  existing?: Shop
  onSaved: () => void
  onDisconnect: (id: string) => void
}) {
  const [domain, setDomain] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Sync form with existing data when shop loads/changes
  useEffect(() => {
    setDomain(existing?.shop_domain ?? '')
    setClientId(existing?.client_id ?? '')
    setClientSecret('')
    setError('')
    setSuccess('')
  }, [existing?.id])

  const label = role === 'source' ? 'Boutique A (Source)' : 'Boutique B (Destination)'
  const appLabel = role === 'source' ? 'App boutique A' : 'App boutique B'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_domain: domain,
        client_id: clientId,
        client_secret: clientSecret,
        role,
      }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Erreur lors de la connexion')
    } else {
      setSuccess(`✓ ${data.shop_name ?? label} connectée avec succès !`)
      setClientSecret('')
      onSaved()
    }
  }

  async function handleDisconnect() {
    if (!existing?.id) return
    if (!confirm(`Déconnecter ${existing.shop_domain} ? Les produits synchronisés seront supprimés.`)) return
    setDisconnecting(true)
    await fetch(`/api/shops/${existing.id}`, { method: 'DELETE' })
    setDisconnecting(false)
    setSuccess('')
    setError('')
    onDisconnect(existing.id)
  }

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <span className={`badge ${role === 'source' ? 'badge-source' : 'badge-dest'}`}>
          {role === 'source' ? 'Source A' : 'Destination B'}
        </span>
        <h2 style={{ fontSize: '16px', fontWeight: '600' }}>{label}</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {existing?.connected ? (
            <>
              <span style={{ fontSize: '13px', color: '#4ade80' }}>✓ Connectée</span>
              <button
                className="btn btn-danger"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? '...' : 'Déconnecter'}
              </button>
            </>
          ) : (
            <span style={{ fontSize: '13px', color: '#6b6b8a' }}>Non connectée</span>
          )}
        </div>
      </div>

      {/* Connected summary badge */}
      {existing?.connected && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          fontSize: '13px', color: '#4ade80', display: 'flex', gap: '16px',
        }}>
          <span>🔗 <strong>{existing.shop_domain}</strong></span>
          {existing.client_id && (
            <span style={{ color: '#6b6b8a' }}>
              Client ID : {existing.client_id.slice(0, 8)}…
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label>Domaine Shopify</label>
          <input
            className="input" type="text" required
            value={domain} onChange={e => setDomain(e.target.value)}
            placeholder="ma-boutique.myshopify.com"
          />
        </div>
        <div>
          <label>Client ID (API Key)</label>
          <input
            className="input" type="text" required
            value={clientId} onChange={e => setClientId(e.target.value)}
            placeholder="abc123def456..."
          />
        </div>
        <div>
          <label>Client Secret (API Secret Key — shpss_...)</label>
          <input
            className="input" type="password" required
            value={clientSecret} onChange={e => setClientSecret(e.target.value)}
            placeholder="shpss_xxxxxxxxxxxxxxxxxxxx"
            autoComplete="off"
          />
          <p style={{ fontSize: '11px', color: '#6b6b8a', marginTop: '4px' }}>
            Requis à chaque (re)connexion — non affiché une fois enregistré.
          </p>
        </div>

        <div style={{
          padding: '12px 14px', borderRadius: '8px',
          background: 'rgba(108,71,255,0.08)', border: '1px solid rgba(108,71,255,0.2)',
          fontSize: '12px', color: '#a5b4fc', lineHeight: '1.7',
        }}>
          <strong>Où trouver ces informations ?</strong><br />
          Shopify Admin → Paramètres → Applications → <em>Développer des apps</em><br />
          → Sélectionner <strong>{appLabel}</strong> → <strong>API credentials</strong><br />
          → Copier <strong>Client ID</strong> et <strong>Client secret</strong>
        </div>

        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-success">{success}</div>}

        <button
          className="btn btn-primary" type="submit"
          disabled={loading} style={{ justifyContent: 'center' }}
        >
          {loading
            ? 'Vérification en cours...'
            : existing?.connected ? '↺ Mettre à jour' : 'Connecter la boutique'}
        </button>
      </form>

      <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b6b8a' }}>
        Scopes requis :{' '}
        <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
          read_products, write_checkouts, read_checkouts
        </code>
      </div>
    </div>
  )
}

export default function SetupPage() {
  const router = useRouter()
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://votre-app.railway.app'

  const loadShops = useCallback(async () => {
    const res = await fetch('/api/shops')
    const data = await res.json()
    setShops(data.shops || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadShops() }, [loadShops])

  function handleDisconnect(id: string) {
    setShops(prev => prev.filter(s => s.id !== id))
  }

  const sourceShop = shops.find(s => s.role === 'source')
  const destShop = shops.find(s => s.role === 'destination')
  const bothConnected = sourceShop?.connected && destShop?.connected

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <span style={{ fontSize: '18px', fontWeight: '700' }}>ShopBridge</span>
          <nav style={{ display: 'flex', gap: '8px' }}>
            {[
              { href: '/setup', label: 'Configuration' },
              { href: '/mappings', label: 'Mappings' },
              { href: '/dashboard', label: 'Dashboard' },
            ].map(l => (
              <Link key={l.href} href={l.href} style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '14px', textDecoration: 'none',
                color: l.href === '/setup' ? '#fff' : '#6b6b8a',
                background: l.href === '/setup' ? 'rgba(108,71,255,0.2)' : 'transparent',
              }}>{l.label}</Link>
            ))}
          </nav>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: '13px' }}
          onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login') }}>
          Déconnexion
        </button>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Configuration</h1>
          <p style={{ color: '#6b6b8a' }}>
            Renseignez le domaine, Client ID et Client Secret de chaque Custom App.
          </p>
        </div>

        {loading ? <p style={{ color: '#6b6b8a' }}>Chargement...</p> : (
          <div style={{ display: 'grid', gap: '24px' }}>
            <ShopForm role="source" existing={sourceShop} onSaved={loadShops} onDisconnect={handleDisconnect} />
            <ShopForm role="destination" existing={destShop} onSaved={loadShops} onDisconnect={handleDisconnect} />

            {sourceShop?.connected && (
              <div className="card" style={{ borderColor: 'rgba(108,71,255,0.3)' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '14px' }}>
                  🔧 Script à installer sur la boutique A
                </h2>
                <p style={{ color: '#6b6b8a', fontSize: '13px', marginBottom: '10px' }}>
                  Dans <strong>layout/theme.liquid</strong> de la boutique A, avant <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 4px', borderRadius: '4px' }}>&lt;/body&gt;</code> :
                </p>
                <div style={{
                  background: '#0a0a0f', border: '1px solid var(--border)', borderRadius: '8px',
                  padding: '14px', fontFamily: 'monospace', fontSize: '13px', color: '#a5b4fc',
                  overflowX: 'auto', userSelect: 'all',
                }}>
                  {`<script src="${APP_URL}/api/script.js?shop={{ shop.permanent_domain }}" defer></script>`}
                </div>
              </div>
            )}

            {destShop?.connected && (
              <div className="card" style={{ borderColor: 'rgba(34,197,94,0.2)' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
                  🔔 Webhook orders/paid (boutique B)
                </h2>
                <p style={{ color: '#6b6b8a', fontSize: '13px', marginBottom: '10px' }}>
                  Admin boutique B → Paramètres → Notifications → Webhooks → Créer :
                </p>
                <div style={{ fontSize: '13px', color: '#a5b4fc', lineHeight: '2.2' }}>
                  Événement : <strong>Paiement de commande</strong><br />
                  URL :{' '}
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                    {APP_URL}/api/webhooks/shopify/order-paid
                  </code>
                </div>
                <p style={{ fontSize: '12px', color: '#6b6b8a', marginTop: '10px' }}>
                  Copiez la <strong>Webhook signing secret</strong> → variable{' '}
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                    SHOPIFY_WEBHOOK_SECRET
                  </code>
                </p>
              </div>
            )}

            {bothConnected && (
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <Link href="/mappings" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                  → Configurer les mappings produits
                </Link>
                <Link href="/dashboard" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
                  Voir le dashboard
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
