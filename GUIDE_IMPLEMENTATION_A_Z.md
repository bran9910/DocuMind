# Guide d'Implémentation A-Z — Intelligence Bot v2.0
> Document de référence complet · Sidney RABEHAMINA · Avril 2026
> Infrastructure : VPS Hetzner CAX11 · n8n self-hosted · PostgreSQL 16 · Grok API

---

## Vue d'ensemble

```
PHASES            DURÉE       RÉSULTAT
─────────────────────────────────────────────────────
Phase 1 — MVP     Jours 1-7   Bot fonctionnel (auto + custom)
Phase 2 — V1.1    Jours 8-14  Ollama fallback + crédits + follow-up
Phase 3 — V1.5    Jours 15-21 PDF export + dashboard monitoring
Phase 4 — V2.0    Jours 22-35 Whisper + comparaison + scheduled reports
```

---

# PHASE 1 — MVP (Jours 1-7)

## JOUR 1 — Base de données PostgreSQL

### 1.1 Connexion au VPS

```bash
ssh bran9910@204.168.199.123
```

### 1.2 Créer la base intelligence_bot dans PostgreSQL existant

```bash
# Se connecter au container PostgreSQL
docker exec -it n8n-postgres psql -U n8n -d postgres

# Dans le shell psql :
CREATE DATABASE intelligence_bot;
\c intelligence_bot

# Vérifier
\l
# Tu dois voir intelligence_bot dans la liste
\q
```

### 1.3 Créer les fichiers SQL

```bash
mkdir -p ~/intelligence-bot/sql
```

#### Fichier : ~/intelligence-bot/sql/001-create-tables.sql

```bash
nano ~/intelligence-bot/sql/001-create-tables.sql
```

Colle exactement :

```sql
-- ============================================================
-- TABLE : users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                  SERIAL PRIMARY KEY,
    telegram_id         BIGINT UNIQUE NOT NULL,
    telegram_username   VARCHAR(255),
    first_name          VARCHAR(255),
    language            VARCHAR(3) DEFAULT 'FR',
    credits_remaining   INTEGER DEFAULT 10,
    is_admin            BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    last_active_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- ============================================================
-- TABLE : sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    id                      SERIAL PRIMARY KEY,
    session_uuid            UUID DEFAULT gen_random_uuid(),
    user_id                 INTEGER REFERENCES users(id),
    chat_id                 BIGINT NOT NULL,
    status                  VARCHAR(20) DEFAULT 'active',
    file_name               VARCHAR(255),
    file_type               VARCHAR(10),
    file_size_bytes         INTEGER,
    extracted_preview       TEXT,
    extracted_data          JSONB,
    analysis_type           VARCHAR(10),
    user_preferences        JSONB,
    llm_used                VARCHAR(20) DEFAULT 'grok',
    llm_response            JSONB,
    llm_tokens_used         INTEGER,
    llm_response_time_ms    INTEGER,
    charts_generated        INTEGER DEFAULT 0,
    follow_up_count         INTEGER DEFAULT 0,
    error_message           TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_chat_id    ON sessions(chat_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status     ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- ============================================================
-- TABLE : analytics (agrégations quotidiennes)
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics (
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

-- ============================================================
-- TABLE : scheduled_reports (V2.0)
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_reports (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id),
    chat_id         BIGINT NOT NULL,
    source_url      TEXT NOT NULL,
    source_type     VARCHAR(20),
    cron_expression VARCHAR(50),
    analysis_type   VARCHAR(10) DEFAULT 'auto',
    is_active       BOOLEAN DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FONCTION : mise à jour automatique de updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

#### Fichier : ~/intelligence-bot/sql/002-seed-admin.sql

```bash
nano ~/intelligence-bot/sql/002-seed-admin.sql
```

Colle (remplace TON_TELEGRAM_ID par ton vrai ID — tu peux le trouver via @userinfobot sur Telegram) :

```sql
-- Insérer l'admin (Sidney)
-- Remplace 123456789 par ton vrai Telegram ID
INSERT INTO users (telegram_id, telegram_username, first_name, language, credits_remaining, is_admin)
VALUES (123456789, 'bran9910', 'Sidney', 'FR', 9999, TRUE)
ON CONFLICT (telegram_id) DO UPDATE
SET is_admin = TRUE, credits_remaining = 9999;

-- Vérifier
SELECT id, telegram_id, telegram_username, is_admin, credits_remaining FROM users;
```

### 1.4 Exécuter les scripts SQL

```bash
# Exécuter la création des tables
docker exec -i n8n-postgres psql -U n8n -d intelligence_bot < ~/intelligence-bot/sql/001-create-tables.sql

# Vérifier les tables créées
docker exec -it n8n-postgres psql -U n8n -d intelligence_bot -c "\dt"
# Doit afficher : users, sessions, analytics, scheduled_reports

# Exécuter le seed admin (après avoir modifié ton Telegram ID)
docker exec -i n8n-postgres psql -U n8n -d intelligence_bot < ~/intelligence-bot/sql/002-seed-admin.sql
```

### 1.5 Configurer la connexion PostgreSQL dans n8n

1. Ouvre https://diney-n8n.duckdns.org
2. Menu gauche → **Credentials** → **Add Credential**
3. Cherche "PostgreSQL" → sélectionne
4. Remplis :
   - **Name :** `Intelligence Bot DB`
   - **Host :** `n8n-postgres`
   - **Port :** `5432`
   - **Database :** `intelligence_bot`
   - **User :** `n8n`
   - **Password :** (ton mot de passe PostgreSQL du .env)
5. **Test** → doit afficher "Connection successful" → **Save**

---

## JOUR 2 — Créer le bot Telegram + WF-01

### 2.1 Créer le bot Telegram via @BotFather

Sur Telegram, ouvre **@BotFather** et envoie :

```
/newbot
```

Réponds aux questions :
- **Name :** `Intelligence Bot`
- **Username :** `intelligence_analysis_bot` (ou autre disponible, doit finir par `_bot`)

BotFather te donne un token : `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`
→ **Note ce token précieusement**

Personnalise le bot :
```
/setdescription
→ Bot IA d'analyse de documents (PDF, DOCX, Excel, CSV) | FR & EN
/setcommands
→ start - Démarrer l'assistant
   help - Aide et commandes disponibles
   admin - Commandes administrateur
```

### 2.2 Configurer le credential Telegram dans n8n

1. n8n → **Credentials** → **Add Credential**
2. Cherche "Telegram" → sélectionne
3. **Name :** `Intelligence Bot Telegram`
4. **Access Token :** colle le token BotFather
5. **Save**

### 2.3 Créer WF-01 : Start & Language

Dans n8n → **Workflows** → **New Workflow** → Nomme-le `WF-01 - Start & Language`

#### Node 1 — Telegram Trigger
- Type : **Telegram Trigger**
- Credential : `Intelligence Bot Telegram`
- Updates : coche **message** uniquement
- **Renomme :** `Telegram: /start`

#### Node 2 — Filter /start
- Type : **IF**
- Condition : `{{ $json.message.text }}` **equals** `/start`
- **Renomme :** `Is /start ?`

#### Node 3 — Check/Create User (Code node)
- Type : **Code**
- Connecte depuis le "true" du IF
- **Renomme :** `Check or Create User`
- Colle ce code :

```javascript
// Récupérer les infos Telegram
const msg = $input.first().json.message;
const chatId = msg.chat.id;
const userId = msg.from.id;
const username = msg.from.username || '';
const firstName = msg.from.first_name || '';

