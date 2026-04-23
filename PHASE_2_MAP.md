# PHASE_2_MAP.md — Intelligence Bot v2.0
## Feuille de route complète Phase 2 (V1.1)

> Créé le 7 avril 2026
> À lire en début de chaque session de travail
> Toutes les tâches sont trackées dans Claude Code (/tasks)

---

## RÈGLE FONDAMENTALE

**Ne jamais passer au sprint suivant sans avoir complété et testé le sprint actuel.**
Chaque sprint se termine par une validation sur le VPS réel, pas seulement en théorie.

---

## VPS & ACCÈS RAPIDES

```bash
# Connexion SSH
ssh bran9910@204.168.199.123

# Redémarrer n8n
cd /home/bran9910/n8n/ && docker compose down && docker compose up -d

# PostgreSQL
docker exec -it n8n-postgres psql -U n8n -d intelligence_bot

# Backup DB
docker exec n8n-postgres pg_dump -U n8n intelligence_bot > backup_$(date +%Y%m%d).sql

# Ollama check
curl http://localhost:11434/api/tags
```

**n8n URL** : https://diney-n8n.duckdns.org

---

## PROGRESSION GLOBALE

```
[Sprint 0] Setup          → [ ] En attente
[Sprint 1] Bugs critiques → [ ] En attente  (tâches #2 #3 #4 #5)
[Sprint 2] WF-04 Custom   → [ ] En attente  (tâches #6 #7 #8 #9 #10 #11)
[Sprint 3] WF-06 Admin    → [ ] En attente  (tâches #12 #13 #14)
[Sprint 4] Analytics      → [ ] En attente  (tâches #15 #16)
[Sprint 5] Tests & Docs   → [ ] En attente  (tâches #17 #18 #19)
```

Mettre à jour ce fichier après chaque sprint terminé : `[ ]` → `[✅]`

---

## SPRINT 0 — Setup (Tâche #1)
**Durée** : 0,5 jour  
**Statut** : `[ ] En attente`

### Checklist
- [ ] Créer `workflows/phase-2/` (dossier de travail)
- [ ] Créer `workflows/phase-2-WF-Completed/` (dossier livraison)
- [ ] Créer `migrations/` (dossier SQL)
- [ ] Dupliquer WF-version final.json → `WF-phase-1-baseline.json` (NE PAS MODIFIER)
- [ ] Backup DB : `pg_dump intelligence_bot > backup_phase1_$(date +%Y%m%d).sql`
- [ ] Vérifier RAM VPS : `free -h` (doit rester > 500 MB libre)
- [ ] Vérifier Ollama actif : `curl http://localhost:11434/api/tags`
- [ ] Créer `PHASE_2_CHANGELOG.md` (voir template en bas de ce fichier)

### Critère de sortie
Backup DB fait + dossiers créés + Ollama up.

---

## SPRINT 1 — Corrections critiques (Tâches #2 #3 #4 #5)
**Durée** : 2-3 jours  
**Statut** : `[ ] En attente`  
**Prérequis** : Sprint 0 terminé

### Tâche #2 — Bug "0.00 MB" (WF-02)
**Fichier à modifier** : WF-02 dans n8n (node "Extract File Info")
```javascript
// Correction à appliquer
const file_size_bytes = $json.document.file_size || 0;
const file_size_mb = (file_size_bytes / 1048576).toFixed(2);
```
- [ ] Localiser le node dans WF-02
- [ ] Appliquer la correction
- [ ] Tester : PDF 500KB → affiche "0.48 MB" ✓
- [ ] Tester : XLSX 2MB → affiche "2.00 MB" ✓

### Tâche #3 — Callback préfixé "=" (WF-02 + WF-03)
**Pattern obligatoire** (CLAUDE.md §8) :
```javascript
const raw = $input.first().json.callback_query.data.replace(/^=/, '');
```
- [ ] WF-02 : trouver tous les nodes lisant callback_query.data → appliquer
- [ ] WF-03 : idem
- [ ] Tester bouton "Auto" → ne plante plus
- [ ] Tester bouton "Personnalisée" → ne plante plus

