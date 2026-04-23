# Intelligence Bot v2.0 — Analyse Critique & Plan d'Architecture

> Document de référence — Sidney RABEHAMINA
> Date : 4 avril 2026
> Projet : Intelligence Bot (Telegram + n8n + Grok API)

---

## PARTIE 1 — ANALYSE CRITIQUE DU PROJET EXISTANT

### 1.1 Points forts

**Architecture modulaire bien pensée.** La séparation en workflows distincts (01-start, 02-file-receiver, 04-custom-analysis) est un bon pattern. Chaque workflow a une responsabilité claire, ce qui facilite le debug et l'évolution indépendante.

**Extracteurs de fichiers solides.** Le code `file-extractors.js` couvre les 4 types de fichiers avec une gestion d'erreur correcte. Le parser CSV avec détection automatique du délimiteur (virgule, point-virgule, tabulation) et gestion des guillemets est un vrai plus — beaucoup de bots se cassent sur les CSV européens avec point-virgule.

**Prompts Grok bien calibrés.** Le choix de temperature 0.3 est pertinent pour de l'analyse factuelle. Les prompts demandent du JSON structuré, ce qui permet un parsing automatique côté n8n. Le fallback error en JSON (`error_type`, `suggestion`) est une bonne pratique souvent oubliée.

**Bilingue dès le départ.** Peu de bots Telegram freelance sont bilingues FR/EN. C'est un avantage concurrentiel réel sur Fiverr, surtout pour le marché francophone africain.

**Le concept de deux modes d'analyse (Auto/Personnalisée)** donne à l'utilisateur le choix entre rapidité et précision. C'est un pattern UX que les clients comprennent intuitivement.

### 1.2 Faiblesses critiques

**W1 — Workflow-03 manquant.** C'est le problème le plus bloquant. L'analyse automatique (mode Auto) est le workflow le plus utilisé par un utilisateur lambda (qui ne veut pas répondre à 5 questions). Sans ce workflow, le bot n'offre que le mode personnalisé. Le fichier `03-analyse-automatique-datalens.md` documente le flux mais le JSON n8n n'existe pas.

**W2 — Google Sheets comme base de données.** Les limites sont documentées dans `google-sheets-limits.md`, mais le problème est plus profond que les quotas. Stocker des réponses Grok (JSON de 3-5 KB) dans une cellule Google Sheets, c'est forcer un tableur à jouer le rôle d'une base de données. Les conséquences concrètes : pas de requêtes SQL (impossible de filtrer "toutes les sessions erreur du dernier jour"), latence réseau pour chaque lecture/écriture (Sheets API = appel HTTPS vers Google, vs PostgreSQL local en microsecondes), et 10M cellules maximum — avec 16 colonnes et des JSON lourds, tu atteins 1000-10 000 sessions max.

**W3 — Aucun fallback LLM.** Si l'API Grok est down, rate-limited, ou si xAI change ses quotas, le bot est mort. Pas de retry intelligent, pas de fallback local, pas de message d'erreur propre à l'utilisateur. Un client Fiverr qui paie pour un bot et qui voit "Error 429" va laisser une mauvaise note.

**W4 — Gestion d'erreur insuffisante dans les workflows.** Les extracteurs ont un try/catch basique, mais les workflows n8n eux-mêmes n'ont pas de branche d'erreur visible. Que se passe-t-il si le fichier Telegram est trop gros (20 MB) ? Si le buffer est corrompu ? Si Grok retourne du texte au lieu du JSON attendu ? Chaque point de défaillance a besoin d'un chemin d'erreur explicite qui informe l'utilisateur en langage clair.

**W5 — Pas de limitation de taille de fichier.** Le code `prepareForGrok` tronque à 12 000 caractères pour les documents et 100 lignes pour les données, mais l'utilisateur n'est jamais prévenu que son fichier de 500 pages ou 50 000 lignes sera tronqué. Il recevra une analyse partielle sans le savoir.

**W6 — Pas de validation du JSON Grok.** Le prompt demande du JSON, mais Grok peut retourner du markdown, du texte libre, ou du JSON malformé. Le workflow n'a aucun node de validation/parsing JSON. Un `JSON.parse()` qui échoue silencieusement va crasher le workflow.

### 1.3 Angles morts

**A1 — Aucune gestion multi-fichier.** L'utilisateur ne peut envoyer qu'un fichier à la fois. Cas d'usage réel : "Compare ces deux fichiers CSV mois par mois". C'est un scénario fréquent en analyse de données.

**A2 — Pas de persistance de conversation.** Si l'utilisateur envoie un fichier, reçoit l'analyse, puis demande "approfondir la région Sud", le bot n'a aucun contexte. Chaque interaction est stateless. Le menu "Approfondir un point" affiché en fin d'analyse est un leurre s'il n'y a pas de mémoire conversationnelle.

**A3 — Aucune authentification/restriction d'accès.** N'importe qui peut envoyer `/start` et utiliser le bot. Pas de système de whitelist, pas de compteur d'utilisation, pas de système de tokens. Un bot public sans restriction va se faire abuser (envoi de fichiers malveillants, spam de requêtes Grok qui coûtent de l'argent).

