# API contract

Implementato in `src/server/server.mjs` (zero dipendenze). Avvio: `npm run serve` (env `PORT`, `CONTENT_ROOT`).

## Autenticazione (stato: interfaccia, NON implementata — nessun fake)

- Sviluppo locale: piano da `?plan=` o header `x-plan` (default free).
- Produzione: sostituire `planOf()` con JWT di sessione verificato emesso dal futuro auth provider; mai fidarsi del client. Nessun endpoint di login simulato esiste di proposito.

## Endpoints

- `GET /api/subjects` → `{subjects, plan}`.
- `GET /api/subjects/:s` → `{subject, tree, total, visible, plan}`. Tree: nodi entitled con metadati; nodi premium come `{locked:true, required}` SENZA testi.
- `GET /api/nodes/:id` → `{node, plan}` o 403 `{error:forbidden, required, plan}`.
- `GET /api/children?parent=` → figli entitled (403 se parent non entitled).
- `GET /api/search?q=&subject=` → hit `{id,title,subject,type,score,snippet≤200}` solo da corpus entitled.
- `POST /api/ai/ask` `{question, nodeIds?, llm?}` → `{answer, citations, provenance, refusal?, note?}`; `llm:true` richiede ULTRA + `OPENAI_API_KEY`, altrimenti 403/estrattivo.
- `POST /api/print` `{nodeId, scope}` → `{job, node}` con watermark; richiede ≥PRO; audit in `data/print-audit.log`.

## Pagamenti (pianificati)

`User → Subscription → Entitlement → Feature access` via provider reale (es. Stripe): webhook → entitlements persistiti → `requireAccess()` li consuma. Il frontend non decide mai l'accesso.
