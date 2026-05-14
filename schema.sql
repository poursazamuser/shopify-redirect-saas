-- ============================================================
-- Shopify Redirect SaaS – Schéma SQL complet
-- À exécuter dans Supabase SQL Editor (une seule fois)
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------
-- 1. Utilisateurs (marchands)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,         -- bcrypt hash
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 2. Boutiques connectées
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS shops (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_domain    TEXT NOT NULL,          -- ex: my-store.myshopify.com
  client_id      TEXT NOT NULL,          -- API Key de la Custom App Shopify
  client_secret  TEXT NOT NULL,          -- API Secret Key (shpss_...)
  access_token   TEXT,                   -- Rempli après l'échange OAuth
  role           TEXT NOT NULL CHECK (role IN ('source', 'destination')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- ----------------------------------------------------------
-- 3. Produits / variantes synchronisés
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id              UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  shopify_product_id   TEXT NOT NULL,
  shopify_variant_id   TEXT NOT NULL,
  title                TEXT NOT NULL,
  variant_title        TEXT,
  image_url            TEXT,
  price                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, shopify_variant_id)
);

-- ----------------------------------------------------------
-- 4. Mappings de variantes (A → B)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_mappings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant_id_source      TEXT NOT NULL,    -- shopify_variant_id de la boutique A
  variant_id_destination TEXT NOT NULL,    -- shopify_variant_id de la boutique B
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, variant_id_source)
);

-- ----------------------------------------------------------
-- 5. Redirections enregistrées
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS redirections (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  items_source     JSONB NOT NULL,   -- [{ variant_id, quantity }]
  items_destination JSONB NOT NULL,  -- [{ variant_id, quantity }]
  checkout_url     TEXT,
  checkout_token   TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed'))
);

-- ----------------------------------------------------------
-- 6. Commandes enregistrées (webhook orders/paid)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  amount           NUMERIC(10,2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'EUR',
  checkout_token   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- Index pour les performances
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_shops_user_id         ON shops(user_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_id      ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_mappings_user_id      ON product_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_redirections_user_id  ON redirections(user_id);
CREATE INDEX IF NOT EXISTS idx_redirections_status   ON redirections(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id        ON orders(user_id);