return [{
  json: {
    chat_id: chatId,
    telegram_id: userId,
    username: username,
    first_name: firstName,
    timestamp: new Date().toISOString()
  }
}];
```

#### Node 4 — Upsert User in PostgreSQL
- Type : **PostgreSQL**
- Credential : `Intelligence Bot DB`
- Operation : **Execute Query**
- Query :
```sql
INSERT INTO users (telegram_id, telegram_username, first_name)
VALUES ($1, $2, $3)
ON CONFLICT (telegram_id) DO UPDATE
SET last_active_at = NOW(),
    telegram_username = EXCLUDED.telegram_username
RETURNING id, telegram_id, language, credits_remaining, is_admin, is_active;
```
- Query Parameters : `={{ $json.telegram_id }}, {{ $json.username }}, {{ $json.first_name }}`
- **Renomme :** `Upsert User`

#### Node 5 — Check if User Active (IF)
- Type : **IF**
- Condition : `{{ $json[0].is_active }}` **equals** `true`
- **Renomme :** `User Active?`

#### Node 6 — Send Banned Message (false branch)
- Type : **Telegram**
- Operation : **Send Message**
- Chat ID : `={{ $('Check or Create User').item.json.chat_id }}`
- Text :
```
⛔ Votre compte n'est pas actif.
Contactez l'administrateur.

⛔ Your account is not active.
Contact the administrator.
```

#### Node 7 — Send Welcome + Language Choice (true branch)
- Type : **Telegram**
- Operation : **Send Message**
- Chat ID : `={{ $('Check or Create User').item.json.chat_id }}`
- Text :
```
🤖 *Bonjour {{ $('Check or Create User').item.json.first_name }} !*

Je suis votre Assistant d'Analyse de Documents et Données.

📄 Je peux analyser : PDF · DOCX · Excel · CSV
📊 Je génère des rapports détaillés avec graphiques
🌍 Je parle français et anglais

*Choisissez votre langue / Choose your language :*
```
- **Parse Mode :** Markdown
- **Reply Markup :** Inline Keyboard :
  - Bouton 1 : Text=`🇫🇷 Français` / Callback=`lang_FR`
  - Bouton 2 : Text=`🇬🇧 English` / Callback=`lang_EN`
- **Renomme :** `Send Welcome Message`

#### Node 8 — Telegram Trigger (Callback)
- Type : **Telegram Trigger**
- Updates : coche **callback_query** uniquement
- **Renomme :** `Telegram: Language Callback`
> ⚠️ Ce node doit être dans un WORKFLOW SÉPARÉ ou géré via le même webhook. Dans n8n self-hosted, utilise un seul Telegram Trigger et filtre par type de update.

#### Node 9 — Save Language to PostgreSQL
- Type : **PostgreSQL**
- Operation : **Execute Query**
- Query :
```sql
UPDATE users
SET language = $1, last_active_at = NOW()
WHERE telegram_id = $2
RETURNING id, language, credits_remaining;
```
- Query Parameters : `={{ $json.callback_query.data.replace('lang_', '') }}, {{ $json.callback_query.from.id }}`

#### Node 10 — Send Confirmation + Request File
- Type : **Telegram**
- Operation : **Send Message**
- Chat ID : `={{ $json.callback_query.message.chat.id }}`
- Text (FR branch) :
```
✅ *Langue française sélectionnée !*

💳 Crédits disponibles : {{ $('Save Language').item.json[0].credits_remaining }}

📎 *Envoyez votre fichier pour commencer l'analyse*
Formats supportés : PDF · DOCX · Excel (.xlsx) · CSV

Taille maximum : 15 MB
```
- Parse Mode : Markdown

**Active le workflow → Save**

---

## JOUR 3 — WF-02 : File Receiver

Crée un nouveau workflow : `WF-02 - File Receiver`

#### Node 1 — Telegram Trigger (Document)
- Type : **Telegram Trigger**
- Updates : coche **message** uniquement
- **Renomme :** `Telegram: Receive File`

#### Node 2 — Filter: Is Document?
- Type : **IF**
- Condition : `{{ $json.message.document }}` **exists**
- **Renomme :** `Has Document?`

#### Node 3 — Prepare File Info (Code)
```javascript
const msg = $input.first().json.message;
const doc = msg.document;
const chatId = msg.chat.id;
const telegramId = msg.from.id;

const fileSizeMB = doc.file_size / (1024 * 1024);
const MAX_SIZE_MB = 15;

return [{
  json: {
    chat_id: chatId,
    telegram_id: telegramId,
    file_id: doc.file_id,
    file_name: doc.file_name || 'fichier',
    file_size: doc.file_size,
    file_size_mb: fileSizeMB.toFixed(2),
    mime_type: doc.mime_type || '',
    is_too_large: fileSizeMB > MAX_SIZE_MB
  }
}];
```

#### Node 4 — Check File Size (IF)
- Condition : `{{ $json.is_too_large }}` **equals** `true`

#### Node 5 — Send Size Error (true branch)
```
❌ *Fichier trop volumineux*

Taille : {{ $json.file_size_mb }} MB
Maximum autorisé : 15 MB

Compressez votre fichier ou envoyez un extrait.
```

#### Node 6 — Get User Info from PostgreSQL (false branch)
```sql
SELECT id, language, credits_remaining, is_active
FROM users
WHERE telegram_id = $1;
```
- Query Params : `={{ $json.telegram_id }}`

#### Node 7 — Check Credits (IF)
- Condition : `{{ $json[0].credits_remaining }}` **greater than** `0`

#### Node 8 — Send No Credits Message (false branch)
```
💳 *Crédits épuisés*

Vous n'avez plus de crédits d'analyse.
Contactez l'administrateur pour en obtenir davantage.

/admin pour info contact
```

#### Node 9 — Send Typing Action (true branch)
- Type : **Telegram**
- Operation : **Send Chat Action**
- Action : `typing`
- **Renomme :** `Send Typing`

#### Node 10 — Get File URL from Telegram
- Type : **HTTP Request**
- URL : `https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/getFile?file_id={{ $('Prepare File Info').item.json.file_id }}`
- Method : GET
- **Renomme :** `Get File URL`

#### Node 11 — Download File
- Type : **HTTP Request**
- URL : `https://api.telegram.org/file/bot{{ $env.TELEGRAM_BOT_TOKEN }}/{{ $json.result.file_path }}`
- Method : GET
- Response Format : **File** (Binary)
- **Renomme :** `Download File`