### Tâche #4 — Rapport Ollama vide (WF-03)
**Prompt simplifié pour phi3:mini** :
```
Analyse ce fichier et réponds UNIQUEMENT en JSON valide.
Format: {"summary":"...","key_points":["..."],"insights":["..."],"quality":"1-10"}
Données: {{data}}
```
**Paramètre API Ollama à ajouter** : `"format": "json"`
- [ ] Créer `prompts/ollama-prompts.md` avec le prompt simplifié
- [ ] Modifier WF-03 node Ollama : ajouter `format: json`
- [ ] Ajouter try/catch JSON.parse → fallback texte brut
- [ ] Ajouter colonne `llm_raw_response TEXT` dans sessions (migration SQL)
- [ ] Tester avec Grok désactivé

### Tâche #5 — Tests de régression
- [ ] Flow FR : /start → PDF → Auto → rapport OK
- [ ] Flow ENG : /start → XLSX → Auto → rapport OK
- [ ] Fallback Ollama : Grok down → rapport Ollama structuré OK
- [ ] Sauvegarder WF-02 et WF-03 corrigés dans `workflows/phase-2-WF-Completed/`

### Critère de sortie Sprint 1
Les 3 bugs ne se produisent plus. Rapport Ollama a du contenu réel.

---

## SPRINT 2 — WF-04 Analyse personnalisée (Tâches #6-#11)
**Durée** : 4-5 jours  
**Statut** : `[ ] En attente`  
**Prérequis** : Sprint 1 terminé

### Les 5 questions (FR / ENG)

| # | Français | English |
|---|----------|---------|
| Q1 | Quel est l'objectif principal de cette analyse ? | What is the main goal of this analysis? |
| Q2 | Quelles colonnes ou sections vous intéressent particulièrement ? | Which columns or sections are most relevant to you? |
| Q3 | Y a-t-il une période ou un filtre spécifique à appliquer ? | Is there a specific time period or filter to apply? |
| Q4 | Quel type de livrable souhaitez-vous ? (résumé / insights / recommandations) | What type of output do you need? (summary / insights / recommendations) |
| Q5 | À qui est destiné ce rapport ? | Who is the target audience for this report? |

### Machine à états sessions

```
'awaiting_custom'   → après clic bouton Personnalisée (question 1 envoyée)
'awaiting_q2'       → après réponse Q1 (question 2 envoyée)
'awaiting_q3'       → après réponse Q2
'awaiting_q4'       → après réponse Q3
'awaiting_q5'       → après réponse Q4
'processing_custom' → analyse en cours (question 5 reçue)
'completed'         → rapport envoyé
```

### Tâche #6 — Design (créer WF-04-flow.md)
- [ ] Écrire `workflows/phase-2/WF-04-flow.md` avec le schéma d'états
- [ ] Valider les 5 questions bilingues ci-dessus

### Tâche #7 — Migration PostgreSQL
```sql
-- migrations/002_add_custom_analysis.sql
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS custom_answers JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS current_question INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversation_state VARCHAR(30) DEFAULT 'idle';
```
- [ ] Créer le fichier SQL
- [ ] Appliquer : `docker exec -i n8n-postgres psql -U n8n -d intelligence_bot < migrations/002_add_custom_analysis.sql`
- [ ] Vérifier : `\d sessions`

### Tâche #8 — Construire WF-04 dans n8n
Structure du workflow :
```
Telegram Trigger (message texte)
    ↓
Check active session (SELECT WHERE chat_id + conversation_state LIKE 'awaiting_%')
    ↓ (session trouvée)
Switch par conversation_state
    ├─ awaiting_custom → Save Q1 answer + Send Q2 + UPDATE state='awaiting_q2'
    ├─ awaiting_q2    → Save Q2 answer + Send Q3 + UPDATE state='awaiting_q3'
    ├─ awaiting_q3    → Save Q3 answer + Send Q4 + UPDATE state='awaiting_q4'
    ├─ awaiting_q4    → Save Q4 answer + Send Q5 + UPDATE state='awaiting_q5'
    └─ awaiting_q5    → Save Q5 + Build prompt + Grok API + Send rapport
                        + UPDATE status='completed', state='idle'
```
- [ ] Créer WF-04 dans n8n
- [ ] Appliquer tous les patterns §8 CLAUDE.md
- [ ] Activer après 30s d'intervalle (rate limit setWebhook)