**A4 — Pas de feedback loop.** Après l'analyse, l'utilisateur ne peut pas noter la qualité du rapport. Sans feedback, tu ne peux pas savoir quels prompts fonctionnent bien et lesquels produisent des résultats médiocres.

**A5 — Fichiers images et audio ignorés.** Les utilisateurs Telegram envoient souvent des screenshots de tableaux, des photos de documents papier, ou des messages vocaux. Le bot les ignore silencieusement.

**A6 — Timeout Grok non géré.** Le timeout est fixé à 60s dans la config, mais si Grok met 45s à répondre, l'utilisateur voit un bot silencieux pendant 45 secondes. Pas de message "Analyse en cours..." envoyé proactivement pendant l'attente.

### 1.4 Pertinence commerciale

**Verdict : vendable, mais dans un créneau précis.**

Le marché des bots Telegram d'analyse de données sur Fiverr est encore peu mature. La plupart des gigs "Telegram bot" sont des bots de gestion de groupe, bots crypto, ou bots de notification. Un bot d'analyse de fichiers est un positionnement différenciant.

Cependant, en l'état actuel, le bot est une v0.5 plutôt qu'un produit vendable. Les points bloquants pour une offre commerciale sont l'absence du workflow-03 (le mode le plus utilisé n'existe pas), l'absence de gestion d'erreur propre (un client ne doit jamais voir une erreur technique), et l'absence de contrôle d'accès (tu ne peux pas le déployer pour un client sans risque d'abus). Avec les améliorations proposées en Parties 2 et 3, le bot devient vendable entre 150€ et 500€ par déploiement sur Fiverr.

---

## PARTIE 2 — 5 NOUVELLES IDÉES D'AMÉLIORATION

*(En plus des 5 déjà identifiées par Sidney)*

### Idée 6 — Système de tokens / crédits par utilisateur

**Problème résolu :** Sans contrôle, chaque appel Grok coûte de l'argent. Un bot ouvert à tous va générer des coûts non maîtrisés. Côté client Fiverr, le client veut contrôler qui utilise le bot et combien.

**Implémentation :** Ajouter une table `users` dans PostgreSQL avec un champ `credits_remaining`. Chaque analyse consomme 1 crédit. L'admin (toi ou le client) peut ajouter des crédits via une commande `/admin add_credits @user 50`. Quand les crédits sont épuisés, le bot répond poliment et propose de contacter l'admin.

**Valeur portfolio :** Démontre la capacité à implémenter un système de monétisation — compétence directement vendable.

### Idée 7 — Export PDF du rapport d'analyse

**Problème résolu :** L'utilisateur reçoit le rapport en messages Telegram — texte + images séparées. Impossible de le partager professionnellement ou de l'archiver. Un client qui envoie ses données veut un livrable propre.

**Implémentation :** Après l'analyse, générer un PDF structuré via une API gratuite (par exemple, un template HTML converti en PDF via Puppeteer ou via l'API gratuite de html2pdf). Le PDF contient le rapport texte, les graphiques intégrés, et un en-tête avec la date et le nom du fichier. Envoyé comme document Telegram.

**Valeur portfolio :** Transforme le bot d'un outil de conversation en un outil de reporting. C'est la différence entre un gadget et un outil professionnel.

### Idée 8 — Analyse comparative (diff entre 2 fichiers)

**Problème résolu :** L'angle mort A1 identifié plus haut. En entreprise, le cas d'usage le plus courant est "compare ce mois avec le mois dernier" ou "compare ces deux sources de données". Aucun bot Telegram ne propose ça.

**Implémentation :** Après la première analyse, proposer un bouton "Comparer avec un autre fichier". Le bot stocke le premier dataset en session PostgreSQL, attend le second fichier, puis envoie les deux datasets à Grok avec un prompt de comparaison (delta, % de variation, nouvelles lignes, lignes disparues).

**Valeur portfolio :** Différenciateur massif sur Fiverr. Le mot "comparison" dans le titre d'un gig augmente significativement les clics.

### Idée 9 — Mémoire conversationnelle (follow-up questions)

**Problème résolu :** L'angle mort A2. L'utilisateur veut pouvoir dire "zoom sur les ventes de Mars" après avoir reçu l'analyse globale, sans renvoyer le fichier. Actuellement, chaque interaction est isolée.

**Implémentation :** Stocker le contexte de la dernière analyse dans la session PostgreSQL (données extraites + réponse Grok). Si l'utilisateur envoie un message texte (pas un fichier) après une analyse, le traiter comme une question de suivi. Injecter le contexte précédent dans le prompt Grok : "Voici l'analyse précédente : [contexte]. L'utilisateur demande : [message]". Limiter à 3 follow-ups par session pour contrôler les coûts API.

**Valeur portfolio :** Transforme le bot d'un outil one-shot en un assistant conversationnel. C'est le pattern qui fait la différence entre un bot basique et un produit premium.

