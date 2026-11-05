# Coverage disciplinare (NODE QUALITY ≠ COVERAGE ≠ READINESS)

Questo documento descrive il sistema reale in `src/engine/coverage.mjs`,
`<materia>/coverage.json`, `scripts/coverage.mjs` (`npm run coverage`).

## Principio

`scripts/validate.mjs` certifica i nodi esistenti (NODE QUALITY).
Non può dire se una materia è completa. La completezza si misura sulle
**unità disciplinari** della Coverage Matrix, mai sul conteggio nodi.

## Coverage Matrix (`coverage.json`)

Per materia: `curriculumScope` (perimetro esplicito), `macroAreas[]` con
`importance` (core|important|secondary|optional) e `units[]`
(id, title, tier foundational|intermediate|advanced, weight, nodeId→nodo o null),
`foundationalTopics`, `advancedTopics`, `requiredPrerequisites`, `roadmap`.

## Calcolo

- Unità: 1 se nodeId→published, 0.4 se reviewed/draft, 0 se null/assente.
- Area: media pesata → not_started (0) | outlined (<25) | partially_covered (<60) |
  substantially_covered (<100) | fully_covered (100) | verified (100 + ogni nodo
  con backing: fonte content_reviewed o proof autocontenuta).
- Overall: media aree pesata per importanza (core 4, important 2, secondary 1, optional 0.5).
- Critical gap: unità scoperta con peso ≥2 in area CORE.
- Foundational/advanced: coverage separata per tier.

## Readiness (derivata, mai dichiarata)

- **foundation**: struttura iniziale.
- **developing**: copertura oltre il 10% ma CORE incomplete.
- **substantial**: overall ≥50 e ogni CORE ≥outlined (25).
- **near_complete**: ogni CORE ≥75 e zero critical gap.
- **complete**: TUTTE le CORE fully_covered+, zero critical gap, qualityGate (validate
  reale), prerequisiti coerenti, backing fonti CORE 100% (nessuna unità CORE
  senza fonte content_reviewed; HISTORY_SCOPE §8.8). Non ottenibile per nodi.

## I tre gate (`scripts/coverage.mjs`)

- **qualityGate**: esito di validate.mjs eseguito come processo figlio.
- **coverageGate**: zero critical gap + ogni CORE ≥partially_covered (25).
- **readinessGate**: readiness derivata. I tre esiti sono stampati separatamente;
  QUALITY PASS non implica mai completezza.

## Claim status

verified (tutte le fonti content_reviewed) | partially_verified (almeno una
reachable/metadata) | unverified | disputed (interpretazioni concorrenti, da
esporre senza nasconderle). Migrazione v02 assegna lo status onesto.

## Priorità di lavoro (§26 del brief)

1. Coverage Matrix → 2. core curriculum → 3. prerequisiti → 4. contenuti
verificati → 5. claim → 6. esercizi → 7. cross-subject → 8. media → 9. avanzato.
`NEXT (priorità)` nel report è deterministico: CORE scoperte, peso desc,
foundational prima.