### Tâche #9 — Prompt Grok personnalisé
- [ ] Créer `prompts/grok-custom-prompt.md`
- [ ] Template avec injection des 5 réponses
- [ ] Tester sur 3 cas : finance (CSV), RH (XLSX), rapport annuel (PDF)

### Tâche #10 — Intégration WF-02 → WF-04
- [ ] WF-02 bouton "Personnalisée" : UPDATE sessions SET conversation_state='awaiting_custom', current_question=1
- [ ] WF-02 envoie Q1 au lieu de router vers WF-03
- [ ] Tester le handoff complet

### Tâche #11 — Cas limites
- [ ] Timeout 30 min : Cron toutes les 5 min → UPDATE sessions SET status='timeout' WHERE state LIKE 'awaiting_%' AND updated_at < NOW()-INTERVAL '30 minutes'
- [ ] /cancel : UPDATE conversation_state='idle' + message "Analyse annulée"
- [ ] Validation longueur réponse (3-500 chars)

### Critère de sortie Sprint 2
Flow complet : fichier → bouton Personnalisée → 5 questions → rapport Grok.

---

## SPRINT 3 — WF-06 Admin & Crédits (Tâches #12-#14)
**Durée** : 3-4 jours  
**Statut** : `[ ] En attente`  
**Prérequis** : Sprint 2 terminé

### Tâche #12 — WF-06 Commandes admin
| Commande | Action SQL |
|----------|------------|
| /admin_stats | SELECT COUNT sessions aujourd'hui, SUM tokens |
| /admin_credits 123456789 50 | UPDATE users SET credits_remaining = credits_remaining + 50 WHERE telegram_id = 123456789 |
| /admin_ban 123456789 | UPDATE users SET is_active = FALSE WHERE telegram_id = 123456789 |
| /admin_unban 123456789 | UPDATE users SET is_active = TRUE WHERE telegram_id = 123456789 |
| /admin_list_users | SELECT telegram_id, first_name, credits_remaining, last_active_at FROM users ORDER BY last_active_at DESC LIMIT 10 |
| /admin_analytics | SELECT * FROM analytics_daily ORDER BY date DESC LIMIT 7 |

### Tâche #13 — Crédits dans WF-02, WF-03, WF-04
- [ ] WF-02 début : IF credits_remaining <= 0 → "Crédits épuisés. Contactez @SidneyRabe"
- [ ] WF-03 fin : UPDATE users SET credits_remaining = credits_remaining - 1
- [ ] WF-04 fin : UPDATE users SET credits_remaining = credits_remaining - 2

### Tâche #14 — Setup Sidney admin
```sql
-- Remplacer par le vrai telegram_id de Sidney
UPDATE users SET is_admin = TRUE WHERE telegram_id = XXXXXXXXXXXX;
```
- [ ] Trouver telegram_id de Sidney : `SELECT * FROM users;`
- [ ] Appliquer l'UPDATE
- [ ] Tester les 6 commandes admin

### Critère de sortie Sprint 3
/admin_stats répond + crédits décrément après analyse.

---

## SPRINT 4 — Analytics (Tâches #15-#16)
**Durée** : 2 jours  
**Statut** : `[ ] En attente`  
**Prérequis** : Sprint 3 terminé