### Idée 10 — Scheduled reports (rapports automatiques récurrents)

**Problème résolu :** Un client qui doit analyser le même fichier chaque semaine (export CRM, données de vente, logs) veut automatiser. Actuellement, il doit manuellement envoyer le fichier à chaque fois.

**Implémentation :** Commande `/schedule` qui configure un workflow n8n avec un cron trigger. Le bot va chercher le fichier à une URL donnée (Google Drive, Dropbox, endpoint API) à intervalle régulier (quotidien, hebdomadaire), lance l'analyse automatique, et envoie le rapport dans le chat Telegram. Configuration stockée dans PostgreSQL.

**Valeur portfolio :** C'est une fonctionnalité SaaS. Un bot avec des rapports automatiques se vend sur abonnement, pas en one-shot. Positionnement premium sur Fiverr.

---

## PARTIE 3 — PLAN D'ARCHITECTURE v2.0

### 3.1 Architecture révisée

```
                    ┌──────────────────┐
                    │   Telegram Bot   │
                    │   (Bot API)      │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │      n8n         │
                    │  (Orchestration) │
                    │  8 workflows     │
                    └───┬──┬──┬──┬─────┘
                        │  │  │  │
           ┌────────────┘  │  │  └────────────┐
           ▼               ▼  ▼               ▼
    ┌─────────────┐  ┌─────────┐  ┌──────────────┐
    │ PostgreSQL  │  │ Grok API│  │  QuickChart   │
    │ (Sessions,  │  │ (Main)  │  │  (Graphiques) │
    │  Users,     │  └────┬────┘  └──────────────┘
    │  Credits,   │       │
    │  Analytics) │  ┌────▼────┐
    └─────────────┘  │ Ollama  │
                     │(Fallback)│
                     └─────────┘

    ┌──────────────────────────────────────┐
    │         Services auxiliaires         │
    ├──────────────┬───────────────────────┤
    │ Whisper API  │  HTML→PDF (wkhtmltopdf)│
    │ (Transcription│  (Export rapports)    │
    │  vocale)     │                       │
    └──────────────┴───────────────────────┘

    ┌──────────────────────────────────────┐
    │      Dashboard Monitoring            │
    │  (HTML statique, données PostgreSQL) │
    └──────────────────────────────────────┘
```

### 3.2 Workflows n8n — Liste complète

| # | Workflow | Description | Priorité |
|---|---------|-------------|----------|
| WF-01 | `start-and-language` | `/start` → message d'accueil → choix langue → création session | MVP |
| WF-02 | `file-receiver` | Réception fichier → extraction → aperçu → menu analyse | MVP |
| WF-03 | `auto-analysis` | Analyse automatique DataLens-style (documents + données) | MVP |
| WF-04 | `custom-analysis` | Analyse personnalisée (5 questions interactives) | MVP |
| WF-05 | `follow-up` | Questions de suivi après analyse (mémoire conversationnelle) | V1.1 |
| WF-06 | `admin-commands` | `/admin` → gestion crédits, whitelist, stats | V1.1 |
| WF-07 | `voice-handler` | Réception message vocal → Whisper → traitement texte | V1.5 |
| WF-08 | `scheduled-reports` | Cron → fetch fichier → analyse auto → envoi rapport | V2.0 |

### 3.3 Description détaillée des workflows

**WF-01 — Start & Language**
```
Telegram Trigger (/start)
  → Check user exists in PostgreSQL
  → IF new user: INSERT users (default 10 credits)
  → Send welcome message (FR template)
  → Inline keyboard: [FR] [ENG]
  → On callback: UPDATE session language
  → Send "Envoyez votre fichier..."
```

**WF-02 — File Receiver**
```
Telegram Trigger (document/file)
  → Check user credits > 0
  → IF no credits: "Crédits épuisés, contactez l'admin"
  → Get file from Telegram API
  → Detect file type (router)
  → IF unsupported: "Format non supporté. Envoyez PDF, DOCX, XLSX ou CSV."
  → IF file > 15MB: "Fichier trop volumineux (max 15 MB)"
  → Extract content (pdf-parse / xlsx / mammoth / CSV parser)
  → IF extraction fails: "Impossible de lire ce fichier. Vérifiez qu'il n'est pas protégé."
  → Generate preview (5 premières lignes ou 500 premiers caractères)
  → Send preview + inline keyboard: [Auto] [Personnalisée]
  → Store extracted data in session (PostgreSQL)
```

**WF-03 — Auto Analysis (LE WORKFLOW MANQUANT)**
```
Telegram Trigger (callback "auto")
  → Send "⏳ Analyse en cours... (15-30 secondes)"
  → Load session data from PostgreSQL
  → Determine content type (document vs données)
  → Build Grok prompt (auto-document or auto-data)
  → Call Grok API (primary)
  → IF Grok fails (429/500/timeout):
      → Call Ollama (fallback, Mistral 7B)
      → IF Ollama fails: send error message, refund credit
  → Validate JSON response (try parse + schema check)
  → IF invalid JSON: extract text, build best-effort report
  → IF data type:
      → Extract chart configs from Grok response
      → Generate QuickChart URLs (max 4 charts)
      → Send charts as Telegram photos
  → Format report as Telegram message (markdown)
  → Send report
  → Send action menu: [Approfondir] [Nouveau fichier] [Terminer]
  → Deduct 1 credit
  → UPDATE session (status=completed, grok_response, updated_at)
  → UPDATE analytics (increment counters)
```

