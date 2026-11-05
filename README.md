# Mappe Didattiche — knowledge graph didattico

Base definitiva (v0.1.0), non demo: ogni funzione presente è reale, ogni funzione
assente è dichiarata come pianificata (vedi `docs/`). Zero dipendenze di produzione, Node ≥20.

## Avvio

```powershell
npm test            # test reali (content, entitlements, graph, AI, learning, coverage)
npm run validate    # audit strutturale/contenuto/fonti/sicurezza/performance
npm run coverage    # report coverage+readiness per materia (QUALITY≠COVERAGE≠READINESS)
npm run build:index # indice free + manifest premium (self-check anti-leakage)
npm run serve       # http://localhost:3000  (PORT/CONTENT_ROOT da .env)
```

Copia `.env.example` in `.env` per configurazione locale (mai segreti nel codice).

## Contenuti (stato 2026-09-24, quinto ciclo: 59 nodi published, 23/23 test, validate OK)

- **filosofia** (29): + Agostino (SEP content_reviewed) e Tommaso (SEP content_reviewed: 5 vie, legge naturale). Medievale ora con 2 pilastri.
- **storia** (3): + guerra del Peloponneso 431–404 con chrono e metodo fatto/interpretazione.
- **greco** (3): + declinazioni del nome (paradigmi standard; revisione su grammatica a stampa pianificata, nessun URL citato alla cieca).
- **latino** (3): + II declinazione. **matematica** (3): + Pitagora con dimostrazione (catena verso √2). **fisica** (3): + cinematica (catena verso F=ma).
- Fonti content_reviewed: 20 voci (Treccani Platone/Aristotele, SEP Plato/Aristotle/Augustine/Aquinas). Voci Treccani scartate dopo verifica: agostino/, sant-agostino/, agostino-d-ippona/, tommaso-d-aquino/ (omonimi/soft-404) — documentate nei nodi.
- **Readiness onesta (da `npm run coverage`)**: nessuna materia oltre DEVELOPING/FOUNDATION; COVERAGE FAIL ovunque finché restano critical gap CORE. Dettagli in `docs/COVERAGE.md`.
- Media: zero voci inventate. Auth/pagamenti: nessun fake login.

Dettagli: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/CONTENT_MODEL.md`, `docs/API_CONTRACT.md`, `docs/PLATFORM.md`.