### Tâche #15 — Migration analytics_daily
```sql
-- migrations/003_analytics_daily.sql
CREATE TABLE IF NOT EXISTS analytics_daily (
  date                DATE PRIMARY KEY,
  total_sessions      INTEGER DEFAULT 0,
  successful_analyses INTEGER DEFAULT 0,
  failed_analyses     INTEGER DEFAULT 0,
  grok_calls          INTEGER DEFAULT 0,
  ollama_calls        INTEGER DEFAULT 0,
  total_tokens        INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  unique_users        INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### Tâche #16 — WF-ANALYTICS-DAILY
- [ ] Cron Trigger : 01:00 chaque jour
- [ ] Query agrégation depuis sessions (date = CURRENT_DATE - 1)
- [ ] INSERT/UPDATE analytics_daily
- [ ] Envoyer mini-rapport Telegram à Sidney
- [ ] Tester en lançant manuellement

### Critère de sortie Sprint 4
Rapport analytics reçu dans Telegram après exécution manuelle.

---

## SPRINT 5 — Tests & Hardening (Tâches #17-#19)
**Durée** : 2 jours  
**Statut** : `[ ] En attente`  
**Prérequis** : Sprint 4 terminé

### Tâche #17 — 6 scénarios de test end-to-end
| # | Scénario | Résultat attendu |
|---|----------|-----------------|
| 1 | Nouveau user FR → PDF → Auto | Rapport Grok reçu, user créé en DB |
| 2 | User ENG → XLSX → Custom (5 questions) | Rapport personnalisé reçu |
| 3 | Grok down → Ollama fallback | Rapport Ollama structuré (pas vide) |
| 4 | credits_remaining = 0 | Message "Crédits épuisés" |
| 5 | /cancel à la question 3 | "Analyse annulée", retour état idle |
| 6 | /admin_stats, credits, ban | Réponses correctes de WF-06 |

### Tâche #18 — Monitoring & backup
- [ ] Error Trigger global dans n8n → sendMessage admin
- [ ] Cron backup DB quotidien sur VPS :
  ```bash
  # Ajouter dans crontab : crontab -e
  0 2 * * * docker exec n8n-postgres pg_dump -U n8n intelligence_bot > /home/bran9910/backups/db_$(date +\%Y\%m\%d).sql
  ```
- [ ] Tester restauration depuis backup_phase1.sql
- [ ] Note : SSL Nginx expire juillet 2026 → renouveler avec certbot

### Tâche #19 — Documentation finale
- [ ] Mettre à jour CLAUDE.md §5 : Phase 2 ✅ (date)
- [ ] Mettre à jour CLAUDE.md §7 : WF-04, WF-06, WF-ANALYTICS → ✅ Actif
- [ ] Ajouter patterns n8n découverts en §8
- [ ] Copier tous les WF JSON finaux dans `workflows/phase-2-WF-Completed/`
- [ ] Finaliser PHASE_2_CHANGELOG.md
- [ ] Mettre à jour README.md avec nouvelles fonctionnalités
- [ ] CLAUDE.md §12 : Phase actuelle → Phase 3

---

## FICHIERS À CRÉER EN PHASE 2

| Fichier | Sprint | Description |
|---------|--------|-------------|
| `workflows/phase-2/WF-04-flow.md` | 2.1 | Schéma états WF-04 |
| `migrations/002_add_custom_analysis.sql` | 2.2 | Colonnes custom answers |
| `migrations/003_analytics_daily.sql` | 4.1 | Table analytics |
| `prompts/grok-custom-prompt.md` | 2.4 | Prompt analyse personnalisée |
| `prompts/ollama-prompts.md` | 1.3 | Prompts allégés pour phi3:mini |
| `PHASE_2_CHANGELOG.md` | 0 | Journal des modifications |
| `workflows/phase-2-WF-Completed/*.json` | 5.3 | WF finaux exportés de n8n |

---

## TEMPLATE PHASE_2_CHANGELOG.md

```markdown
# PHASE_2_CHANGELOG.md

## Sprint 1 — Corrections critiques
### [DATE] — Bug 0.00 MB
- Correction : file_size = document.file_size / 1048576
- Testé : OK sur PDF/XLSX/CSV

### [DATE] — Callback préfixé =
- ...

## Sprint 2 — WF-04
### [DATE] — Migration PostgreSQL
- SQL appliqué : 002_add_custom_analysis.sql
- ...
```

---

## PATTERNS N8N CRITIQUES (rappel)

Toujours appliquer ces règles avant d'écrire du code dans n8n :

1. **PostgreSQL RETURNING** → `$input.first().json` (sans `[0]`)
2. **queryParams** → à ajouter manuellement après import JSON
3. **IF boolean** → utiliser `type Number + is not empty` (pas `!!$json.field`)
4. **sendChatAction** → ne pas utiliser (non supporté)
5. **Inline keyboard** → configurer manuellement (ne s'importe pas)
6. **Callback data** → toujours `.replace(/^=/, '')`
7. **Code node []** → connecter nodes critiques en amont
8. **$env** → déclarer dans `.env` ET `docker-compose.yml`
9. **JSON complexe** → encoder en Base64 pour queryParams
10. **Multi-WF activation** → 30 secondes entre chaque Publish

---

*Map créée le 7 avril 2026 — 19 tâches dans Claude Code*