**WF-04 — Custom Analysis**
```
(Déjà fonctionnel — ajouter fallback Ollama + validation JSON + déduction crédit)
```

**WF-05 — Follow-up**
```
Telegram Trigger (text message, not command, not file)
  → Load active session from PostgreSQL (WHERE chat_id AND status='completed' AND updated_at > NOW() - 30min)
  → IF no active session: "Envoyez un fichier pour démarrer une analyse."
  → IF follow_up_count >= 3: "Limite de questions atteinte. Envoyez un nouveau fichier."
  → Build context prompt: previous analysis + user question
  → Call Grok API
  → Send response
  → INCREMENT follow_up_count
```

**WF-06 — Admin Commands**
```
Telegram Trigger (/admin)
  → Check if user is admin (PostgreSQL: users.is_admin = true)
  → Parse subcommand:
    /admin stats → query analytics, send summary
    /admin credits @user N → update credits
    /admin whitelist @user → set user.is_active = true
    /admin ban @user → set user.is_active = false
    /admin users → list active users count
```

### 3.4 Schéma PostgreSQL

```sql
-- ============================================
-- TABLE: users
-- ============================================
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    telegram_id     BIGINT UNIQUE NOT NULL,
    telegram_username VARCHAR(255),
    first_name      VARCHAR(255),
    language        VARCHAR(3) DEFAULT 'FR',
    credits_remaining INTEGER DEFAULT 10,
    is_admin        BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_id ON users(telegram_id);

-- ============================================
-- TABLE: sessions
-- ============================================
CREATE TABLE sessions (
    id              SERIAL PRIMARY KEY,
    session_id      UUID DEFAULT gen_random_uuid(),
    user_id         INTEGER REFERENCES users(id),
    chat_id         BIGINT NOT NULL,
    status          VARCHAR(20) DEFAULT 'active',
        -- active, extracting, analyzing, completed, error
    file_name       VARCHAR(255),
    file_type       VARCHAR(10),
        -- pdf, excel, word, csv
    file_size_bytes INTEGER,
    extracted_preview TEXT,
        -- premiers 500 chars ou 5 lignes pour l'aperçu
    extracted_data  JSONB,
        -- données extraites complètes (pour follow-up)
    analysis_type   VARCHAR(10),
        -- auto, custom
    user_preferences JSONB,
        -- réponses aux 5 questions (mode custom)
    llm_used        VARCHAR(20) DEFAULT 'grok',
        -- grok, ollama
    llm_response    JSONB,
        -- réponse structurée du LLM
    llm_tokens_used INTEGER,
    llm_response_time_ms INTEGER,
    charts_generated INTEGER DEFAULT 0,
    follow_up_count INTEGER DEFAULT 0,
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_chat_id ON sessions(chat_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);

-- ============================================
-- TABLE: analytics (agrégations quotidiennes)
-- ============================================
CREATE TABLE analytics (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL DEFAULT CURRENT_DATE,
    total_sessions  INTEGER DEFAULT 0,
    total_auto      INTEGER DEFAULT 0,
    total_custom    INTEGER DEFAULT 0,
    total_errors    INTEGER DEFAULT 0,
    total_tokens    INTEGER DEFAULT 0,
    avg_response_ms INTEGER DEFAULT 0,
    files_pdf       INTEGER DEFAULT 0,
    files_excel     INTEGER DEFAULT 0,
    files_word      INTEGER DEFAULT 0,
    files_csv       INTEGER DEFAULT 0,
    lang_fr         INTEGER DEFAULT 0,
    lang_en         INTEGER DEFAULT 0,
    grok_calls      INTEGER DEFAULT 0,
    ollama_calls    INTEGER DEFAULT 0,
    unique_users    INTEGER DEFAULT 0,
    UNIQUE(date)
);

-- ============================================
-- TABLE: scheduled_reports (V2.0)
-- ============================================
CREATE TABLE scheduled_reports (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id),
    chat_id         BIGINT NOT NULL,
    source_url      TEXT NOT NULL,
        -- URL du fichier à récupérer (GDrive, Dropbox, etc.)
    source_type     VARCHAR(20),
        -- gdrive, dropbox, url
    cron_expression VARCHAR(50),
        -- ex: "0 8 * * 1" = lundi 8h
    analysis_type   VARCHAR(10) DEFAULT 'auto',
    is_active       BOOLEAN DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 Mécanisme de fallback LLM

```
┌─────────────────────────────────────┐
│         LLM Request Router          │
│                                     │
│  1. Try Grok API (grok-3)           │
│     timeout: 45s                    │
│     retry: 1x after 5s             │
│                                     │
│  2. IF Grok fails (429/500/timeout) │
│     → Log failure reason            │
│     → Try Ollama (Mistral 7B)       │
│       timeout: 90s (local = plus    │
│       lent mais pas de rate limit)  │
│                                     │
│  3. IF Ollama fails                 │
│     → Send error to user:           │
│       "Service temporairement       │
│        indisponible. Réessayez      │
│        dans quelques minutes."      │
│     → Refund credit                 │
│     → Log to analytics              │
└─────────────────────────────────────┘
```

Implémentation dans n8n : un node HTTP Request pour Grok, un node IF qui vérifie le statut de la réponse, un second node HTTP Request vers `http://localhost:11434/api/generate` pour Ollama en cas d'échec.