#### Node 12 — Detect File Type (Code)
```javascript
const fileInfo = $('Prepare File Info').item.json;
const fileName = fileInfo.file_name.toLowerCase();
const mimeType = fileInfo.mime_type.toLowerCase();

let detectedType = 'unknown';

if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
  detectedType = 'pdf';
} else if (mimeType.includes('excel') || mimeType.includes('spreadsheet') ||
           fileName.match(/\.(xlsx?|xlsm)$/i)) {
  detectedType = 'excel';
} else if (mimeType.includes('word') || mimeType.includes('document') ||
           fileName.match(/\.docx?$/i)) {
  detectedType = 'word';
} else if (mimeType.includes('csv') || fileName.endsWith('.csv')) {
  detectedType = 'csv';
}

// Récupérer le buffer du fichier téléchargé
const binaryData = $input.first().binary;
const fileKey = Object.keys(binaryData)[0];
const fileBuffer = Buffer.from(binaryData[fileKey].data, 'base64');

return [{
  json: {
    ...fileInfo,
    detectedType,
    isSupported: ['pdf', 'excel', 'word', 'csv'].includes(detectedType),
    fileBuffer: fileBuffer.toString('base64')
  }
}];
```

#### Node 13 — Supported? (IF)
- Condition : `{{ $json.isSupported }}` **equals** `true`

#### Node 14 — Send Unsupported Message (false)
```
❌ *Format non supporté*

Format détecté : {{ $json.mime_type }}

Formats acceptés :
📄 PDF (.pdf)
📝 Word (.docx, .doc)
📊 Excel (.xlsx, .xls)
📋 CSV (.csv)
```

#### Node 15 — Extract Content by Type (Switch)
- Type : **Switch**
- Route par `{{ $json.detectedType }}` (valeurs: pdf, excel, word, csv)

#### Nodes 16a-d — Extracteurs (Code nodes, un par type)

**Pour PDF** (`16a - Extract PDF`) :
```javascript
const pdfParse = require('pdf-parse');
const fileBuffer = Buffer.from($input.first().json.fileBuffer, 'base64');

try {
  const data = await pdfParse(fileBuffer, { max: 0 });
  const maxChars = 12000;
  const text = data.text;
  return [{
    json: {
      success: true,
      content_type: 'document',
      text: text.length > maxChars ? text.substring(0, maxChars) + '\n...[tronqué]' : text,
      num_pages: data.numpages,
      is_truncated: text.length > maxChars,
      char_count: text.length,
      ...$input.first().json
    }
  }];
} catch(e) {
  return [{ json: { success: false, error: e.message, ...$input.first().json } }];
}
```

**Pour Excel** (`16b - Extract Excel`) :
```javascript
const XLSX = require('xlsx');
const fileBuffer = Buffer.from($input.first().json.fileBuffer, 'base64');

try {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: null, blankrows: false });

  const headers = jsonData[0] || [];
  const rows = jsonData.slice(1, 101).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });

  const preview = `${workbook.SheetNames.length} feuille(s), ${jsonData.length - 1} lignes, ${headers.length} colonnes\nColonnes : ${headers.slice(0, 6).join(', ')}${headers.length > 6 ? '...' : ''}`;

  return [{
    json: {
      success: true,
      content_type: 'data',
      columns: headers,
      data: rows,
      total_rows: jsonData.length - 1,
      sheet_names: workbook.SheetNames,
      preview_text: preview,
      is_sample: jsonData.length > 102,
      ...$input.first().json
    }
  }];
} catch(e) {
  return [{ json: { success: false, error: e.message, ...$input.first().json } }];
}
```

**Pour Word** (`16c - Extract Word`) :
```javascript
const mammoth = require('mammoth');
const fileBuffer = Buffer.from($input.first().json.fileBuffer, 'base64');

try {
  const result = await mammoth.extractRawText({ buffer: fileBuffer });
  const maxChars = 12000;
  const text = result.value;
  return [{
    json: {
      success: true,
      content_type: 'document',
      text: text.length > maxChars ? text.substring(0, maxChars) + '\n...[tronqué]' : text,
      is_truncated: text.length > maxChars,
      char_count: text.length,
      ...$input.first().json
    }
  }];
} catch(e) {
  return [{ json: { success: false, error: e.message, ...$input.first().json } }];
}
```

**Pour CSV** (`16d - Extract CSV`) :
```javascript
const fileBuffer = Buffer.from($input.first().json.fileBuffer, 'base64');
const csvContent = fileBuffer.toString('utf-8');

const lines = csvContent.split('\n').filter(l => l.trim());
const firstLine = lines[0] || '';
let delimiter = ',';
if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';
else if (firstLine.includes('\t')) delimiter = '\t';

const parseLine = (line) => {
  const res = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
    else if (c === delimiter && !inQ) { res.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  res.push(cur.trim());
  return res;
};

const headers = parseLine(lines[0]);
const rows = lines.slice(1, 101).map(l => {
  const vals = parseLine(l);
  const row = {};
  headers.forEach((h, i) => { row[h] = vals[i] || null; });
  return row;
});

const preview = `${lines.length - 1} lignes, ${headers.length} colonnes\nColonnes : ${headers.slice(0, 6).join(', ')}${headers.length > 6 ? '...' : ''}`;

return [{
  json: {
    success: true,
    content_type: 'data',
    columns: headers,
    data: rows,
    total_rows: lines.length - 1,
    delimiter,
    preview_text: preview,
    is_sample: lines.length > 102,
    ...$input.first().json
  }
}];
```

#### Node 17 — Save Session to PostgreSQL
```sql
INSERT INTO sessions (user_id, chat_id, status, file_name, file_type, file_size_bytes, extracted_preview, extracted_data)
SELECT u.id, $1, 'extracted', $2, $3, $4, $5, $6::jsonb
FROM users u WHERE u.telegram_id = $7
RETURNING id, session_uuid::text;
```
- Query Params : `={{ $json.chat_id }}, {{ $json.file_name }}, {{ $json.detectedType }}, {{ $json.file_size }}, {{ $json.preview_text || ($json.text || '').substring(0, 500) }}, {{ JSON.stringify({columns: $json.columns, data: $json.data, text: $json.text, content_type: $json.content_type}) }}, {{ $json.telegram_id }}`

#### Node 18 — Build Preview Message (Code)
```javascript
const d = $input.first().json;
const lang = $('Get User Info from PostgreSQL').item.json[0].language || 'FR';
const sessionId = $json[0] ? $json[0].id : 0;

const isFR = lang === 'FR';
const preview = d.preview_text || `${d.content_type} extrait`;

const msg = isFR
  ? `📋 *Aperçu du fichier*\n\n📄 ${d.file_name}\n📏 ${d.file_size_mb} MB\n\n${preview}\n\n*Choisissez votre type d'analyse :*`
  : `📋 *File Preview*\n\n📄 ${d.file_name}\n📏 ${d.file_size_mb} MB\n\n${preview}\n\n*Choose your analysis type :*`;

