# Entitlements, security, print, AI, nuova materia

## Entitlements (implementato)

Unico punto decisionale: `src/engine/entitlements.mjs` (`canAccess`, `requireAccess`, `filterVisible`, `canUseAdvancedAI`, `canPrint`). Piani free<pro<ultra. `draft/planned/archived` mai serviti a nessun piano.

## Protezione premium (implementata, realistica)

- Client free non riceve testi premium: tree con soli titoli locked, `/api/nodes` 403, ricerca su corpus entitled, `build-index` emette solo bundle free + manifest conteggi con self-check anti-leakage (fallisce se un frammento premium >60 char compare nel bundle).
- Limite onesto: nessun DRM assoluto contro utenti entitled che copiano; watermark + audit + payload minimizzati (documentati, non promesse assolute).

## Stampa/export (implementato)

`buildPrintJob()` server-side: jobId, docCode, watermark{userId, printedAt, notice}, audit log. Client mostra watermark e usa `window.print()`; non solo `@media print`. Export integrale vietato ai free; stampa ≥PRO.

## AI grounding (implementato)

`src/ai/grounding.mjs`: retrieval lessicale su corpus entitled, risposta estrattiva con `citations` e `provenance` (kb|external|inference|unverified), rifiuto esplicito se evidenza insufficiente. `answerWithLLM`: solo ULTRA + chiave reale, contesto solo KB, system prompt anti-allucinazione, output marcato `inference`. UI (`public/app.js`) mostra sempre provenienza e nodi.

## Ricerca

Lessicale pesata (titolo×5, keywords×3) su titolo/testi/definizioni/fonti/quiz. Semantica: interfaccia `semanticSearch()` che rifiuta finché l'indice vettoriale non esiste.

## Nuova materia

`node scripts/new-subject.mjs <slug> "Titolo"` → `subject.json` + stub planned. Poi: aree → nodi draft via `import-markdown` → revisione → publish. Nessuna modifica al motore richiesta (verificato: 6 materie condividono lo stesso codice).

## Study mode / Learning

Pomodoro + timer, flashcard con toggle, quiz con correzione e salvataggio locale del punteggio, domande aperte, prerequisiti navigabili, audio ambientale SINTETIZZATO WebAudio (brown/pink noise, nessun brano protetto).

## Test e validazione

`npm test` (node:test): content, entitlements+leakage, graph/search/AI/learning. `npm run validate [--strict] [--check-urls]`: struttura, riferimenti, cicli, orfani, fonti, anti-placeholder, payload.