### 3.6 Flux utilisateur complet (du /start au rapport)

```
UTILISATEUR                          BOT (n8n)                         BACKEND
─────────────────────────────────────────────────────────────────────────────

/start                        →  WF-01: Check/create user     →  PostgreSQL INSERT
                              ←  "Bonjour ! Choisissez langue"
[FR]                          →  WF-01: Update session lang    →  PostgreSQL UPDATE
                              ←  "Envoyez votre fichier"
📎 ventes.csv (450 KB)        →  WF-02: Check credits (OK: 8)
                                  Download from Telegram
                                  Detect type: csv
                                  Extract: csv parser           →  Store in session
                              ←  "📋 Aperçu: 1247 lignes,
                                  8 colonnes. [Auto][Custom]"
[Auto]                        →  WF-03: Load session data
                              ←  "⏳ Analyse en cours..."
                                  Build Grok prompt
                                  Call Grok API                →  API xAI
                                  Parse JSON response
                                  Generate 3 chart URLs        →  QuickChart
                              ←  "📊 RAPPORT: ..."
                              ←  📈 Chart 1 (line)
                              ←  📊 Chart 2 (bar)
                              ←  ⚫ Chart 3 (scatter)
                              ←  "Actions: [Approfondir]
                                  [Nouveau fichier][Terminer]"
                                  Deduct 1 credit              →  PostgreSQL UPDATE
                                  Update analytics             →  PostgreSQL UPDATE
"Zoom sur la région Sud"      →  WF-05: Load previous context
                                  Build follow-up prompt
                                  Call Grok with context        →  API xAI
                              ←  "La région Sud représente..."
                                  follow_up_count++             →  PostgreSQL UPDATE
```

### 3.7 Ordre d'implémentation et priorités

```
PHASE 1 — MVP (Semaine 1-2)
══════════════════════════════
□ Migrer sessions vers PostgreSQL (tables users + sessions)
□ Créer WF-03 (analyse automatique) — BLOQUANT
□ Ajouter validation JSON des réponses Grok
□ Ajouter messages d'erreur utilisateur propres
□ Ajouter limitation taille fichier (15 MB)
□ Ajouter message "⏳ Analyse en cours..." pendant le traitement

PHASE 2 — Robustesse (Semaine 3)
══════════════════════════════════
□ Installer Ollama + Mistral 7B sur le VPS
□ Implémenter le fallback LLM (Grok → Ollama)
□ Créer WF-06 (admin commands) avec gestion crédits
□ Ajouter table analytics + agrégation quotidienne
□ Tester sous charge (10 sessions simultanées)

PHASE 3 — Différenciateurs (Semaine 4)
═══════════════════════════════════════
□ Créer WF-05 (follow-up questions / mémoire)
□ Ajouter export PDF des rapports
□ Créer le dashboard monitoring HTML

PHASE 4 — Premium (Semaine 5-6)
════════════════════════════════
□ Ajouter support Whisper (WF-07, messages vocaux)
□ Ajouter analyse comparative (2 fichiers)
□ Créer WF-08 (scheduled reports)
□ Préparer les fichiers portfolio / Fiverr
```

---

## PARTIE 4 — PLAN DE DÉPLOIEMENT

### 4.1 Structure des dossiers sur le VPS

```
~/intelligence-bot/
├── docker-compose.yml          # Compose principal (n8n + postgres déjà existants)
├── .env                        # Variables d'environnement
├── n8n-data/                   # Volume n8n (déjà existant via ~/n8n/)
├── ollama/
│   └── docker-compose.ollama.yml
├── workflows/
│   ├── WF-01-start-language.json
│   ├── WF-02-file-receiver.json
│   ├── WF-03-auto-analysis.json
│   ├── WF-04-custom-analysis.json
│   ├── WF-05-follow-up.json
│   └── WF-06-admin-commands.json
├── sql/
│   ├── 001-create-tables.sql
│   ├── 002-seed-admin.sql
│   └── 003-create-indexes.sql
├── dashboard/
│   └── index.html              # Dashboard monitoring single-file
├── scripts/
│   ├── backup-bot-db.sh
│   ├── cleanup-old-sessions.sh
│   └── health-check.sh
└── docs/
    ├── README.md
    └── TROUBLESHOOTING.md
```

### 4.2 Variables d'environnement

