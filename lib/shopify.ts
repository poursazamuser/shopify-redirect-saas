/**
 * lib/shopify.ts
 * Helpers pour l'API Shopify Admin (Custom Apps via client_credentials)
 */

export interface ShopifyTokenResponse {
  access_token: string
  scope: string
}

/**
 * Obtient un access_token via le grant client_credentials.
 * Fonctionne avec les Custom Apps créées depuis le Shopify Partners Dashboard.
 */
export async function getAccessToken(
  shopDomain: string,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        }),
      }
    )

    if (!res.ok) {
      console.error(
        `[Shopify] Token request failed for ${shopDomain}: ${res.status}`
      )
      return null
    }

    const data: ShopifyTokenResponse = await res.json()
    return data.access_token ?? null
  } catch (err) {
    console.error(`[Shopify] getAccessToken error for ${shopDomain}:`, err)
    return null
  }
}

/**
 * Valide les credentials d'une boutique :
 * 1. Génère un token via client_credentials
 * 2. Appelle GET /admin/api/2024-01/shop.json pour vérifier les permissions
 */
export async function validateShopCredentials(
  shopDomain: string,
  clientId: string,
  clientSecret: string
): Promise<{ ok: true; shopName: string } | { ok: false; error: string }> {
  const token = await getAccessToken(shopDomain, clientId, clientSecret)

  if (!token) {
    return {
      ok: false,
      error:
        'Impossible de générer un token. Vérifiez le Client ID et Client Secret.',
    }
  }

  try {
    const res = await fetch(
      `https://${shopDomain}/admin/api/2024-01/shop.json`,
      { headers: { 'X-Shopify-Access-Token': token } }
    )

    if (!res.ok) {
      return {
        ok: false,
        error: `GET /shop.json a retourné ${res.status}. Vérifiez les scopes de l'app.`,
      }
    }

    const data = await res.json()
    return { ok: true, shopName: data.shop?.name ?? shopDomain }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Récupère un access_token frais et lance un appel GET à l'API Shopify Admin.
 * Retourne null si le token ou l'appel échoue.
 */
export async function shopifyFetch(
  shopDomain: string,
  clientId: string,
  clientSecret: string,
  path: string
): Promise<Response | null> {
  const token = await getAccessToken(shopDomain, clientId, clientSecret)
  if (!token) return null

  return fetch(`https://${shopDomain}/admin/api/2024-01${path}`, {
    headers: { 'X-Shopify-Access-Token': token },
  })
}
