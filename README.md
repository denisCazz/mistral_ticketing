# Mistral Impianti

Gestionale unificato per **Mistral Impianti**: pratiche di assistenza (ticketing) + rapportini di intervento sul campo.

Nato dall’unione di:
- **ticketing_Eva** — workflow pratiche / CAT / clienti / import XLSX
- **rapportini** (Bitora) — schede intervento, firme, PDF, catalogo marche

## Funzionalità

| Area | Descrizione |
|------|-------------|
| Pratiche | Ciclo di vita assistenza (`MIS-YYYY-####`), stati, CAT, storico |
| Rapportini | Creazione schede intervento, firme, export PDF |
| Clienti | Anagrafica condivisa tra pratiche e rapportini |
| CAT / Utenti | Reti assistenza e ruoli `ADMIN` / `OPERATORE` / `MANUTENTORE` |
| Import | Import clienti/CAT da XLSX |

## Stack

- Next.js 16 (App Router) + React 19
- PostgreSQL + Prisma 7
- NextAuth (credentials)
- Tailwind 4 + shadcn
- jsPDF (export rapportini)

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

**Login seed:** `admin@mistralimpianti.it` / `admin123`

### Docker

```bash
export NEXTAUTH_SECRET="$(openssl rand -base64 32)"
docker compose up --build
```

## Ruoli

- **ADMIN** — tutto (pratiche, rapportini, CAT, utenti, import)
- **OPERATORE** — pratiche, rapportini, clienti, statistiche
- **MANUTENTORE** — pratiche assegnate + rapportini propri

## Struttura

```
src/app/(app)/pratiche     # ticketing
src/app/(app)/rapportini   # rapportini intervento
src/app/api/...
prisma/schema.prisma       # schema unificato
```