return [{
  json: {
    ...d,
    preview_message: msg,
    session_id: sessionId,
    language: lang,
    btn_auto: isFR ? '⚡ Analyse Automatique' : '⚡ Auto Analysis',
    btn_custom: isFR ? '🎯 Analyse Personnalisée' : '🎯 Custom Analysis',
    cb_auto: `auto_${sessionId}`,
    cb_custom: `custom_${sessionId}`
  }
}];
```

#### Node 19 — Send Preview + Analysis Menu
- Type : **Telegram**
- Chat ID : `={{ $json.chat_id }}`
- Text : `={{ $json.preview_message }}`
- Parse Mode : Markdown
- Reply Markup : Inline Keyboard :
  - Bouton 1 : Text=`={{ $json.btn_auto }}` / Callback=`={{ $json.cb_auto }}`
  - Bouton 2 : Text=`={{ $json.btn_custom }}` / Callback=`={{ $json.cb_custom }}`

**Save + Activate**

---

## JOURS 4-5 — WF-03 : Auto Analysis (LE WORKFLOW CLÉ)

Crée : `WF-03 - Auto Analysis`

#### Node 1 — Telegram Trigger (Callback)
- Updates : **callback_query**
- **Renomme :** `Callback: Auto`

#### Node 2 — Filter Auto Callbacks (IF)
- Condition : `{{ $json.callback_query.data }}` **starts with** `auto_`

#### Node 3 — Extract Session ID (Code)
```javascript
const callbackData = $input.first().json.callback_query.data;
const sessionId = parseInt(callbackData.replace('auto_', ''));
const chatId = $input.first().json.callback_query.message.chat.id;
const telegramId = $input.first().json.callback_query.from.id;

return [{
  json: {
    session_id: sessionId,
    chat_id: chatId,
    telegram_id: telegramId
  }
}];
```

#### Node 4 — Answer Callback Query
- Type : **Telegram**
- Operation : **answerCallbackQuery**
- Callback Query ID : `={{ $('Callback: Auto').item.json.callback_query.id }}`
- Text : `Analyse en cours...`

#### Node 5 — Send Typing
- Type : **Telegram** → Send Chat Action → `typing`
- Chat ID : `={{ $json.chat_id }}`

#### Node 6 — Send "Analyzing" Message
- Type : **Telegram** → Send Message
- Chat ID : `={{ $json.chat_id }}`
- Text :
```
⏳ *Analyse en cours...*

🔍 Extraction des données
🤖 Interrogation de l'IA
📊 Génération des graphiques

_Cela prend 15-30 secondes..._
```
- Parse Mode : Markdown

#### Node 7 — Load Session from PostgreSQL
```sql
SELECT s.id, s.session_uuid, s.file_name, s.file_type, s.extracted_data,
       u.language, u.telegram_id, u.credits_remaining
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.id = $1 AND s.chat_id = $2;
```
- Query Params : `={{ $json.session_id }}, {{ $json.chat_id }}`

#### Node 8 — Validate Session (IF)
- Condition : `{{ $json[0] }}` **exists** AND `{{ $json[0].credits_remaining }}` **greater than** `0`

#### Node 9 — Build Grok Prompt (Code)
```javascript
const session = $input.first().json[0];
const extractedData = session.extracted_data;
const lang = session.language || 'FR';
const fileType = session.file_type;
const fileName = session.file_name;

let prompt = '';

if (extractedData.content_type === 'data') {
  // Prompt analyse données (CSV/Excel)
  const dataStr = JSON.stringify({
    columns: extractedData.columns,
    sample_data: extractedData.data ? extractedData.data.slice(0, 50) : [],
    total_rows: extractedData.total_rows
  });

  prompt = `Tu es un data analyst senior. Analyse ce dataset et produis un rapport complet.

DONNÉES :
${dataStr}

FICHIER : ${fileName} (${fileType.toUpperCase()})
LANGUE DE RÉPONSE : ${lang === 'FR' ? 'Français' : 'English'}

INSTRUCTIONS :
1. Analyse statistique descriptive par colonne
2. Détecte tendances, anomalies, corrélations
3. Propose 3 graphiques pertinents avec leurs données
4. Produis un résumé exécutif actionnable

FORMAT REQUIS (JSON valide uniquement, sans markdown) :
{
  "executive_summary": "3-4 phrases synthétiques",
  "overview": {"rows": N, "columns": N, "data_quality": "score/10", "period": "description"},
  "key_findings": ["finding 1", "finding 2", "finding 3"],
  "statistics": {"colonne": {"type": "numeric|categorical", "insight": "observation clé"}},
  "detections": {"trends": [], "anomalies": [], "correlations": []},
  "charts": [
    {"type": "line|bar|scatter|pie", "title": "titre", "x": "colonne", "y": "colonne", "insight": "explication"},
    {"type": "bar", "title": "titre 2", "x": "colonne", "y": "colonne", "insight": "explication"},
    {"type": "scatter", "title": "titre 3", "x": "colonne", "y": "colonne", "insight": "explication"}
  ],
  "recommendations": ["reco 1", "reco 2"]
}`;

} else {
  // Prompt analyse document (PDF/DOCX)
  const text = extractedData.text || '';

  prompt = `Tu es un analyste de documents senior. Analyse ce document.

DOCUMENT :
${text}

FICHIER : ${fileName} (${fileType.toUpperCase()})
LANGUE DE RÉPONSE : ${lang === 'FR' ? 'Français' : 'English'}

INSTRUCTIONS :
1. Résumé exécutif (3-4 phrases)
2. Points clés (5 max)
3. Insights non évidents (2-3)
4. Public cible et type de document

FORMAT REQUIS (JSON valide uniquement, sans markdown) :
{
  "executive_summary": "string",
  "key_points": ["point 1", "point 2", "point 3"],
  "insights": ["insight 1", "insight 2"],
  "document_type": "type détecté",
  "target_audience": "public cible",
  "quality_score": "score/10",
  "entities_detected": ["entités importantes"],
  "recommendations": ["reco 1"]
}`;
}

return [{
  json: {
    session_id: session.id,
    chat_id: $('Extract Session ID').item.json.chat_id,
    telegram_id: $('Extract Session ID').item.json.telegram_id,
    language: lang,
    file_type: fileType,
    file_name: fileName,
    content_type: extractedData.content_type,
    extracted_data: extractedData,
    prompt: prompt,
    start_time: Date.now()
  }
}];
```

#### Node 10 — Call Grok API
- Type : **HTTP Request**
- Method : POST
- URL : `https://api.x.ai/v1/chat/completions`
- Authentication : Header Auth
  - Header : `Authorization`
  - Value : `Bearer {{ $env.GROK_API_KEY }}`