```bash
# .env — Intelligence Bot

# ─── Telegram ───
TELEGRAM_BOT_TOKEN=xxxxxxxxxx:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_ADMIN_ID=123456789

# ─── Grok API (xAI) ───
GROK_API_KEY=xai-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROK_MODEL=grok-3
GROK_TEMPERATURE=0.3
GROK_MAX_TOKENS=4000
GROK_TIMEOUT_MS=45000

# ─── PostgreSQL (réutiliser l'existant) ───
POSTGRES_HOST=n8n-postgres
POSTGRES_PORT=5432
POSTGRES_DB=intelligence_bot
POSTGRES_USER=n8n_user
POSTGRES_PASSWORD=xxxxxxxx

# ─── Ollama (fallback) ───
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=mistral:7b

# ─── Whisper (optionnel, Phase 4) ───
OPENAI_API_KEY=sk-xxxxxxxx

# ─── Bot Config ───
BOT_DEFAULT_CREDITS=10
BOT_MAX_FILE_SIZE_MB=15
BOT_MAX_FOLLOWUP=3
BOT_SESSION_TIMEOUT_MIN=30
```

### 4.3 Intégration avec l'infrastructure existante

Le VPS a déjà PostgreSQL 16 dans Docker pour n8n. Deux options :

**Option A — Créer une nouvelle base dans le même PostgreSQL (recommandé)**
```bash
# Se connecter au container postgres existant
docker exec -it n8n-postgres psql -U n8n_user -d postgres

# Créer la base dédiée au bot
CREATE DATABASE intelligence_bot;
\c intelligence_bot

# Exécuter les scripts SQL de création
\i /path/to/001-create-tables.sql
```

Avantage : pas de nouveau container, pas de RAM supplémentaire. Le backup quotidien existant (pg_dump + rclone) couvre automatiquement cette nouvelle base.

**Option B — Container PostgreSQL séparé**
Uniquement si tu veux isoler les données du bot de celles de n8n. Non recommandé vu les 4 GB de RAM limités.

### 4.4 Installation d'Ollama sur ARM

```bash
# Vérifier l'architecture
uname -m  # aarch64

# Ollama supporte ARM64 nativement
curl -fsSL https://ollama.com/install.sh | sh

# Ou via Docker (recommandé pour la cohérence)
# docker-compose.ollama.yml
```

```yaml
# docker-compose.ollama.yml
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    ports:
      - "127.0.0.1:11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        limits:
          memory: 2G
    networks:
      - n8n-network

volumes:
  ollama-data:

networks:
  n8n-network:
    external: true
```

**Attention RAM :** Mistral 7B quantifié (Q4_0) utilise environ 4 GB de RAM. Avec les 4 GB du VPS, c'est trop juste si n8n + PostgreSQL tournent. Solutions possibles :

1. **Utiliser un modèle plus petit** : `phi3:mini` (3.8B params, ~2 GB RAM) ou `tinyllama` (1.1B, ~700 MB). Moins bon que Mistral 7B mais suffisant pour un fallback.
2. **Augmenter la swap** : tu as déjà 2 GB de swap. Monter à 4 GB. Le modèle sera plus lent (swap = disque) mais fonctionnel en fallback.
3. **Upgrader le VPS** : passer au CAX21 (8 GB RAM, ~7€/mois). Le Mistral 7B tourne confortablement.

**Recommandation :** Commencer avec `phi3:mini` en fallback. Si le bot génère des revenus, upgrader le VPS et passer à Mistral 7B.

```bash
# Après installation Ollama
ollama pull phi3:mini
# Test
ollama run phi3:mini "Analyse ce texte: Bonjour le monde"
```

### 4.5 Ordre d'implémentation des workflows

```
JOUR 1 — Base de données
─────────────────────────
1. Créer la base intelligence_bot dans PostgreSQL existant
2. Exécuter 001-create-tables.sql
3. Exécuter 002-seed-admin.sql (insérer ton telegram_id comme admin)
4. Tester la connexion depuis n8n (node PostgreSQL)

JOUR 2 — WF-01 (Start)
───────────────────────
5. Créer le bot Telegram via @BotFather
6. Configurer les credentials Telegram dans n8n
7. Importer/adapter WF-01 pour écrire dans PostgreSQL au lieu de Google Sheets
8. Tester /start → vérifier INSERT dans users + sessions

JOUR 3 — WF-02 (File Receiver)
───────────────────────────────
9. Importer/adapter WF-02
10. Ajouter check crédits (SELECT credits_remaining FROM users)
11. Ajouter check taille fichier
12. Tester avec un CSV et un PDF
13. Vérifier que extracted_data est stocké en JSONB dans sessions

JOUR 4-5 — WF-03 (Auto Analysis) — LE PLUS IMPORTANT
──────────────────────────────────────────────────────
14. Créer WF-03 from scratch (basé sur 03-analyse-automatique-datalens.md)
15. Configurer credentials Grok API dans n8n
16. Implémenter:
    - Node "Send typing action" (message ⏳)
    - Node HTTP Request → Grok API
    - Node Code → JSON.parse + validation
    - Node IF → document vs données
    - Node Code → générer URLs QuickChart (données uniquement)
    - Node Telegram → envoyer rapport texte
    - Node Telegram → envoyer photos (charts)
    - Node PostgreSQL → UPDATE session + analytics
    - Branche erreur → message utilisateur + refund crédit
17. Tester avec 4 types de fichiers

JOUR 6 — WF-04 (Custom Analysis)
─────────────────────────────────
18. Adapter WF-04 existant pour PostgreSQL
19. Ajouter validation JSON + fallback
20. Tester les 5 questions interactives

JOUR 7 — Tests d'intégration
─────────────────────────────
21. Tester le flux complet /start → fichier → analyse → rapport
22. Tester en FR et EN
23. Tester les cas d'erreur (fichier corrompu, Grok timeout, pas de crédits)
24. Vérifier les données dans PostgreSQL
```

