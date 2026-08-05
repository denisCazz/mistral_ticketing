# Mistral Impianti

Gestionale unificato per **Mistral Impianti**: preventivi con generazione AI, archivio documenti con scadenze, dipendenti/presenze/costi, magazzino con barcode, rapportini di intervento sul campo.

## Funzionalità

| Area | Descrizione |
|------|-------------|
| Preventivi | Bozze generate via AI da documenti aziendali, versione/export PDF e DOCX, stati e storico |
| Documenti | Archivio su R2, estrazione testo, indicizzazione vettoriale (OpenAI embeddings), chat RAG |
| Scadenze | Parsing date da filename/cartelle, alert email via cron (`/api/cron/scadenze`) |
| Dipendenti | Anagrafica, categorie, costi standard e override, presenze, costi accessori |
| Magazzino | Articoli con codice interno/EAN, scanner barcode (ZXing), movimenti entrata/uscita/rettifica |
| Rapportini | Schede intervento antincendio/elettrico, firme, export PDF (modulo opzionale via `RAPPORTINI_ENABLED`) |
| Clienti | Anagrafica condivisa, import XLSX con gestione duplicati |
| Utenti | Ruoli `ADMIN` / `OPERATORE`, login con rate-limiting |

## Stack

- Next.js 16 (App Router) + React 19
- PostgreSQL + Prisma 7 (driver adapter `pg`)
- NextAuth (credentials, sessioni JWT)
- Tailwind 4 + shadcn
- Cloudflare R2 (S3-compatible), OpenAI, Resend
- jsPDF / docx (export)

## Setup

```bash
cp .env.example .env
# modifica DATABASE_URL e NEXTAUTH_SECRET

npm install
npm run db:push
npm run db:seed
npm run dev
```

App: http://localhost:3000

**Login seed:** `admin@mistralimpianti.it` / `admin123` — cambiarla subito dopo il primo accesso.

### Docker

```bash
export NEXTAUTH_SECRET="$(openssl rand -base64 32)"
docker compose up --build
```

Il container esegue `prisma/sync-schema.mjs` all'avvio (DDL idempotente) e poi il server. Le variabili per R2/OpenAI/Resend/cron si passano via ambiente (`docker compose` le propaga da `.env`).

### Test e qualità

```bash
npm test          # vitest (calcoli, parser scadenze, whitelist, tariffe, fonti RAG)
npm run lint      # eslint
```

## Ruoli

- **ADMIN** — tutto: utenti, import, dipendenti, costi, documenti (incl. HR), configurazione
- **OPERATORE** — preventivi propri, rapportini, clienti, statistiche, scadenze assegnate

## Struttura

```
src/app/(app)/...      # pagine (documenti, preventivi, scadenze, magazzino, ...)
src/app/api/...        # API routes
src/lib/               # logica (auth, access control, R2, OpenAI, parser, export)
src/proxy.ts           # guardia rotte: auth, ruoli, moduli opzionali
prisma/schema.prisma   # schema unificato
prisma/migrations/     # migrazioni incrementali (baseline via db:push)
scripts/               # import documenti, backfill scadenze, seed
```