- Body (JSON) :
```json
{
  "model": "grok-3",
  "messages": [
    {
      "role": "system",
      "content": "Tu es un analyste expert. Réponds UNIQUEMENT avec le JSON demandé, sans markdown, sans texte avant ou après."
    },
    {
      "role": "user",
      "content": "={{ $json.prompt }}"
    }
  ],
  "temperature": 0.3,
  "max_tokens": 4000
}
```
- Timeout : 45000ms
- **On Error :** Continue (pour gérer le fallback)
- **Renomme :** `Call Grok API`

#### Node 11 — Grok Success? (IF)
- Condition : `{{ $json.choices }}` **exists**

#### Node 12 — Parse Grok Response (Code) — true branch
```javascript
const response = $input.first().json;
const content = response.choices[0].message.content;
const startTime = $('Build Grok Prompt').item.json.start_time;
const responseTimeMs = Date.now() - startTime;
const tokensUsed = response.usage ? response.usage.total_tokens : 0;

// Tenter de parser le JSON
let parsed = null;
let parseError = null;

try {
  // Nettoyer le contenu (parfois Grok ajoute ```json ... ```)
  let clean = content.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  }
  parsed = JSON.parse(clean);
} catch(e) {
  parseError = e.message;
  // Fallback : créer une réponse minimale
  parsed = {
    executive_summary: content.substring(0, 500),
    key_points: ["Analyse disponible en format texte"],
    parse_error: true
  };
}

return [{
  json: {
    ...$('Build Grok Prompt').item.json,
    grok_response: parsed,
    raw_content: content,
    response_time_ms: responseTimeMs,
    tokens_used: tokensUsed,
    llm_used: 'grok',
    parse_success: !parseError
  }
}];
```

#### Node 13 — Fallback to Ollama (false branch)
- Type : **HTTP Request**
- Method : POST
- URL : `http://ollama:11434/api/generate`
- Body :
```json
{
  "model": "phi3:mini",
  "prompt": "={{ $('Build Grok Prompt').item.json.prompt }}",
  "stream": false,
  "options": { "temperature": 0.3 }
}
```
- Timeout : 120000ms
- **Renomme :** `Call Ollama Fallback`

#### Node 14 — Parse Ollama Response (Code)
```javascript
const response = $input.first().json;
const content = response.response || '';
const startTime = $('Build Grok Prompt').item.json.start_time;

let parsed = null;
try {
  let clean = content.trim();
  if (clean.startsWith('```')) clean = clean.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  parsed = JSON.parse(clean);
} catch(e) {
  parsed = { executive_summary: content.substring(0, 500), key_points: ["Analyse en mode dégradé (fallback)"], parse_error: true };
}

return [{
  json: {
    ...$('Build Grok Prompt').item.json,
    grok_response: parsed,
    raw_content: content,
    response_time_ms: Date.now() - startTime,
    tokens_used: 0,
    llm_used: 'ollama',
    parse_success: !parsed.parse_error
  }
}];
```

#### Node 15 — Format Report Message (Code)
```javascript
const d = $input.first().json;
const r = d.grok_response;
const lang = d.language;
const isFR = lang === 'FR';

let message = '';

if (d.content_type === 'data') {
  // Rapport données
  const header = isFR ? '📊 *RAPPORT D\'ANALYSE*' : '📊 *ANALYSIS REPORT*';
  const overview = r.overview || {};
  const findings = (r.key_findings || []).map((f, i) => `${i+1}. ${f}`).join('\n');
  const recos = (r.recommendations || []).map(r => `• ${r}`).join('\n');

  message = `${header}
📄 *${d.file_name}*
🤖 ${d.llm_used === 'ollama' ? '⚠️ Mode fallback (Ollama)' : 'Grok AI'}

📋 *${isFR ? 'Vue d\'ensemble' : 'Overview'}*
${overview.rows || '?'} lignes · ${overview.columns || '?'} colonnes · Qualité : ${overview.data_quality || '?'}/10

✨ *${isFR ? 'Résumé Exécutif' : 'Executive Summary'}*
${r.executive_summary || ''}

🔑 *${isFR ? 'Points Clés' : 'Key Findings'}*
${findings}

💡 *${isFR ? 'Recommandations' : 'Recommendations'}*
${recos}

⏱ _${d.response_time_ms}ms · ${d.tokens_used} tokens_`;

} else {
  // Rapport document
  const header = isFR ? '📄 *ANALYSE DU DOCUMENT*' : '📄 *DOCUMENT ANALYSIS*';
  const points = (r.key_points || []).map((p, i) => `${i+1}. ${p}`).join('\n');
  const insights = (r.insights || []).map(i => `💡 ${i}`).join('\n');

  message = `${header}
📄 *${d.file_name}*

✨ *${isFR ? 'Résumé Exécutif' : 'Executive Summary'}*
${r.executive_summary || ''}

🔑 *${isFR ? 'Points Clés' : 'Key Points'}*
${points}

🔍 *${isFR ? 'Insights' : 'Insights'}*
${insights}

🎯 *${isFR ? 'Public Cible' : 'Target Audience'}*
${r.target_audience || 'Non déterminé'} · Qualité : ${r.quality_score || '?'}/10

⏱ _${d.response_time_ms}ms_`;
}

return [{
  json: {
    ...d,
    report_message: message,
    charts: d.grok_response.charts || d.grok_response.charts_recommended || []
  }
}];
```

#### Node 16 — Send Report Text
- Type : **Telegram** → Send Message
- Chat ID : `={{ $json.chat_id }}`
- Text : `={{ $json.report_message }}`
- Parse Mode : Markdown

#### Node 17 — Generate Charts (Code — pour données uniquement)
```javascript
const d = $input.first().json;
const charts = d.charts || [];
const extractedData = d.extracted_data;

if (d.content_type !== 'data' || !charts.length || !extractedData.data) {
  return [{ json: { ...d, chart_urls: [], charts_count: 0 } }];
}

const rows = extractedData.data || [];
const cols = extractedData.columns || [];

const chartUrls = [];

for (const chart of charts.slice(0, 3)) {
  const type = chart.type || 'bar';
  const xCol = chart.x || chart.x_axis || cols[0];
  const yCol = chart.y || chart.y_axis || cols[1];

  if (!xCol || !yCol) continue;

  const xValues = rows.map(r => r[xCol]).filter(v => v != null).slice(0, 20);
  const yValues = rows.map(r => parseFloat(r[yCol])).filter(v => !isNaN(v)).slice(0, 20);

  if (!xValues.length || !yValues.length) continue;

  const chartConfig = {
    type: type === 'scatter' ? 'scatter' : type,
    data: {
      labels: type !== 'scatter' ? xValues : undefined,
      datasets: [{
        label: yCol,
        data: type === 'scatter'
          ? xValues.map((x, i) => ({ x, y: yValues[i] }))
          : yValues,
        backgroundColor: 'rgba(99, 102, 241, 0.5)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 2,
        fill: false,
        tension: 0.3
      }]
    },
    options: {
      plugins: { title: { display: true, text: chart.title || `${yCol} par ${xCol}` } }
    }
  };

  const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
  chartUrls.push({
    url: `https://quickchart.io/chart?c=${encodedConfig}&w=700&h=400&bkg=white`,
    title: chart.title || '',
    insight: chart.insight || ''
  });
}

