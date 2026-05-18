-- ============================================================
-- Migration 002 : ajout click_ids sur redirections
-- À exécuter dans Supabase SQL Editor
-- ============================================================

ALTER TABLE redirections
  ADD COLUMN IF NOT EXISTS click_ids JSONB DEFAULT '{}';

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'redirections'
ORDER BY ordinal_position;
