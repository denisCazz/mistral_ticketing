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

**Login seed:** imposta `SEED_ADMIN_PASSWORD` (min. 12 caratteri), poi `npm run db:seed`.
Accesso: `admin@mistralimpianti.it` — al primo login è obbligatorio il cambio password.

Per abilitare i rapportini: `RAPPORTINI_ENABLED=true` **e** `NEXT_PUBLIC_RAPPORTINI_ENABLED=true` (default fail-closed).

### Docker

```bash
export NEXTAUTH_SECRET="$(openssl rand -base64 32)"
docker compose up --build
```

All'avvio i container `app` e `worker` eseguono automaticamente
`prisma/sync-schema.mjs` (DDL + pgvector + embedding v2) e poi partono.
Se lo sync fallisce viene loggato un warning ma il server resta su
(evita Bad Gateway). Non serve `npm run db:sync` a mano in Docker.
Le variabili per R2/OpenAI/Resend/cron si passano via ambiente
(`docker compose` le propaga da `.env`).

### Test e qualità

```bash
npm test          # vitest (calcoli, parser scadenze, whitelist, tariffe, fonti RAG)
npm run lint      # eslint
```

### Embedding documenti v2

La pipeline documentale usa chunk contestuali per pagina/sezione, embedding
versionati e attivazione atomica. PostgreSQL `pgvector` + HNSW viene usato
quando disponibile; in caso contrario la ricerca continua in modalità JSON
degradata, visibile nella pagina `/admin/documenti-ai`.

```bash
# solo locale (senza Docker): sync manuale + worker
npm run db:sync
npm run documenti:worker
```

Con Docker lo sync parte da solo all'avvio di `app`/`worker`.
In locale senza Compose il secondo comando deve restare attivo in un
terminale separato. I nuovi documenti creano
un job `FULL_PIPELINE`; l'azione admin **Reindicizza tutti in v2** crea job
`EMBEDDING_ONLY` e non ripete OCR/estrazione strutturata. La rielaborazione
completa richiede conferma esplicita.

Benchmark prima/dopo:

```bash
npm run documenti:eval:gold
npm run documenti:eval -- --gold=logs/retrieval-gold.json --label=baseline
npm run documenti:eval -- --gold=logs/retrieval-gold.json --label=v2 --compare=logs/retrieval-baseline.json
```

Il gold set richiede almeno 20 query. V2 non deve peggiorare Recall@5 o MRR;
l'obiettivo è almeno +10% relativo su Recall@5. Lasciare
`DOCUMENT_EMBEDDING_CLEANUP_ENABLED=false` durante benchmark e osservazione;
abilitarlo solo dopo il superamento del quality gate. Le generazioni inattive
vengono allora eliminate dopo `DOCUMENT_EMBEDDING_RETENTION_DAYS` (default 14).

La tab **Mappa 3D** mostra fino a 1.000 documenti: colore per categoria,
dimensione per numero di chunk e collegamenti per similarità semantica.

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
