-- migrations/002_add_custom_analysis.sql
-- Sprint 2.2 — Phase 2 Intelligence Bot
-- Date : 8 avril 2026
--
-- APPLIQUER SUR VPS :
-- docker exec -i n8n-postgres psql -U n8n -d intelligence_bot < migrations/002_add_custom_analysis.sql
--
-- VÉRIFIER APRÈS :
-- docker exec -it n8n-postgres psql -U n8n -d intelligence_bot -c "\d sessions"

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS custom_answers      JSONB        DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS current_question    INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversation_state  VARCHAR(30)  DEFAULT 'idle';

-- Index pour accélérer la recherche des sessions en attente
CREATE INDEX IF NOT EXISTS idx_sessions_conversation_state
  ON sessions (chat_id, conversation_state)
  WHERE conversation_state LIKE 'awaiting_%';

-- Vérification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sessions'
  AND column_name IN ('custom_answers', 'current_question', 'conversation_state')
ORDER BY column_name;
