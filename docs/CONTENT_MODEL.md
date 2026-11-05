# Content model e tassonomie

## Schema comune

Gerarchia: MATERIA → AREA → PERIODO/MACROARGOMENTO → ARGOMENTO → SOTTOARGOMENTO → CONCETTO → APPROFONDIMENTO. Ogni materia specializza con sotto-tipi nel proprio `subject.json` senza toccare il motore.

## Materie (stato reale 2026-09-24, quinto ciclo: 59 nodi, readiness da `npm run coverage`)

| Materia | Nodi | Contenuto published | Da fare |
|---|---|---|---|
| filosofia | 29 | panoramiche + Platone (11) + Aristotele (5) + ellenismo/stoa/giardino/scettici (4) + Agostino + Tommaso | moderna/contemporanea ancora panoramiche |
| storia | 3 | introduzione + Atene classica + guerra del Peloponneso | resto della cronologia |
| greco | 3 | introduzione + alfabeto + declinazioni del nome | verbi, sintassi, autori |
| latino | 3 | introduzione + casi + II declinazione | III–V decl., verbi, subordinate, autori |
| matematica | 3 | introduzione + Pitagora + √2 (catena: Pitagora→diagonale→irrazionale) | resto del programma |
| fisica | 3 | introduzione + cinematica + II principio (catena: cinematica→dinamica) | resto della meccanica e oltre |

Fonti content_reviewed: Treccani Platone, SEP Plato, Treccani Aristotele (lette via fetch e confrontate). Fonti reachable (HEAD 200, contenuto da revisionare): Treccani stoicismo/epicureismo/scetticismo/atene/alfabeto-greco/lingua-latina/dinamica + SEP Aristotle. Zero URL inventati; zero video/podcast inventati (pipeline metadati pronta, array vuoti).

Regola redazionale: i nodi `planned` hanno solo metadati (mai testo inventato); la pubblicazione richiede summary ≥40 char, doppia spiegazione, fonti verificate e revisione. L'importer scrive sempre `draft`.

## Qualità linguistica

Divieto di citazioni/etimologie/date inventate (validazione + review umana). Date oscillanti dichiarate come tali (es. Platone 428/427–348/347). Greco/latino: paradigmi futuri solo da grammatiche verificate.