return [{ json: { ...d, chart_urls: chartUrls, charts_count: chartUrls.length } }];
```

#### Node 18 — Send Charts (Loop)
- Type : **Split In Batches** (pour chaque chart) OU utilise un node **Telegram** avec expression
- Pour chaque URL dans `chart_urls`, envoie une photo via Telegram

Code alternatif pour envoyer les charts (Code node) :
```javascript
const d = $input.first().json;
const chatId = d.chat_id;
const charts = d.chart_urls || [];

// Les charts sont envoyés via des HTTP requests séparées
// Retourner les URLs pour le node suivant
return charts.map(chart => ({
  json: { chat_id: chatId, photo_url: chart.url, caption: `📊 ${chart.title}\n_${chart.insight}_` }
}));
```

#### Node 19 — Send Each Chart Photo
- Type : **Telegram** → Send Photo
- Chat ID : `={{ $json.chat_id }}`
- Photo URL : `={{ $json.photo_url }}`
- Caption : `={{ $json.caption }}`
- Parse Mode : Markdown

#### Node 20 — Send Action Menu
- Type : **Telegram** → Send Message
- Chat ID : `={{ $('Format Report Message').item.json.chat_id }}`
- Text :
```
━━━━━━━━━━━━━━━━━━━━
_Que souhaitez-vous faire ?_
```
- Reply Markup : Inline Keyboard :
  - Bouton 1 : `🔍 Approfondir` / cb=`followup_{{ $('Extract Session ID').item.json.session_id }}`
  - Bouton 2 : `📎 Nouveau fichier` / cb=`new_file`
  - Bouton 3 : `✅ Terminer` / cb=`end_session`

#### Node 21 — Update Session in PostgreSQL
```sql
UPDATE sessions
SET status = 'completed',
    analysis_type = 'auto',
    llm_used = $1,
    llm_response = $2::jsonb,
    llm_tokens_used = $3,
    llm_response_time_ms = $4,
    charts_generated = $5,
    updated_at = NOW()
WHERE id = $6;

UPDATE users
SET credits_remaining = credits_remaining - 1,
    last_active_at = NOW()
WHERE telegram_id = $7;

INSERT INTO analytics (date, total_sessions, total_auto, grok_calls, ollama_calls, total_tokens)
VALUES (CURRENT_DATE, 1, 1,
  CASE WHEN $1 = 'grok' THEN 1 ELSE 0 END,
  CASE WHEN $1 = 'ollama' THEN 1 ELSE 0 END,
  $3)
ON CONFLICT (date) DO UPDATE
SET total_sessions = analytics.total_sessions + 1,
    total_auto = analytics.total_auto + 1,
    grok_calls = analytics.grok_calls + CASE WHEN $1 = 'grok' THEN 1 ELSE 0 END,
    ollama_calls = analytics.ollama_calls + CASE WHEN $1 = 'ollama' THEN 1 ELSE 0 END,
    total_tokens = analytics.total_tokens + $3;
```
- Params : `={{ $json.llm_used }}, {{ JSON.stringify($json.grok_response) }}, {{ $json.tokens_used || 0 }}, {{ $json.response_time_ms }}, {{ $json.charts_count || 0 }}, {{ $json.session_id }}, {{ $json.telegram_id }}`

**Save + Activate**

---

## JOUR 6 — Adapter WF-04 pour PostgreSQL

Dans le workflow WF-04 existant (`workflow-04-custom-analysis.json`) :

1. **Importe** le JSON dans n8n : Settings → Import Workflow
2. Remplace chaque node **Google Sheets** par un node **PostgreSQL** équivalent :

**Au début du workflow (après avoir reçu la réponse à la question 5) :**
```sql
SELECT s.extracted_data, s.file_name, s.file_type, u.language
FROM sessions s JOIN users u ON s.user_id = u.id
WHERE s.chat_id = $1 AND s.status = 'extracted'
ORDER BY s.created_at DESC LIMIT 1;
```

**À la fin, après avoir reçu la réponse Grok :**
```sql
UPDATE sessions
SET status = 'completed', analysis_type = 'custom',
    user_preferences = $1::jsonb, llm_used = 'grok',
    llm_response = $2::jsonb, llm_tokens_used = $3,
    updated_at = NOW()
WHERE chat_id = $4 AND status = 'extracted';

UPDATE users SET credits_remaining = credits_remaining - 1 WHERE telegram_id = $5;
```

**Ajoute le même mécanisme de fallback Ollama** (nodes 10-14 de WF-03) entre l'appel Grok et le formatage du rapport.

**Ajoute la validation JSON** identique au node 12 de WF-03.

---

## JOUR 7 — Tests d'intégration

### Variables d'environnement à vérifier dans n8n

Va dans n8n → **Settings** → **Variables** et ajoute :
- `GROK_API_KEY` : ta clé xAI
- `TELEGRAM_BOT_TOKEN` : le token BotFather

### Tests à effectuer

```
TEST 1 — Flux complet FR
1. /start → choisir FR
   → Vérifier INSERT dans users
2. Envoyer un CSV de test (ventes.csv, ~50 lignes)
   → Vérifier aperçu + menu
3. Cliquer Auto
   → Vérifier rapport + graphiques
   → Vérifier UPDATE sessions + décrémentation crédits

TEST 2 — Flux complet EN
   Même chose avec langue EN

TEST 3 — Erreurs
- Envoyer un PNG → "format non supporté"
- Envoyer un PDF de 20 MB → "trop volumineux"
- Utilisateur avec 0 crédits → "crédits épuisés"

TEST 4 — Vérification PostgreSQL
```
```bash
docker exec -it n8n-postgres psql -U n8n -d intelligence_bot

SELECT id, first_name, language, credits_remaining FROM users;
SELECT id, file_name, file_type, status, llm_used, response_time_ms FROM sessions;
SELECT * FROM analytics;
```

---

# PHASE 2 — V1.1 (Jours 8-14)

## JOUR 8 — Installer Ollama sur le VPS

### 8.1 Créer docker-compose pour Ollama

```bash
nano ~/intelligence-bot/docker-compose.ollama.yml
```

```yaml
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
          memory: 2500m
    networks:
      - n8n_n8n-network

volumes:
  ollama-data:

networks:
  n8n_n8n-network:
    external: true
```

```bash
# Démarrer Ollama
cd ~/intelligence-bot
docker compose -f docker-compose.ollama.yml up -d

# Télécharger phi3:mini (~2.3 GB, prend 5-10 min)
docker exec ollama ollama pull phi3:mini

