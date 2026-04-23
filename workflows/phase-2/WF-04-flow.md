# WF-04-flow.md — Design Flow WF-04 Analyse Personnalisée

> Sprint 2.1 — Créé le 8 avril 2026

---

## 1. DÉCLENCHEUR

**Type** : Telegram Trigger — message texte entrant  
**Condition d'activation** : uniquement si `conversation_state LIKE 'awaiting_%'` en base pour ce chat_id  
⚠️ Ce WF ne répond jamais si aucune session awaiting n'existe → évite les conflits avec WF-01/WF-02.

---

## 2. LES 5 QUESTIONS BILINGUES

| # | Français | English |
|---|----------|---------|
| Q1 | Quel est l'objectif principal de cette analyse ? | What is the main goal of this analysis? |
| Q2 | Quelles colonnes ou sections vous intéressent particulièrement ? | Which columns or sections are most relevant to you? |
| Q3 | Y a-t-il une période ou un filtre spécifique à appliquer ? | Is there a specific time period or filter to apply? |
| Q4 | Quel type de livrable souhaitez-vous ? (résumé / insights / recommandations) | What type of output do you need? (summary / insights / recommendations) |
| Q5 | À qui est destiné ce rapport ? (ex: direction, équipe technique, client) | Who is the target audience for this report? (e.g. management, tech team, client) |

---

## 3. MACHINE À ÉTATS

```
[idle]
   ↓ (bouton "Personnalisée" cliqué dans WF-02)
[awaiting_custom]   ← Q1 envoyée par WF-02
   ↓ (utilisateur répond)
[awaiting_q2]       ← Q2 envoyée par WF-04
   ↓
[awaiting_q3]       ← Q3 envoyée
   ↓
[awaiting_q4]       ← Q4 envoyée
   ↓
[awaiting_q5]       ← Q5 envoyée
   ↓
[processing_custom] ← "Analyse en cours..." envoyé
   ↓
[idle]              ← Rapport envoyé + status='completed'
```

États d'exception :
- `/cancel` → retour direct vers `idle` depuis n'importe quel état `awaiting_*`
- Timeout 30 min → cron UPDATE `idle` + message "Session expirée"

---

## 4. SCHÉMA FLOW N8N

```
[Telegram Trigger]
       ↓
[Extract Message Data]  ← code node
       ↓
[IF: is /cancel ?]
  YES → [Get Session] → [UPDATE idle] → [Send "Annulé"] → [END]
  NO  ↓
[Get Active Session]  ← PostgreSQL SELECT WHERE chat_id + state LIKE 'awaiting_%'
       ↓
[IF: session found?]
  NO  → [END silencieux]
  YES ↓
[Extract Session Data]  ← code node
       ↓
[Validate Answer]  ← code node (longueur 3-500 chars)
  FAIL → [Send "Réponse trop courte/longue"] → [END]
  OK   ↓
[Switch: conversation_state]
  ├─ awaiting_custom → [Save Q1 + UPDATE awaiting_q2] → [Send Q2]
  ├─ awaiting_q2    → [Save Q2 + UPDATE awaiting_q3] → [Send Q3]
  ├─ awaiting_q3    → [Save Q3 + UPDATE awaiting_q4] → [Send Q4]
  ├─ awaiting_q4    → [Save Q4 + UPDATE awaiting_q5] → [Send Q5]
  └─ awaiting_q5    → [Save Q5 + UPDATE processing_custom]
                         ↓
                      [Send "Analyse en cours..."]
                         ↓
                      [Get Full Session Data]  ← SELECT extracted_data, file_type, etc.
                         ↓
                      [Build Custom Prompt]  ← code node
                         ↓
                      [Basic LLM Chain]  ← Ollama kimi-k2.5:cloud
                         ↓
                      [Parse Custom Response]  ← code node
                         ↓
                      [Format Custom Report]  ← code node
                         ↓
                      [Send Report]  ← Telegram sendMessage
                         ↓
                      [UPDATE session completed]  ← PostgreSQL
                         ↓
                      [Send Final Menu]  ← Telegram + inline keyboard
```

---

## 5. STRUCTURE `custom_answers` (JSONB)

```json
{
  "q1": "Analyser les ventes Q1 2024 pour identifier les tendances",
  "q2": "Colonnes : date_vente, montant, produit, région",
  "q3": "Janvier à mars 2024 uniquement",
  "q4": "Insights + recommandations",
  "q5": "Directeur commercial et équipe marketing"
}
```

---

## 6. COLONNES POSTGRESQL À AJOUTER

```sql
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS custom_answers JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS current_question INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversation_state VARCHAR(30) DEFAULT 'idle';
```

Fichier migration : `migrations/002_add_custom_analysis.sql`

---

## 7. INTÉGRATION WF-02 → WF-04

Quand l'utilisateur clique "Personnalisée" dans WF-02 :

```sql
UPDATE sessions
SET conversation_state = 'awaiting_custom',
    current_question = 1,
    analysis_type = 'custom',
    updated_at = NOW()
WHERE id = $1
```

WF-02 envoie ensuite Q1 directement (pas de redirection vers WF-04).  
WF-04 prend le relais dès la **première réponse texte** de l'utilisateur.

---

## 8. MESSAGE /CANCEL

**FR** :
```
❌ Analyse annulée.

Vous pouvez envoyer un nouveau fichier à tout moment.
```

**ENG** :
```
❌ Analysis cancelled.

You can send a new file at any time.
```

---

## 9. MESSAGES DE VALIDATION LONGUEUR

**FR** :
- Trop court (< 3 chars) : `⚠️ Réponse trop courte. Veuillez entrer au moins 3 caractères.`
- Trop long (> 500 chars) : `⚠️ Réponse trop longue (max 500 caractères). Veuillez reformuler.`

**ENG** :
- Too short : `⚠️ Response too short. Please enter at least 3 characters.`
- Too long : `⚠️ Response too long (max 500 characters). Please rephrase.`

---

## 10. CRITÈRE DE SORTIE SPRINT 2

Flow complet validé sur VPS :
1. Fichier CSV envoyé → bouton "Personnalisée" → 5 questions reçues une à une → rapport Ollama reçu ✅
2. /cancel à la question 3 → "Analyse annulée" ✅
3. Réponse < 3 chars → message d'erreur ✅
