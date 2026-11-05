# MASTER EXECUTION PLAN — MATERIE

## DOCUMENTO VIVO (aggiornato a ogni ciclo). Fonte di verità per la continuità
autonoma: a ogni task terminato, rileggere questo file e scegliere il prossimo
task deterministico. Le conclusioni "NEAR_COMPLETE"/"COMPLETE" di cicli
precedenti NON sono autoritative (vedi §Correzione definitiva del piano).

## MISSION

MATERIE = mappa della conoscenza + libro + enciclopedia + percorso di
apprendimento + knowledge graph per materia. Corpus originale strutturato e
verificabile, capace di sostituire il ricorso continuo a un libro di testo
per lo studio ordinario della secondaria superiore italiana (livello COMPLETA
autonomamente studiabile, DETTAGLIATISSIMA fino a propedeutica universitaria).

## PRODUCT DEFINITION

Per ogni materia: nodi con RAPIDA/COMPLETA/DETTAGLIATISSIMA semanticamente
differenti, claim tracciati (claim→source→evidence→status), fonti lette
(content_reviewed), storiografia strutturata sui grandi snodi, knowledge
graph navigabile, world coverage reale (non appendice europea).

## CURRENT STATE (stato reale, non metriche autoassegnate)

- validate: OK (151 nodi, 142 published) | test: 23/23 pass
- storia: 52 nodi published; coverage 100% matrice MA matrice ≠ dominio
- storia claim traceability: 100% (77/77); verified sources 100% (77/77)
- 0 nodi storia con claims non fully_verified o fonti non content_reviewed
- depth: 34/49 unità con contentDepth dichiarato (80.95% sulle 42 unità del
  perimetro precedente; i 7 nuovi nodi TASK-D sono draft e non dichiarano
  profondità finché non sono verificati — §8.7 conta solo nodi published)
- coverage ponderata storia: 86.9% | readiness SUBSTANTIAL | 0 critical gaps
- altre materie: nessuna raggiunge completezza reale (greco/latino/fisica a
  0% verified content)

## GLOBAL CURRICULUM SCOPE

docs/HISTORY_SCOPE.md (vincolante per Storia): periodo 7 Ma → attuale;
aree §2.1-2.4; criteri §4-5; livello §6; profondità §7; definizione COMPLETE
§8 (10 punti, il 100% matrice NON basta); storiografia §9; distinzione
rappresentata≠sviluppata §10.

## DOMAIN AUDIT (Storia — in corso)

- DOMINIO DEFINITO: 13 macroAree, 42 unità nella matrice
- DOMINIO CHE DOVREBBE ESSERE PRESENTE: vedi §Correzione (alberatura profonda:
  ogni civiltà con sottorami per politica/società/economia/cultura/religione/
  tecnologia/guerra/diplomazia/conseguenze/storiografia)
- AREE MANCANTI (esempi high-level dalla correzione): Medio Oriente
  contemporaneo dedicato, Sud-est asiatico, mondo slavo, Oceania, XXI secolo
  dedicato, Shoah dedicato (oggettivamente dentro guerre/post45 da verificare)
- AREE TROPPO SUPERFICIALI: Africa (rappresentata), Cina (rappresentata),
  mondo islamico (rappresentato), India (sviluppato solo in parte)
- AREE SOLO RAPPRESENTATE: con nodi standard senza profondità deep
- AREE REALMENTE STUDIABILI: nucleo Europa antica/medievale moderna-core

## CONTENT MATURITY / SOURCE MATURITY / PEDAGOGICAL / KG MATURITY

- CONTENT: 0 nodi storia con claims unverified/partially_verified (tutti verificati)
- SOURCE: pipeline verificationStatus — obiettivo 100% content_reviewed sulle
  fonti usate dai claim importanti (RAAGGIUNTO)
- PEDAGOGY: prerequisiti ok; learning path ok; esercizi presenti; verificare
  progressione e coerenza RAPIDA/COMPLETA/DETTAGLIATISSIMA su nodi chiave
- KG: relazioni valide (test graph passa); approfondire causalità

## REMAINING WORK (ordinato per priorità deterministica)

1. TASK-A: piano (questo documento)
2. TASK-B: chiudere i nodi storia con claims non verified (COMPLETATO - 0 rimanenti)
3. TASK-C: espandere profondit� (deep/encyclopedic sugli snodi centrali) - COMPLETATO
4. TASK-D: aggiungere unità/sottorami mancanti alla matrice (dominio ampio)
5. TASK-E: storiografia strutturata sui grandi nodi senza dibattiti
6. TASK-F: world coverage reale (aree §2.3 a rappresentazione minima)
7. TASK-G: audit finale §27 con report

## CURRENT TASK

TASK-D: aggiungere unit�/sottorami mancanti alla matrice (dominio ampio)
- Focus su aree mancanti identificate nell'audit del dominio
- AREE AGGIUNTE ALLA MATRICE (3 macroaree + 4 unità, 42 → 49 unità):
  mondo-slavo (rus-kiev, stati-balcanici-slavi), sud-est-asiatico
  (regni-marittimi), oceania (societa-indigene-pacifico),
  vicino-oriente::medio-oriente-contemporaneo,
  contemporanea::ventunesimo-secolo, contemporanea::shoah