# Tester
docker exec ollama ollama run phi3:mini "Réponds en JSON: {\"test\": true}"
```

### 8.2 Tester le fallback depuis n8n

Dans WF-03, ajoute un test manuel en déconnectant temporairement le node Grok et en activant le branch false vers Ollama. Vérifie que le bot répond avec "Mode fallback" dans le rapport.

---

## JOURS 9-10 — WF-06 : Admin Commands

Crée : `WF-06 - Admin Commands`

#### Node 1 — Telegram Trigger
- Updates : message

#### Node 2 — Filter /admin
- IF : `{{ $json.message.text }}` **starts with** `/admin`

#### Node 3 — Check Admin Status
```sql
SELECT is_admin FROM users WHERE telegram_id = $1;
```
- Params : `={{ $json.message.from.id }}`

#### Node 4 — Is Admin? (IF)
- Condition : `{{ $json[0].is_admin }}` **equals** `true`

#### Node 5 — Parse Command (Code)
```javascript
const text = $('Telegram Trigger').item.json.message.text;
const parts = text.split(' ');
const command = parts[1] || 'help';
const arg1 = parts[2] || '';
const arg2 = parts[3] || '';

return [{
  json: {
    command,
    arg1,
    arg2,
    chat_id: $('Telegram Trigger').item.json.message.chat.id,
    admin_id: $('Telegram Trigger').item.json.message.from.id
  }
}];
```

#### Node 6 — Route Command (Switch)
Routes : `stats`, `credits`, `ban`, `unban`, `users`, `help`

**stats** → Query :
```sql
SELECT
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM sessions) as total_sessions,
  (SELECT COUNT(*) FROM sessions WHERE status='completed') as completed,
  (SELECT COUNT(*) FROM sessions WHERE created_at > NOW() - INTERVAL '24h') as last_24h,
  (SELECT COALESCE(SUM(total_tokens),0) FROM analytics) as total_tokens;
```

**credits** → Query :
```sql
UPDATE users SET credits_remaining = credits_remaining + $1
WHERE telegram_username = $2 OR telegram_id::text = $2
RETURNING telegram_username, credits_remaining;
```
- Params : `={{ parseInt($json.arg2) }}, {{ $json.arg1 }}`

**ban** → Query :
```sql
UPDATE users SET is_active = FALSE WHERE telegram_username = $1 OR telegram_id::text = $1
RETURNING telegram_username;
```

**users** → Query :
```sql
SELECT telegram_username, credits_remaining, is_active, last_active_at
FROM users ORDER BY last_active_at DESC LIMIT 10;
```

**help** → Message :
```
🔧 *Commandes Admin*

/admin stats — Statistiques globales
/admin credits @user N — Ajouter N crédits
/admin ban @user — Bannir un utilisateur
/admin unban @user — Débannir
/admin users — Liste des 10 derniers users
```

---

## JOURS 11-12 — WF-05 : Follow-up (Mémoire conversationnelle)

Crée : `WF-05 - Follow-up Questions`

#### Node 1 — Telegram Trigger (text messages)
- Updates : message

#### Node 2 — Is Text Message (not command, not file)?
```javascript
// IF
const msg = $json.message;
const isText = msg.text && !msg.text.startsWith('/') && !msg.document;
return isText;
```

#### Node 3 — Load Active Session
```sql
SELECT s.id, s.extracted_data, s.llm_response, s.follow_up_count,
       u.language, u.credits_remaining
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.chat_id = $1
  AND s.status = 'completed'
  AND s.updated_at > NOW() - INTERVAL '30 minutes'
ORDER BY s.updated_at DESC
LIMIT 1;
```
- Params : `={{ $json.message.chat.id }}`

#### Node 4 — Has Active Session? (IF)
- Condition : `{{ $json[0] }}` **exists**

#### Node 5 — No Session Message (false)
```
💬 Envoyez un fichier pour démarrer une nouvelle analyse.
```

#### Node 6 — Check Follow-up Limit (IF)
- Condition : `{{ $json[0].follow_up_count }}` **less than** `3`

#### Node 7 — Limit Reached (false)
```
⚠️ Limite de 3 questions de suivi atteinte.

Envoyez un nouveau fichier pour démarrer une nouvelle analyse.
```

#### Node 8 — Build Follow-up Prompt (Code)
```javascript
const session = $input.first().json[0];
const userQuestion = $('Telegram Trigger').item.json.message.text;
const prevAnalysis = JSON.stringify(session.llm_response).substring(0, 3000);
const lang = session.language;

const prompt = `Contexte : Analyse précédente du fichier :
${prevAnalysis}

Question de l'utilisateur : "${userQuestion}"

Réponds à cette question de suivi en te basant UNIQUEMENT sur les données de l'analyse précédente.
Sois précis et concis. Réponds en ${lang === 'FR' ? 'français' : 'English'}.
Format : texte simple (pas de JSON cette fois).`;

return [{
  json: {
    prompt,
    session_id: session.id,
    follow_up_count: session.follow_up_count,
    language: session.language,
    chat_id: $('Telegram Trigger').item.json.message.chat.id,
    telegram_id: $('Telegram Trigger').item.json.message.from.id
  }
}];
```

#### Node 9 — Call Grok for Follow-up
(Même configuration HTTP que dans WF-03)

#### Node 10 — Send Follow-up Response
- Format le texte et envoie via Telegram

#### Node 11 — Update Follow-up Count
```sql
UPDATE sessions
SET follow_up_count = follow_up_count + 1, updated_at = NOW()
WHERE id = $1;
```

---

# PHASE 3 — V1.5 (Jours 15-21)

## JOURS 15-17 — Dashboard Monitoring HTML

Crée le fichier HTML statique qui sera servi par Nginx :

```bash
mkdir -p ~/intelligence-bot/dashboard
nano ~/intelligence-bot/dashboard/index.html
```

Le dashboard interroge l'API PostgreSQL via un endpoint n8n (webhook) toutes les 30 secondes. Crée d'abord le webhook dans n8n :

### Webhook n8n pour les stats

Crée un workflow `WF-STATS - Dashboard API` :

#### Node 1 — Webhook
- Method : GET
- Path : `bot-stats`
- Authentication : Header (ajoute un token secret)

#### Node 2 — Query Stats
```sql
SELECT
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
  (SELECT COUNT(*) FROM sessions) as total_sessions,
  (SELECT COUNT(*) FROM sessions WHERE status = 'completed') as completed_sessions,
  (SELECT COUNT(*) FROM sessions WHERE status = 'error') as error_sessions,
  (SELECT COALESCE(AVG(llm_response_time_ms), 0)::int FROM sessions WHERE status='completed') as avg_response_ms,
  (SELECT COUNT(*) FROM sessions WHERE created_at > NOW() - INTERVAL '24h') as sessions_24h,
  (SELECT COUNT(*) FROM sessions WHERE file_type = 'csv') as csv_count,
  (SELECT COUNT(*) FROM sessions WHERE file_type = 'pdf') as pdf_count,
  (SELECT COUNT(*) FROM sessions WHERE file_type = 'excel') as excel_count,
  (SELECT COUNT(*) FROM sessions WHERE file_type = 'word') as word_count,
  (SELECT COUNT(*) FROM sessions WHERE llm_used = 'ollama') as ollama_fallbacks;
