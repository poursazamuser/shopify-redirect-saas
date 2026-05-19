'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Product {
  id: string
  shop_id: string
  shopify_product_id: string
  shopify_variant_id: string
  title: string
  variant_title: string | null
  image_url: string | null
  price: string | null
  role: 'source' | 'destination'
}

interface Mapping {
  id: string
  variant_id_source: string
  variant_id_destination: string
  created_at: string
}

function NavBar({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
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
            { href: '/dashboard', label: 'Dashboard' },
          ].map(l => (
            <Link key={l.href} href={l.href} style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '14px',
              color: l.href === '/mappings' ? '#fff' : '#6b6b8a',
              background: l.href === '/mappings' ? 'rgba(108,71,255,0.2)' : 'transparent',
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
  )
}

export default function MappingsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    const [pRes, mRes] = await Promise.all([
      fetch('/api/products/sync'),
      fetch('/api/mappings'),
    ])
    const pData = await pRes.json()
    const mData = await mRes.json()
    setProducts(pData.products || [])
    setMappings(mData.mappings || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    const res = await fetch('/api/products/sync', { method: 'POST' })
    const data = await res.json()
    setSyncing(false)
    if (res.ok) {
      setSyncMsg(`✓ Synchronisé : ${data.synced?.source || 0} variantes source, ${data.synced?.destination || 0} variantes destination`)
      loadAll()
    } else {
      setSyncMsg(`✗ ${data.error}`)
    }
  }

  async function createMapping(destVariantId: string) {
    if (!selectedSource) return
    setSaving(true)
    await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variant_id_source: selectedSource,
        variant_id_destination: destVariantId,
      }),
    })
    setSaving(false)
    setSelectedSource(null)
    loadAll()
  }

  async function deleteMapping(id: string) {
    await fetch(`/api/mappings/${id}`, { method: 'DELETE' })
    loadAll()
  }

  const sourceProducts = products.filter(p => p.role === 'source')
  const destProducts = products.filter(p => p.role === 'destination')
  const mappingBySource = Object.fromEntries(mappings.map(m => [m.variant_id_source, m]))

  function getMappedDest(sourceVariantId: string) {
    const m = mappingBySource[sourceVariantId]
    if (!m) return null
    return destProducts.find(p => p.shopify_variant_id === m.variant_id_destination)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <NavBar router={router} />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Mappings produits</h1>
            <p style={{ color: '#6b6b8a' }}>
              Associez les variantes de la boutique A avec leurs équivalents sur la boutique B.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={handleSync} disabled={syncing}>
            {syncing ? '⟳ Synchronisation...' : '⟳ Actualiser les produits'}
          </button>
        </div>

        {syncMsg && (
          <div className={syncMsg.startsWith('✓') ? 'alert-success' : 'alert-error'} style={{ marginBottom: '24px' }}>
            {syncMsg}
          </div>
        )}

        {selectedSource && (
          <div style={{
            marginBottom: '20px', padding: '14px 18px',
            background: 'rgba(108,71,255,0.1)', border: '1px solid rgba(108,71,255,0.4)',
            borderRadius: '8px', fontSize: '14px', color: '#a5b4fc',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>
              ✦ Variante source sélectionnée. Cliquez sur un produit de la boutique B pour créer l'association.
            </span>
            <button
              style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', fontSize: '18px' }}
              onClick={() => setSelectedSource(null)}
            >✕</button>
          </div>
        )}

        {loading ? (
          <p style={{ color: '#6b6b8a' }}>Chargement des produits...</p>
        ) : sourceProducts.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
            <p style={{ color: '#6b6b8a', marginBottom: '16px' }}>
              Aucun produit synchronisé. Cliquez sur "Actualiser les produits" pour importer les catalogues.
            </p>
            <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
              Synchroniser maintenant
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
            {/* Source column */}
            <div>
              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="badge badge-source">Boutique A – Source</span>
                <span style={{ fontSize: '13px', color: '#6b6b8a' }}>{sourceProducts.length} variantes</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sourceProducts.map(p => {
                  const mapped = getMappedDest(p.shopify_variant_id)
                  const isSelected = selectedSource === p.shopify_variant_id
                  const mapping = mappingBySource[p.shopify_variant_id]

                  return (
                    <div
                      key={p.id}
                      onClick={() => !mapped && setSelectedSource(isSelected ? null : p.shopify_variant_id)}
                      style={{
                        padding: '12px 14px', borderRadius: '8px', cursor: mapped ? 'default' : 'pointer',
                        border: `1px solid ${isSelected ? '#6c47ff' : mapped ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                        background: isSelected ? 'rgba(108,71,255,0.1)' : mapped ? 'rgba(34,197,94,0.05)' : 'var(--surface)',
                        display: 'flex', alignItems: 'center', gap: '12px',
                        transition: 'all 0.15s',
                      }}
                    >
                      {p.image_url && (
                        <img src={p.image_url} alt={p.title} style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px' }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#e2e2f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.title}
                        </div>
                        {p.variant_title && (
                          <div style={{ fontSize: '12px', color: '#6b6b8a' }}>{p.variant_title}</div>
                        )}
                        {p.price && <div style={{ fontSize: '12px', color: '#818cf8' }}>{p.price} €</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {mapped ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: '#4ade80' }}>→ {mapped.title.slice(0, 15)}…</span>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={e => { e.stopPropagation(); deleteMapping(mapping!.id) }}
                            >✕</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: isSelected ? '#a5b4fc' : '#6b6b8a' }}>
                            {isSelected ? '← sélectionné' : '+ associer'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Destination column */}
            <div>
              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="badge badge-dest">Boutique B – Destination</span>
                <span style={{ fontSize: '13px', color: '#6b6b8a' }}>{destProducts.length} variantes</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {destProducts.map(p => {
                  const isMapped = mappings.some(m => m.variant_id_destination === p.shopify_variant_id)
                  const isTarget = !!selectedSource && !isMapped

                  return (
                    <div
                      key={p.id}
                      onClick={() => isTarget && createMapping(p.shopify_variant_id)}
                      style={{
                        padding: '12px 14px', borderRadius: '8px',
                        cursor: isTarget ? 'pointer' : 'default',
                        border: `1px solid ${isMapped ? 'rgba(34,197,94,0.3)' : isTarget ? 'rgba(108,71,255,0.4)' : 'var(--border)'}`,
                        background: isMapped ? 'rgba(34,197,94,0.05)' : isTarget ? 'rgba(108,71,255,0.08)' : 'var(--surface)',
                        display: 'flex', alignItems: 'center', gap: '12px',
                        transition: 'all 0.15s',
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      {p.image_url && (
                        <img src={p.image_url} alt={p.title} style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px' }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#e2e2f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.title}
                        </div>
                        {p.variant_title && (
                          <div style={{ fontSize: '12px', color: '#6b6b8a' }}>{p.variant_title}</div>
                        )}
                        {p.price && <div style={{ fontSize: '12px', color: '#4ade80' }}>{p.price} €</div>}
                      </div>
                      {isMapped && <span style={{ fontSize: '11px', color: '#4ade80', flexShrink: 0 }}>✓ associé</span>}
                      {isTarget && !isMapped && <span style={{ fontSize: '11px', color: '#a5b4fc', flexShrink: 0 }}>← cliquer</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Mappings summary */}
        {mappings.length > 0 && (
          <div className="card" style={{ marginTop: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              Résumé des mappings ({mappings.length})
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Variante Source (A)</th>
                  <th>Variante Destination (B)</th>
                  <th>Créé le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => {
                  const src = sourceProducts.find(p => p.shopify_variant_id === m.variant_id_source)
                  const dst = destProducts.find(p => p.shopify_variant_id === m.variant_id_destination)
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: '500' }}>{src?.title || m.variant_id_source}</div>
                        {src?.variant_title && <div style={{ fontSize: '12px', color: '#6b6b8a' }}>{src.variant_title}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: '500' }}>{dst?.title || m.variant_id_destination}</div>
                        {dst?.variant_title && <div style={{ fontSize: '12px', color: '#6b6b8a' }}>{dst.variant_title}</div>}
                      </td>
                      <td style={{ color: '#6b6b8a', fontSize: '13px' }}>
                        {new Date(m.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td>
                        <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => deleteMapping(m.id)}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
