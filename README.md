# ShopBridge – Shopify Redirect SaaS

Redirige automatiquement les clients de la boutique A vers le checkout de la boutique B, avec mapping de variantes et tracking complet.

## Stack
- **Next.js 15** (App Router, TypeScript)
- **Supabase** (PostgreSQL)
- **Railway** (hébergement)
- **Tailwind CSS**

## Structure du projet

```
shopify-redirect-saas/
├── schema.sql                          ← Schéma SQL complet à exécuter dans Supabase
├── .env.local                          ← Variables d'environnement (à configurer)
├── middleware.ts                       ← Protection des routes
├── lib/
│   ├── supabase.ts                     ← Clients Supabase (public + admin)
│   └── auth.ts                         ← JWT sign/verify/session
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                        ← Redirect / → /dashboard ou /login
│   ├── login/page.tsx                  ← Connexion + inscription
│   ├── setup/page.tsx                  ← Connexion des 2 boutiques
│   ├── mappings/page.tsx               ← Mapping produits A ↔ B
│   ├── dashboard/
│   │   ├── page.tsx                    ← Stats (server component)
│   │   └── client.tsx                  ← Tables redirections + ventes
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts
│       │   ├── register/route.ts
│       │   └── logout/route.ts
│       ├── shops/route.ts              ← GET/POST boutiques
│       ├── products/sync/route.ts      ← GET/POST synchronisation produits
│       ├── mappings/
│       │   ├── route.ts                ← GET/POST mappings
│       │   └── [id]/route.ts           ← DELETE mapping
│       ├── redirect/route.ts           ← POST redirection (appelé par script.js)
│       ├── script.js/route.ts          ← GET script intercepteur JS
│       └── webhooks/shopify/
│           └── order-paid/route.ts     ← POST webhook Shopify orders/paid
```

## Installation

### 1. Base de données Supabase
1. Créer un projet sur [supabase.com](https://supabase.com)
2. Aller dans **SQL Editor** et exécuter le contenu de `schema.sql`
3. Récupérer les clés API dans Settings → API

### 2. Variables d'environnement
Copier `.env.local` et remplir toutes les valeurs :

```bash
cp .env.local .env.local   # déjà créé, juste remplir les valeurs
```

### 3. Lancer en développement
```bash
npm install
npm run dev
```

### 4. Déploiement Railway
1. Créer un projet Railway depuis ce repo Git
2. Ajouter les variables d'environnement dans Railway → Variables
3. Railway détecte automatiquement Next.js et build/deploy

## Flux complet

```
Client boutique A
    ↓ clic "Passer au paiement"
script.js intercepte
    ↓ GET /cart.js (Shopify Ajax)
    ↓ POST /api/redirect { items, shop_domain }
        ↓ Lookup mappings en DB
        ↓ POST /admin/api/2024-01/checkouts.json sur boutique B
    ↓ Retourne checkoutUrl
Client redirigé vers checkout boutique B
    ↓ Paiement effectué
Shopify B déclenche webhook orders/paid
    ↓ POST /api/webhooks/shopify/order-paid
        ↓ Vérification HMAC
        ↓ INSERT orders
        ↓ UPDATE redirections SET status = 'completed'
```

## Installation script sur boutique A

Ajouter dans `theme.liquid` avant `</body>` :

```html
<script src="https://VOTRE_APP.railway.app/api/script.js?shop={{ shop.permanent_domain }}" defer></script>
```

## Webhook Shopify (boutique B)

1. Admin boutique B → Settings → Notifications → Webhooks
2. Créer : **Order payment** → `https://VOTRE_APP.railway.app/api/webhooks/shopify/order-paid`
3. Copier la **Webhook signing secret** → `SHOPIFY_WEBHOOK_SECRET`