```

#### Node 3 — Respond to Webhook
- Response Code : 200
- Data : `={{ $json[0] }}`

Puis configure Nginx pour servir le dashboard HTML :

```bash
sudo nano /etc/nginx/sites-available/n8n
```

Ajoute dans le bloc server HTTPS :
```nginx
location /dashboard/ {
    alias /home/bran9910/intelligence-bot/dashboard/;
    index index.html;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Le dashboard HTML complet est un fichier single-file (DataLens-style) qui affiche :
- Sessions aujourd'hui / total
- Taux de succès (completed/total)
- Temps de réponse moyen Grok
- Répartition par type de fichier (bar chart)
- Fallbacks Ollama

---

## JOURS 18-21 — Export PDF des rapports

Installe wkhtmltopdf dans le container n8n :

```bash
# Ajoute dans le Dockerfile
nano ~/n8n/Dockerfile
```

```dockerfile
FROM n8nio/n8n:latest
USER root

# Packages npm
RUN npm install -g pdf-parse xlsx mammoth

# wkhtmltopdf pour génération PDF (ARM compatible)
RUN apt-get update && apt-get install -y wkhtmltopdf && rm -rf /var/lib/apt/lists/*

USER node
```

```bash
cd ~/n8n
docker compose down
docker compose build --no-cache
docker compose up -d
```

Dans WF-03, après le node "Send Action Menu", ajoute un bouton `📄 Exporter en PDF` / cb=`export_pdf_{{ session_id }}`.

Crée `WF-PDF - Export Report` qui :
1. Reçoit le callback `export_pdf_*`
2. Charge le rapport depuis PostgreSQL
3. Génère un HTML structuré du rapport
4. Appelle wkhtmltopdf via un Code node (`require('child_process').execSync(...)`)
5. Envoie le PDF via Telegram (Send Document)

---

# PHASE 4 — V2.0 (Jours 22-35)

## Support Whisper (Messages vocaux)

### Ajouter au WF-02

Dans le node de détection du type de message, ajoute une branche pour les **voice messages** :

```javascript
// Détecter les messages vocaux
const msg = $input.first().json.message;
if (msg.voice) {
  return [{ json: { is_voice: true, file_id: msg.voice.file_id, duration: msg.voice.duration, chat_id: msg.chat.id } }];
}
```

### Workflow WF-07 : Voice Handler

1. Télécharge le fichier .oga depuis Telegram
2. Envoie à Whisper API :
```json
POST https://api.openai.com/v1/audio/transcriptions
{
  "model": "whisper-1",
  "file": [fichier audio],
  "language": "fr"
}
```
3. Récupère le texte transcrit
4. Traite comme une question de follow-up (passe à WF-05)

---

## Scheduled Reports (WF-08)

Crée `WF-08 - Scheduled Reports` :

1. **Cron Trigger** : `0 8 * * *` (8h du matin)
2. **Query** : `SELECT * FROM scheduled_reports WHERE is_active = true AND next_run_at <= NOW()`
3. **Pour chaque rapport** : download du fichier source → analyse auto → envoi Telegram
4. **Update** : `UPDATE scheduled_reports SET last_run_at = NOW(), next_run_at = [prochaine occurrence]`

---

# RÉSUMÉ DES COMMANDES CLÉS

```bash
# === SETUP INITIAL ===
# Base de données
docker exec -i n8n-postgres psql -U n8n -d postgres -c "CREATE DATABASE intelligence_bot;"
docker exec -i n8n-postgres psql -U n8n -d intelligence_bot < ~/intelligence-bot/sql/001-create-tables.sql
docker exec -i n8n-postgres psql -U n8n -d intelligence_bot < ~/intelligence-bot/sql/002-seed-admin.sql

# Ollama
cd ~/intelligence-bot && docker compose -f docker-compose.ollama.yml up -d
docker exec ollama ollama pull phi3:mini

# Vérifications
docker exec -it n8n-postgres psql -U n8n -d intelligence_bot -c "\dt"
curl http://localhost:11434/api/tags

# === MONITORING ===
# Logs n8n
docker logs n8n --tail 50 -f

# Stats sessions
docker exec -it n8n-postgres psql -U n8n -d intelligence_bot \
  -c "SELECT status, COUNT(*) FROM sessions GROUP BY status;"

# Temps de réponse moyen
docker exec -it n8n-postgres psql -U n8n -d intelligence_bot \
  -c "SELECT AVG(llm_response_time_ms) as avg_ms FROM sessions WHERE status='completed';"

# Users actifs
docker exec -it n8n-postgres psql -U n8n -d intelligence_bot \
  -c "SELECT telegram_username, credits_remaining, last_active_at FROM users ORDER BY last_active_at DESC;"

# === MAINTENANCE ===
# Nettoyage sessions anciennes (>30 jours)
docker exec -it n8n-postgres psql -U n8n -d intelligence_bot \
  -c "DELETE FROM sessions WHERE updated_at < NOW() - INTERVAL '30 days';"

# Backup incluant intelligence_bot
docker exec n8n-postgres pg_dumpall -U n8n > ~/n8n/backups/full_backup_$(date +%Y%m%d).sql
```

---

# CHECKLIST FINALE

```
PHASE 1 — MVP
  ☑ Base intelligence_bot créée dans PostgreSQL
  ☑ Tables users, sessions, analytics, scheduled_reports
  ☑ Bot Telegram créé (@BotFather)
  ☑ WF-01 : /start + langue + upsert user
  ☑ WF-02 : réception fichier + extraction + preview
  ☑ WF-03 : analyse automatique (LE WORKFLOW CLÉ)
  ☑ WF-04 : analyse personnalisée (adapté PostgreSQL)
  ☑ Gestion erreurs : taille fichier, format, crédits
  ☑ Message "Analyse en cours..." pendant traitement
  ☑ Tests : 4 types de fichiers × 2 langues

PHASE 2 — V1.1
  ☐ Ollama installé (phi3:mini) + fallback LLM actif
  ☐ WF-06 : admin commands + crédits
  ☐ WF-05 : follow-up / mémoire (3 questions)
  ☐ Analytics mise à jour en temps réel

PHASE 3 — V1.5
  ☐ Dashboard monitoring HTML (/dashboard/)
  ☐ Export PDF des rapports (wkhtmltopdf)
  ☐ Tests de charge (10 sessions simultanées)

PHASE 4 — V2.0
  ☐ WF-07 : messages vocaux (Whisper)
  ☐ Analyse comparative (2 fichiers)
  ☐ WF-08 : scheduled reports
  ☐ Vidéo démo 60s pour Fiverr
  ☐ Case study Notion bilingue
```

---

*Guide d'implémentation A-Z — Intelligence Bot v2.0*
*Sidney RABEHAMINA · Avril 2026 · Infrastructure : VPS Hetzner CAX11*
