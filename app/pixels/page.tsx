'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PLATFORMS = [
  {
    id: 'meta',
    label: 'Meta (Facebook / Instagram)',
    icon: '📘',
    pixelLabel: 'Pixel ID',
    tokenLabel: 'Access Token',
    help: "Meta Business Manager → Gestionnaire d'événements → Paramètres du pixel → API Conversions",
  },
  {
    id: 'google',
    label: 'Google Ads / GA4',
    icon: '🔵',
    pixelLabel: 'Measurement ID (G-XXXXXXXX)',
    tokenLabel: 'API Secret',
    help: 'Google Analytics → Admin → Flux de données → Secrets d\'API pour Measurement Protocol',
  },
  {
    id: 'tiktok',
    label: 'TikTok Ads',
    icon: '🎵',
    pixelLabel: 'Pixel Code',
    tokenLabel: 'Access Token',
    help: 'TikTok Ads Manager → Actifs → Événements → Pixel → Paramètres → API Events',
  },
  {
    id: 'snapchat',
    label: 'Snapchat Ads',
    icon: '👻',
    pixelLabel: 'Pixel ID',
    tokenLabel: 'Access Token',
    help: 'Snapchat Ads Manager → Actifs → Pixel Snap → Paramètres → Conversions API',
  },
]

interface Pixel {
  id: string
  platform: string
  pixel_id: string
}

export default function PixelsPage() {
  const router = useRouter()
  const [pixels, setPixels] = useState<Pixel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, { pixel_id: string; access_token: string }>>({})
  const [messages, setMessages] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({})

  const loadPixels = useCallback(async () => {
    const res = await fetch('/api/pixels')
    const data = await res.json()
    setPixels(data.pixels || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadPixels() }, [loadPixels])

  function getForm(platform: string) {
    return forms[platform] || { pixel_id: '', access_token: '' }
  }

  function setForm(platform: string, field: string, value: string) {
    setForms(prev => ({ ...prev, [platform]: { ...getForm(platform), [field]: value } }))
  }

  function setMessage(platform: string, type: 'success' | 'error', text: string) {
    setMessages(prev => ({ ...prev, [platform]: { type, text } }))
    setTimeout(() => setMessages(prev => { const n = { ...prev }; delete n[platform]; return n }), 4000)
  }

  async function handleSave(platform: string) {
    const form = getForm(platform)
    if (!form.pixel_id || !form.access_token) {
      setMessage(platform, 'error', 'Pixel ID et Access Token requis')
      return
    }
    setSaving(platform)
    const res = await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, pixel_id: form.pixel_id, access_token: form.access_token }),
    })
    setSaving(null)
    if (res.ok) {
      setMessage(platform, 'success', '✓ Pixel enregistré')
      setForms(prev => ({ ...prev, [platform]: { pixel_id: '', access_token: '' } }))
      loadPixels()
    } else {
      const data = await res.json()
      setMessage(platform, 'error', data.error || 'Erreur')
    }
  }

  async function handleDelete(platform: string) {
    if (!confirm(`Supprimer le pixel ${platform} ?`)) return
    setDeleting(platform)
    await fetch('/api/pixels', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
    })
    setDeleting(null)
    loadPixels()
  }

  const connectedPlatforms = new Set(pixels.map(p => p.platform))

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
              { href: '/pixels', label: 'Pixels' },
              { href: '/dashboard', label: 'Dashboard' },
            ].map(l => (
              <Link key={l.href} href={l.href} style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '14px', textDecoration: 'none',
                color: l.href === '/pixels' ? '#fff' : '#6b6b8a',
                background: l.href === '/pixels' ? 'rgba(108,71,255,0.2)' : 'transparent',
              }}>{l.label}</Link>
            ))}
          </nav>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: '13px' }}
          onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login') }}>
          Déconnexion
        </</button>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Pixels & Conversions</h1>
          <p style={{ color: '#6b6b8a' }}>
            Les événements d'achat sont envoyés automatiquement via Conversions API dès réception du paiement sur la boutique B.
          </p>
        </div>

        {loading ? <p style={{ color: '#6b6b8a' }}>Chargement...</p> : (
          <div style={{ display: 'grid', gap: '20px' }}>
            {PLATFORMS.map(platform => {
              const isConnected = connectedPlatforms.has(platform.id)
              const pixel = pixels.find(p => p.platform === platform.id)
              const form = getForm(platform.id)
              const msg = messages[platform.id]

              return (
                <div key={platform.id} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '24px' }}>{platform.icon}</span>
                    <div style={{ flex: 1 }}>
                      <h2 style={{ fontSize: '15px', fontWeight: '600' }}>{platform.label}</h2>
                      {isConnected && (
                        <span style={{ fontSize: '12px', color: '#4ade80' }}>
                          ✓ Connecté — Pixel ID : {pixel?.pixel_id}
                        </span>
                      )}
                    </div>
                    {isConnected && (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        onClick={() => handleDelete(platform.id)}
                        disabled={deleting === platform.id}
                      >
                        {deleting === platform.id ? '...' : 'Supprimer'}
                      </</button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '13px' }}>{platform.pixelLabel}</label>
                      <input
                        className="input"
                        type="text"
                        value={form.pixel_id}
                        onChange={e => setForm(platform.id, 'pixel_id', e.target.value)}
                        placeholder={isConnected ? '••••• (laisser vide pour ne pas changer)' : platform.pixelLabel}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '13px' }}>{platform.tokenLabel}</label>
                      <input
                        className="input"
                        type="password"
                        value={form.access_token}
                        onChange={e => setForm(platform.id, 'access_token', e.target.value)}
                        placeholder="••••••••••••••••••••"
                        autoComplete="off"
                      />
                    </div>

                    <div style={{
                      padding: '10px 12px', borderRadius: '6px',
                      background: 'rgba(108,71,255,0.06)', border: '1px solid rgba(108,71,255,0.15)',
                      fontSize: '12px', color: '#a5b4fc',
                    }}>
                      💡 {platform.help}
                    </div>

                    {msg && (
                      <div className={msg.type === 'success' ? 'alert-success' : 'alert-error'}>
                        {msg.text}
                      </div>
                    )}

                    <button
                      className="btn btn-primary"
                      style={{ justifyContent: 'center' }}
                      onClick={() => handleSave(platform.id)}
                      disabled={saving === platform.id}
                    >
                      {saving === platform.id ? 'Enregistrement...' : isConnected ? '↺ Mettre à jour' : 'Connecter'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