### 4.6 Tests avant mise en production

**Tests fonctionnels (obligatoires)**

| Test | Entrée | Résultat attendu |
|------|--------|------------------|
| Start FR | `/start` → FR | Session créée, message FR |
| Start EN | `/start` → ENG | Session créée, message EN |
| CSV auto | CSV 100 lignes → Auto | Rapport + 3 graphiques |
| Excel auto | XLSX multi-feuilles → Auto | Rapport + graphiques |
| PDF auto | PDF 3 pages → Auto | Rapport structuré |
| DOCX auto | DOCX avec tableaux → Auto | Rapport structuré |
| Custom | CSV → Custom → 5 réponses | Rapport personnalisé |
| Fichier trop gros | PDF 20 MB | Message "trop volumineux" |
| Format non supporté | Image .png | Message "format non supporté" |
| Plus de crédits | User avec 0 crédits | Message "crédits épuisés" |
| Fichier corrompu | PDF vide / binaire aléatoire | Message erreur propre |

**Tests de résilience**

| Test | Méthode | Résultat attendu |
|------|---------|------------------|
| Grok timeout | Couper temporairement la connectivité | Fallback Ollama ou message erreur |
| Double envoi rapide | 2 fichiers en 5s | Traitement séquentiel, pas de crash |
| Session expirée | Envoyer message 1h après analyse | "Envoyez un nouveau fichier" |

### 4.7 Points de surveillance après déploiement

**Monitoring immédiat (première semaine)**

1. **Logs n8n** : `docker logs n8n --tail 100 -f` — surveiller les erreurs d'exécution
2. **Base de données** : `SELECT status, COUNT(*) FROM sessions GROUP BY status;` — vérifier le ratio completed/error
3. **Temps de réponse Grok** : `SELECT AVG(llm_response_time_ms) FROM sessions WHERE created_at > NOW() - INTERVAL '1 day';`
4. **RAM** : `free -h` — vérifier que le VPS ne swappe pas en permanence
5. **Disque** : `df -h` — les fichiers temporaires Telegram s'accumulent-ils ?

**Monitoring continu (à automatiser)**

- Cron quotidien : `cleanup-old-sessions.sh` → DELETE sessions WHERE updated_at < NOW() - INTERVAL '30 days'
- Cron quotidien : `health-check.sh` → test /start, vérifier réponse, alerter par Telegram si échec
- Dashboard HTML : accessible sur `https://diney-n8n.duckdns.org/dashboard/` (servir via Nginx)

---

## PARTIE 5 — POSITIONNEMENT COMMERCIAL

### 5.1 Positionnement Fiverr / ComeUp

**Titre du gig Fiverr (EN) :**
"I will create an AI-powered Telegram bot that analyzes your documents and data files"

**Titre ComeUp (FR) :**
"Je crée votre bot Telegram IA pour analyser vos documents et fichiers de données"

**Tags :** telegram bot, data analysis, ai bot, document analysis, csv analysis, pdf analysis, n8n automation, grok ai, business intelligence

**Catégorie Fiverr :** Programming & Tech → Chatbots → Telegram Bot

### 5.2 Arguments de vente (du plus fort au moins fort)

1. **"Envoyez un fichier, recevez un rapport complet en 30 secondes"** — c'est le pitch en une phrase. Simple, concret, mesurable.

