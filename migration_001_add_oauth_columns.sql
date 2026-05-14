-- ============================================================
-- Migration : ajout des colonnes OAuth sur la table shops
-- À exécuter UNE SEULE FOIS dans Supabase SQL Editor
-- (uniquement si vous avez déjà exécuté l'ancien schema.sql)
-- ============================================================

-- 1. Ajouter la colonne client_id (API Key de la Custom App)
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT '';

-- 2. Ajouter la colonne client_secret (API Secret Key, shpss_...)
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS client_secret TEXT NOT NULL DEFAULT '';

-- 3. Rendre access_token nullable (il sera rempli après l'OAuth, pas avant)
ALTER TABLE shops
  ALTER COLUMN access_token DROP NOT NULL;

-- Vérification : afficher la structure de la table après migration
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'shops'
ORDER BY ordinal_position;