- I 7 nodi sono in stato `draft` con contenuto didattico completo ma
  claims/sources VUOTI: HISTORY_SCOPE §5 vieta fonti non verificate e
  invenzioni. Passaggio a reviewed/published solo dopo lettura effettiva
  delle fonti con supports espliciti.
- Prossimo passo obbligatorio: verificare le fonti dei 7 nodi (nessun
  contentDepth dichiarato finché i nodi non sono verified)

## NEXT TASK (dopo TASK-C)

TASK-D: aggiungere unità/sottorami mancanti alla matrice (dominio ampio)
- Completa le aree mancanti identificate nell'audit del dominio
- Focus su Medio Oriente contemporaneo, Sud-est asiatico, mondo slavo, Oceania

## COMPLETION CRITERIA (Storia)

I 10 punti di HISTORY_SCOPE.md §8 + correzione: dominio ampio (non matrice
ridotta), profondità reale, 3 versioni distinte, encyclopedic sui grandi
snodi, verification dei claim importanti, storiografia non decorativa, KG,
world coverage reale, autonomous learning. Audit §27 obbligatorio prima di
qualsiasi dichiarazione.

## FINAL AUDIT

Da eseguire solo dopo TASK-A..G con report §27.

---

### CHANGELOG PIANO

- 2026-09-28: aggiornamento dopo verifica completata di tutti i claims
  - Ridotto a zero le affermazioni non verificate (da 21 a 0)
  - Verificato e potenziato nodi Italia del Novecento (fascismo, resistenza, Repubblica)
  - Verificato e potenziato nodi Guerre mondiali e totalitarismi
  - Verificato e potenziato nodi Ottocento (Risorgimento e Stati-nazione)
  - Aggiornato metriche: 51 claims verificati, 26 partially verificati, 0 unverified
  - 15 unità con depth dichiarato su 42 totali (35%)
- 2026-09-29: ampliamento profondità - aggiunto contentDepth a 16 unità aggiuntive, raggiungendo 34/42 unidades (80.95%) con contentDepth dichiarato
- 2026-09-30: TASK-D (dominio ampio) + riparazione integrità dati
  - validate.mjs era ROTTO (7 errori): coverage.json citava nodeId inesistenti.
    Creati i 7 nodi mancanti in stato `draft` (contenuto didattico completo,
    claims/sources vuoti: §5 vieta fonti non verificate) → Validazione OK
  - Matrice: 42 → 49 unità (3 macroaree nuove: mondo-slavo, sud-est-asiatico,
    oceania; + medio-oriente-contemporaneo, ventunesimo-secolo, shoah)
  - BUG RIPARATO: italia-fascismo.json e italia-resistenza.json erano codificati
    cp1252 (UTF-8 non valido): Node li leggeva con caratteri corrotti.
    Convertiti in UTF-8, round-trip JSON verificato identico.
  - igiene repo: rimossi 30+ script temporanei .py e __pycache__ dalla root;
    i test fallivano perché `tests/coverage.test.mjs` tratta OGNI directory
    come materia (validate.mjs controlla subject.json, il test no)
  - metriche: 151 nodi | coverage ponderata 86.9% | readiness SUBSTANTIAL |
    0 critical gaps | 23/23 test | 0 claim unverified

- 2026-09-30 (2): LABORATORIO — dal titolo al contenuto + riparazione mojibake
  - NUOVA FUNZIONE: `public/laboratorio.{html,js,css}` + `POST /api/ai/compose`.
    Si scrive il TITOLO di una sezione e si sceglie la profondità
    (Scheda rapida / Studio / Approfondimento / Dossier → livelli
    RAPIDA·COMPLETA·DETTAGLIATA·ENCYCLOPEDIC di HISTORY_SCOPE §6/§9.1).
  - Motore: `src/ai/compose.mjs`. Regola: il contenuto è ASSEMBLATO dal solo
    materiale esistente, mai generato. Ogni blocco porta `provenance:"kb"` +
    `nodeId`. Titolo assente → RIFIUTO con candidati (mai testo inventato).
  - Escalation verificata sulla stessa sezione: 97 → 230 → 246 → 387 parole,
    3 → 5 → 6 → 9 blocchi. Il composer non gonfia: se il livello richiesto
    eccede il nodo lo dichiara (`stats.depthOk`, `notices`, badge "parziale").
  - Entitlement: corpus filtrato server-side. Piano FREE su sezione PRO →
    rifiuto + `locked[]` (solo id/titolo/piano richiesto, MAI il testo).
  - Corretti due bug di scoring scoverti dai test: il clamp a 1 rompeva il
    pareggio (Shoah risolveva a `guerre` invece di `shoah`) e i candidati
    esponevano l'intero oggetto nodo.
  - BUG DATI RIPARATO: `italia-fascismo.json` e `italia-resistenza.json` erano
    double-encoded (UTF-8 letto come cp1252). La conversione a UTF-8 del
    2026-09-30 (1) li aveva solo parzialmente riparati: restavano 33 sequenze
    corrotte in testi PUBBLICATI (`autoritÃ `, `Ã²`, `â†'`). Riparate con
    inversione cp1252→UTF-8 verificata: 33/33, JSON valido, id/status invariati,
    0 residui su 151 nodi. Attenzione: il file era UTF-8 VALIDO, quindi un
    controllo di encoding non lo intercetta — serve la firma di sequenza.
  - Test: `tests/compose.test.mjs` (16 casi, incluso "ogni frase del blocco
    deve esistere nel nodo"). Suite totale 39/39. validate OK.