2. **Bilingue FR/EN natif** — cible le marché francophone africain (Madagascar, Sénégal, Côte d'Ivoire, Maroc) ET le marché anglophone. Peu de concurrents sur ce créneau.

3. **Self-hosted, 100% privé** — les données ne passent pas par un service tiers (à part le LLM). Pour les clients soucieux de la confidentialité (PME, cabinets comptables, ONG), c'est un argument fort vs. les solutions SaaS.

4. **Rapport avec graphiques** — pas juste du texte. Les graphiques QuickChart intégrés dans le rapport Telegram font la différence visuellement. Les captures d'écran du gig montrent des graphiques = plus de clics.

5. **Système de crédits intégré** — le client peut contrôler l'utilisation et les coûts. C'est une fonctionnalité "enterprise" que les bots concurrents n'ont pas.

6. **Architecture robuste avec fallback** — le bot ne tombe pas si un service est en panne. Argument technique pour les clients développeurs.

### 5.3 Grille tarifaire

| Offre | Prix | Contenu |
|-------|------|---------|
| **Basic** | 80-120€ | Bot Telegram + analyse auto (PDF/CSV) + 1 langue + Google Sheets sessions. Pas de fallback, pas de crédits. |
| **Standard** | 200-300€ | Bot complet (auto + custom) + bilingue + PostgreSQL + système crédits + dashboard monitoring |
| **Premium** | 400-600€ | Standard + fallback Ollama + export PDF + analyse comparative + messages vocaux (Whisper) + déploiement sur le VPS du client |
| **Add-on : Maintenance** | 30-50€/mois | Monitoring, mises à jour prompts, support technique |

**Stratégie de lancement :** Commencer avec l'offre Basic à 80€ pour obtenir les premiers avis (5 étoiles). Monter progressivement à 120€ puis proposer Standard et Premium. Les premiers clients seront des early adopters (startups, freelances) qui veulent un outil d'analyse rapide. Le marché premium (cabinets comptables, PME) viendra avec les avis positifs.

### 5.4 Concurrents directs et différenciation

**Concurrents Fiverr :**

La plupart des gigs "Telegram bot" sur Fiverr sont des bots de gestion de groupe (welcome, modération), des bots crypto (alertes prix), ou des bots e-commerce (catalogue produit). Très peu proposent de l'analyse de données.

Les quelques bots d'analyse existants utilisent généralement ChatGPT et ne gèrent que du texte — pas de fichiers Excel/CSV, pas de graphiques, pas de multi-langue.

**Concurrents SaaS :**

Julius AI, ChatCSV, SheetAI — ce sont des SaaS web, pas des bots Telegram. Avantage : plus polished. Inconvénient : prix élevé (20-50$/mois), pas personnalisable, données envoyées sur leurs serveurs.

**Ta différenciation :**

| Critère | Concurrents Fiverr | SaaS (Julius, etc.) | Intelligence Bot |
|---------|-------------------|---------------------|-----------------|
| Interface | Web/API | Web app | Telegram (mobile-first) |
| Fichiers supportés | Texte seul | CSV/Excel | PDF + DOCX + CSV + Excel |
| Graphiques | Non | Oui | Oui (QuickChart) |
| Bilingue | Rarement | EN only | FR + EN |
| Self-hosted | Non | Non | Oui |
| Prix | 50-200€ (one-shot) | 20-50$/mois | 80-600€ (one-shot) |
| Personnalisation | Limitée | Aucune | Totale |
| Confidentialité | Variable | Cloud | Self-hosted |

**Le positionnement gagnant** est : "Bot Telegram mobile-first, bilingue, self-hosted, pour les PME africaines et francophones qui veulent analyser leurs données sans compétence technique et sans abonnement SaaS coûteux."

### 5.5 Recommandations pour le portfolio

1. **Créer une vidéo démo de 60 secondes** : enregistrer l'écran Telegram montrant le flux complet /start → envoi CSV → réception rapport avec graphiques. Utiliser des données fictives réalistes (ventes Madagascar). Fiverr favorise fortement les gigs avec vidéo.

2. **Case study Notion bilingue** : comme pour DataLens et l'article Ariary. Montrer l'architecture, les technologies utilisées, et un exemple de rapport généré. Inclure le schéma ASCII de l'architecture.

3. **Captures d'écran** : 3-4 screenshots du bot en action dans Telegram, en montrant les graphiques et le rapport structuré. Les captures avec des graphiques sont les plus impactantes visuellement.

4. **GitHub** : publier une version sanitized (sans clés API) du code des extracteurs et du dashboard. Pas les workflows n8n complets (c'est le produit), mais suffisamment pour montrer la qualité du code.

---

## ANNEXE — Checklist résumée

```
MVP (2 semaines)
  ☐ PostgreSQL : tables users, sessions, analytics
  ☐ WF-03 : analyse automatique (le workflow manquant)
  ☐ Validation JSON des réponses Grok
  ☐ Messages d'erreur propres pour l'utilisateur
  ☐ Limitation taille fichier + message troncature
  ☐ Message "Analyse en cours..." pendant traitement

V1.1 (1 semaine)
  ☐ Ollama fallback (phi3:mini ou tinyllama)
  ☐ WF-06 : admin commands + système crédits
  ☐ WF-05 : follow-up questions (mémoire)
  ☐ Table analytics + agrégation quotidienne

V1.5 (1 semaine)
  ☐ Export PDF des rapports
  ☐ Dashboard monitoring HTML
  ☐ Tests de charge

V2.0 (2 semaines)
  ☐ WF-07 : messages vocaux Whisper
  ☐ Analyse comparative (2 fichiers)
  ☐ WF-08 : scheduled reports
  ☐ Video démo + case study Notion
  ☐ Lancement Fiverr + ComeUp
```

---

*Document généré le 4 avril 2026 — Sidney RABEHAMINA · Projet Intelligence Bot v1 → v2.0*
