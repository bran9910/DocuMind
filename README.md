# DocuMind — AI Document Analysis Bot

[![n8n](https://img.shields.io/badge/n8n-self--hosted-orange?logo=n8n)](https://diney-n8n.duckdns.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-ARM64-blue?logo=docker)](https://docker.com)
[![Ollama](https://img.shields.io/badge/LLM-Ollama%20kimi--k2.5-purple)](https://ollama.com)

> A Telegram bot that automatically analyses documents (PDF, DOCX) and datasets (XLSX, CSV) using local AI — fully self-hosted, no data leaves your infrastructure.

---

## What it does

Send any document to the bot via Telegram and get back a complete structured report with:
- Executive summary
- Key insights and detected anomalies
- Statistical analysis (for datasets)
- Data quality assessment

Everything runs on a private VPS — no cloud LLM required.

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Telegram  │────▶│     n8n     │────▶│  Agent IA   │
│    User     │◀────│  Workflows  │◀────│   Ollama    │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌──────────┐
        │PostgreSQL│  │QuickChart│  │File Parse│
        │Sessions │  │(Graphs) │  │PDF/DOCX  │
        └─────────┘  └─────────┘  │XLSX / CSV│
                                   └──────────┘
```

**Infrastructure :**
- VPS Hetzner CAX11 ARM (4 GB RAM, Ubuntu 24.04)
- n8n self-hosted — `https://diney-n8n.duckdns.org`
- Docker Compose : n8n + PostgreSQL 16 + Ollama + Nginx
- SSL via Let's Encrypt, reverse proxy Nginx

---

## Features — Phase 1 (complete)

- Bilingual FR / EN via Telegram inline buttons
- Supported formats : PDF, DOCX, XLSX, CSV
- File extraction with session preview
- Auto analysis : ollama models → structured JSON report
- Session persistence : PostgreSQL (users + sessions + analytics tables)
- Per-user credit system
- Final action menu after each analysis

## In Progress — Phase 2

- [x] Custom analysis : 5 interactive questions to refine the report (Sprint 2 complete)
- [ ] Admin commands (`/admin stats`, `/admin credits`)
- [ ] Daily analytics aggregation (automated Telegram report to admin)
- [ ] Error monitoring workflow

---

## Project Structure

```
DocuMind/
├── workflows/
│   ├── phase-1-WF-Completed/     # Deployed Phase 1 workflows (JSON)
│   └── phase-2/                  # Phase 2 work in progress
├── migrations/                   # PostgreSQL schema migrations
├── prompts/                      # LLM prompt templates
├── code/
│   ├── file-extractors.js        # PDF / Excel / Word / CSV parsers
│   └── validate-language.js      # FR/EN input normalizer
├── ANALYSE_PLAN_V2_INTELLIGENCE_BOT.md
├── PHASE_2_MAP.md
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Orchestration | n8n self-hosted (Docker) |
| LLM | Ollama — ollama models |
| Database | PostgreSQL 16 |
| File parsing | pdf-parse, xlsx, mammoth (Node.js) |
| Charts | QuickChart (no API key needed) |
| Infra | Docker Compose, Nginx, Let's Encrypt |
| Platform | Hetzner CAX11 ARM64, Ubuntu 24.04 |

---

## Database Schema

**`users`** — telegram_id, language, credits_remaining, created_at  
**`sessions`** — session_uuid, user_id, file_name, file_type, extracted_data (JSONB), llm_response (JSONB), status  
**`analytics`** — daily aggregations: sessions, tokens, LLM calls, error rates

---

## Key Engineering Notes

These patterns emerged during development and apply to all n8n workflows on this stack:

- **PostgreSQL RETURNING** → access via `$input.first().json` (no `[0]` index)
- **Binary data** → always use `getBinaryDataBuffer()`, never raw base64 decode
- **`$env` variables** → work only in Code nodes (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`); use n8n credentials for HTTP Request headers
- **Ollama via Docker** → credential type "Ollama", base URL `http://ollama:11434`
- **Basic LLM Chain output** → handle both `{ text }` and `{ response: { text } }` formats
- **Inline keyboards** → must be configured manually after JSON import (not imported automatically)

---

## Setup (self-host)

> Requires: Docker, a domain name with DuckDNS or similar, a Telegram bot token.

1. Clone this repo
2. Copy `docker-compose.example.yml` → `docker-compose.yml` and fill in your values
3. Import the workflow JSONs from `workflows/phase-1-WF-Completed/` into n8n
4. Set up Ollama credentials in n8n (type: Ollama, URL: `http://ollama:11434`)
5. Pull the model: `docker exec ollama ollama pull kimi-k2.5:cloud`
6. Activate workflows one at a time (wait 30s between each to avoid Telegram webhook rate limits)

---

## Status

| Phase | Status | Date |
|---|---|---|
| Phase 1 MVP | Complete | 7 April 2026 |
| Phase 2 Sprint 1 (bug fixes) | Complete | 8 April 2026 |
| Phase 2 Sprint 2 (custom analysis) | Complete | 9 April 2026 |
| Phase 2 Sprint 3 (admin & credits) | In progress | |

---

*Built by [Sidney Rabehamina](https://github.com/bran9910) · Madagascar*
