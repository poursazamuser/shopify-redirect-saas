'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Pixel {
  id: string
  platform: 'meta' | 'google' | 'tiktok' | 'snapchat'
  pixel_id: string
  created_at: string
}

const PLATFORM_META = {
  meta: {
    label: 'Meta (Facebook & Instagram)',
    icon: '📘',
    pixelLabel: 'Pixel ID',
    pixelPlaceholder: '123456789012345',
    tokenLabel: 'Access Token (Conversions API)',
    tokenPlaceholder: 'EAAxxxxx...',
    help: 'Meta → Events Manager → votre pixel → Paramètres → Conversions API → Générer un token',
    color: '#1877f2',
  },
  google: {
    label: 'Google Analytics 4',
    icon: '🔵',
    pixelLabel: 'Measurement ID',
    pixelPlaceholder: 'G-XXXXXXXXXX',
    tokenLabel: 'API Secret (Measurement Protocol)',
    tokenPlaceholder: 'xxxxxxxxxxxxxxxx',
    help: 'GA4 Admin → Flux de données → votre flux → Secrets API Measurement Protocol',
    color: '#4285f4',
  },
  tiktok: {
    label: 'TikTok',
    icon: '🎵',
    pixelLabel: 'Pixel Code',
    pixelPlaceholder: 'XXXXXXXXXXXXXXXXXX',
    tokenLabel: 'Access Token (Events API)',
    tokenPlaceholder: 'xxxxxxxxx...',
    help: 'TikTok Ads Manager → Actifs → Événements → votre pixel → Configurer → Events API',
    color: '#010101',
  },
  snapchat: {
    label: 'Snapchat',
    icon: '👻',
    pixelLabel: 'Pixel ID',
    pixelPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    tokenLabel: 'Access Token (Conversions API)',
    tokenPlaceholder: 'xxxxxxxxx...',
    help: 'Snap Ads Manager → Actifs → Pixel → Conversions API → Générer un token',
    color: '#fffc00',
  },
}

type Platform = keyof typeof PLATFORM_META

function PixelCard({ platform, existing, onSaved, onDeleted }: {
  platform: Platform
  existing?: Pixel
  onSaved: () => void
  onDeleted: () => void
}) {
  const meta = PLATFORM_META[platform]
  const [pixelId, setPixelId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/pixels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, pixel_id: pixelId, access_token: accessToken }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Erreur')
    } else {
      setSuccess('Pixel enregistré ✓')
      setPixelId('')
      setAccessToken('')
      setOpen(false)
      onSaved()
    }
  }

  async function handleDelete() {
    if (!existing?.id) return
    if (!confirm(`Supprimer le pixel ${meta.label} ?`)) return
    setDeleting(true)
    await fetch(`/api/pixels/${existing.id}`, { method: 'DELETE' })
    setDeleting(false)
    onDeleted()
  }

  return (
    <div className="card" style={{ borderColor: existing ? 'rgba(74,222,128,0.2)' : 'var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '600', fontSize: '15px' }}>{meta.label}</div>
          {existing ? (
            <div style={{ fontSize: '12px', color: '#4ade80', marginTop: '2px' }}>
              ✓ Connecté — ID : <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '3px' }}>{existing.pixel_id}</code>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#6b6b8a', marginTop: '2px' }}>Non configuré</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {existing && (
            <button
              className="btn btn-danger"
              style={{ padding: '5px 10px', fontSize: '12px' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '...' : 'Supprimer'}
            </button>
          )}
          <button
            className="btn btn-ghost"
            style={{ padding: '5px 12px', fontSize: '12px' }}
            onClick={() => { setOpen(!open); setError(''); setSuccess('') }}
          >
            {open ? 'Fermer' : existing ? 'Modifier' : 'Configurer'}
          </button>
        </div>
      </div>

      {open && (
        <form onSubmit={handleSave} style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label>{meta.pixelLabel}</label>
            <input
              className="input" type="text" required
              value={pixelId} onChange={e => setPixelId(e.target.value)}
              placeholder={meta.pixelPlaceholder}
            />
          </div>
          <div>
            <label>{meta.tokenLabel}</label>
            <input
              className="input" type="password" required
              value={accessToken} onChange={e => setAccessToken(e.target.value)}
              placeholder={meta.tokenPlaceholder}
              autoComplete="off"
            />
          </div>
          <div style={{
            padding: '10px 14px', borderRadius: '8px',
            background: 'rgba(108,71,255,0.08)', border: '1px solid rgba(108,71,255,0.2)',
            fontSize: '12px', color: '#a5b4fc', lineHeight: '1.6',
          }}>
            📍 {meta.help}
          </div>
          {error && <div className="alert-error">{error}</div>}
          {success && <div className="alert-success">{success}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: 'center' }}>
            {loading ? 'Enregistrement...' : 'Enregistrer le pixel'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function PixelsPage() {
  const router = useRouter()
  const [pixels, setPixels] = useState<Pixel[]>([])
  const [loading, setLoading] = useState(true)

  const loadPixels = useCallback(async () => {
    const res = await fetch('/api/pixels')
    const data = await res.json()
    setPixels(data.pixels || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadPixels() }, [loadPixels])

  function handleDeleted(id: string) {
    setPixels(prev => prev.filter(p => p.id !== id))
  }

  const platforms = Object.keys(PLATFORM_META) as Platform[]

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
        </button>
      </header>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Pixels publicitaires</h1>
          <p style={{ color: '#6b6b8a', lineHeight: '1.6' }}>
            Configurez un pixel par plateforme. Lorsqu'une commande est payée sur la boutique B,
            ShopBridge envoie automatiquement l'événement de conversion avec les click IDs
            capturés sur la boutique A.
          </p>
        </div>

        {/* Explication du flux */}
        <div className="card" style={{ marginBottom: '24px', borderColor: 'rgba(108,71,255,0.2)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>📡 Comment fonctionne le tracking cross-boutiques ?</h2>
          <ol style={{ paddingLeft: '20px', color: '#a5b4fc', fontSize: '13px', lineHeight: '2' }}>
            <li>Le client clique sur une pub → arrive sur la boutique A avec un click ID dans l'URL (<code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px' }}>fbclid</code>, <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px' }}>gclid</code>, <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px' }}>ttclid</code>, <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px' }}>ScCid</code>)</li>
            <li>Le script ShopBridge capture ces IDs et les stocke dans le navigateur</li>
            <li>Au checkout → redirection vers la boutique B avec les click IDs enregistrés</li>
            <li>Quand la commande est payée sur B → webhook → événement <strong>Purchase</strong> envoyé à toutes les plateformes configurées</li>
          </ol>
        </div>

        {loading ? (
          <p style={{ color: '#6b6b8a' }}>Chargement...</p>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {platforms.map(platform => (
              <PixelCard
                key={platform}
                platform={platform}
                existing={pixels.find(p => p.platform === platform)}
                onSaved={loadPixels}
                onDeleted={() => handleDeleted(pixels.find(p => p.platform === platform)?.id ?? '')}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
