# PHASE_2_CHANGELOG.md — Intelligence Bot v2.0
## Journal des modifications Phase 2

> Démarré le 7 avril 2026

---

## SPRINT 0 — Setup (7 avril 2026)
- [x] Dossier `workflows/phase-2/` créé
- [x] Dossier `workflows/phase-2-WF-Completed/` créé
- [x] Dossier `migrations/` créé
- [x] Snapshot baseline : `WF-phase-1-baseline.json` copié (NE PAS MODIFIER)
- [ ] Backup DB sur VPS : `pg_dump intelligence_bot > backup_phase1_YYYYMMDD.sql`
- [ ] Vérifier RAM VPS : `free -h`
- [ ] Vérifier Ollama actif

---

## SPRINT 1 — Corrections critiques ✅ (8 avril 2026)

### Bug 0.00 MB ✅
- Date : 8 avril 2026
- Correction : `getBinaryDataBuffer` → `buffer.length` pour taille réelle
- Fichier correctif : `workflows/phase-2/fix-detect-file-type.txt` + `fix-prepare-session-data.txt`
- Testé sur : CSV ✅

### Callback préfixé = ✅
- Date : 8 avril 2026
- Correction : `.replace(/^=/, '')` dans Extract Callback Data (WF-02 + WF-03)
- Testé : Bouton Auto ✅ / Bouton Personnalisée ✅

### Rapport Ollama vide ✅ → Résolu via remplacement LLM
- Date : 8 avril 2026
- Cause racine : Groq gpt-oss-120b incompatible avec structured JSON output (LangChain #34155)
- conversationalAgent → "Please provide a question or request."
- toolsAgent → output vide 3110ms
- chainLlm → output vide 2693ms
- Solution finale : **Basic LLM Chain + Ollama kimi-k2.5:cloud** (abandon Groq)

### Intégration Ollama Docker ✅
- Date : 8 avril 2026 après-midi
- Ollama migré de service systemd vers container Docker sur `n8n-network`
- Base URL n8n : `http://ollama:11434`
- Modèle : `kimi-k2.5:cloud`
- Volume conservé : `/usr/share/ollama/.ollama:/root/.ollama`
- Port exposé : `11434:11434` (pour Open WebUI)
- Journal détaillé : `VPS configuration/journal/2026-04-08_ollama-n8n-integration.md`

### Tests de régression Sprint 1 ✅
- Session 22 : ENG + CSV (sales_data.csv) → rapport complet 185873ms ✅
- Session 23 : FR + CSV (activites_communautaires_madagascar.csv) → rapport complet 45921ms ✅

### Bug résiduel cosmétique
- Label "Grok AI" encore affiché dans le rapport Telegram
- Fix : remplacer dans noeud "Format Report Message" (fichier `image/fix-format-report-message.txt` déjà corrigé → "Kimi AI")

---

## SPRINT 2 — WF-04 Analyse personnalisée ✅ (9 avril 2026)

### Migration PostgreSQL 002 ✅
- Date : 9 avril 2026
- SQL appliqué : OUI (`migrations/002_add_custom_analysis.sql`)
- Colonnes ajoutées : `custom_answers JSONB`, `current_question INTEGER`, `conversation_state VARCHAR(30)`
- Index créé : `idx_sessions_conversation_state`

### Machine à états conversationnelle ✅
- 5 questions bilingues FR/ENG implémentées
- États : `awaiting_custom` → `awaiting_q2` → ... → `awaiting_q5` → `processing_custom` → `idle`
- /cancel opérationnel (UPDATE conversation_state='idle')
- Validation longueur réponse (3-500 chars)

### WF-04C — Analyse personnalisée ✅
- Date : 9 avril 2026
- Fichier : `workflows/phase-2/WF-04C-Custom-Analysis.json`
- 35 nodes : Trigger → Cancel → Get Session → Validate → Switch → Q1-Q5 → Prompt → Ollama → Rapport
- LLM : Basic LLM Chain + Ollama kimi-k2.5:cloud
- Fix JSON output : instruction format ajoutée à la FIN du user prompt (fix-json-output-custom.txt)
- Correctif system prompt : "You are a data analysis API. Your ENTIRE response must be a single valid JSON object."

### Branchement WF-04 → WF-04C ✅
- "Extract Callback Data" modifié : gère auto_ ET custom_
- IF "Is Auto?" ajouté : auto → analyse auto / custom → Setup Custom Mode → Q1
- Fichier patch : `workflows/phase-2/WF-04-patch-custom-button.txt`

### Tests de validation Sprint 2 ✅
- Session 24 (FR + CSV sales_data.csv) → 5 questions → rapport Kimi 35s ✅
  - Qualité 8/10
  - Résumé exécutif : CA 67 555€, 4 mois, marge 31.4%
  - 4 points clés, 3 tendances, 3 insights, 3 recommandations
  - Adaptation audience, limites documentées
- Timeout /cancel : testé ✅
- Validation longueur : testé ✅

---

## SPRINT 3 — Admin & Crédits
### WF-06 construit
- Date :
- Commandes testées :

### Système crédits
- Date :
- WF-02 check crédits : oui/non
- WF-03 décrémente : oui/non
- WF-04 décrémente : oui/non

---

## SPRINT 4 — Analytics
### Migration PostgreSQL 003
- Date :
- SQL appliqué : oui/non

### WF-ANALYTICS-DAILY
- Date :
- Cron actif : oui/non
- Rapport reçu Telegram : oui/non

---

## SPRINT 5 — Tests & Docs
### Tests end-to-end
| Scénario | Résultat | Date |
|----------|----------|------|
| 1 - FR PDF Auto | | |
| 2 - ENG XLSX Custom | | |
| 3 - Fallback Ollama | | |
| 4 - Crédits épuisés | | |
| 5 - /cancel Q3 | | |
| 6 - Admin commands | | |

### Documentation finale
- CLAUDE.md mis à jour : oui/non
- README.md mis à jour : oui/non
- WF JSON exportés : oui/non

---

*Phase 2 clôturée le : [DATE]*
