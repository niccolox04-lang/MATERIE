# Architettura

Stato: implementata (v0.1.0). Questo documento descrive il codice reale, non intenzioni.

## Principio

File-based, zero dipendenze di produzione, framework-agnostic. Il knowledge graph
vive in `materie/<materia>/nodes/*.json` (un file per nodo) + `subject.json`.
Il motore (`src/`) è puro ESM senza framework: potrà essere riusato da qualsiasi
backend/frontend futuri senza rewrite.

## Componenti reali

| Componente | Percorso | Stato |
|---|---|---|
| Modello (costanti, typedef) | `src/model/types.mjs`, `src/model/ids.mjs` | implementato |
| Grafo (load, adiacenze, breadcrumb, path) | `src/engine/graph.mjs` | implementato |
| Entitlements centralizzati | `src/engine/entitlements.mjs` | implementato |
| Ricerca lessicale | `src/engine/search.mjs` | implementata; semantica pianificata (`semanticSearch` lancia errore esplicito) |
| Learning (progress, mastery, spaced repetition, quiz) | `src/engine/learning.mjs` | implementato (funzioni pure) |
| Print/watermark | `src/engine/print.mjs` | implementato |
| AI grounded estrattiva + adapter LLM | `src/ai/grounding.mjs` | implementata; LLM solo con `OPENAI_API_KEY` + piano ULTRA |
| Server zero-dep con gate server-side | `src/server/server.mjs` | implementato |
| Frontend vanilla lazy-loading | `public/` | implementato |
| Validazione (7 audit) | `scripts/validate.mjs` | implementata |
| Coverage e readiness | `src/engine/coverage.mjs` + `<materia>/coverage.json` + `scripts/coverage.mjs` | implementati (QUALITY≠COVERAGE≠READINESS) |
| Build indice free + anti-leakage | `scripts/build-index.mjs` | implementata |
| Import Markdown (dry-run, mai auto-publish) | `scripts/import-markdown.mjs` | implementato |
| Scaffold nuova materia | `scripts/new-subject.mjs` | implementato |

## Non implementato (dichiarato, non simulato)

- Autenticazione reale / JWT / pagamenti (Stripe): interfacce documentate in `API_CONTRACT.md`; nessun fake login presente.
- Database: i file JSON sono il corpus; `CONTENT_ROOT` astrae la sorgente per futura migrazione.
- Indice vettoriale / embeddings: `semanticSearch` rifiuta esplicitamente.
- Media verificati (video/podcast): modello pronto, zero voci inventate.

## Flussi

- Lettura: `GET /api/subjects/:s` → tree (premium solo titoli locked) → `GET /api/nodes/:id` (gate) → `GET /api/children`.
- Ricerca: solo corpus entitled al piano; snippet solo da nodi entitled.
- AI: retrieval su corpus entitled → risposta estrattiva citata o rifiuto onesto.
- Stampa: `POST /api/print` (≥PRO) → job con watermark + audit log.
