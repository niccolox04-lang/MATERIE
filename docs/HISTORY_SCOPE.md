# HISTORY SCOPE — Perimetro operativo del corpus di Storia

Documento vincolante per la costruzione della World History Master Coverage Matrix
(`storia/coverage.json`) e dei contenuti (`storia/nodes/`).
Redatto il 2026-09-24. Ogni estensione del perimetro richiede aggiornamento di
questo documento PRIMA dei contenuti.

## 1. Periodo coperto

- Inizio: comparsa degli ominini (~7 Ma, con date "circa" e intervalli dibattuti).
- Fine: mondo attuale (data di redazione dei nodi; nessun evento dopo il 2026-09-24
  salvo aggiornamenti documentati con nuove fonti).
- La cronologia usa anni con segno (BCE negativi). Date antiche sempre come
  intervalli o con "circa"; mai cifre secche non supportate.

## 2. Aree geografiche (ordine di priorità didattica)

1. Europa e Mediterraneo (nucleo del curricolo italiano) — importance: core.
2. Vicino Oriente ed Egitto (fondazioni) — importance: core.
3. Africa subsahariana, Asia (Cina, India, Giappone), Americhe precolombiane,
   mondo islamico oltre il Mediterraneo — importance: important
   (componente mondiale obbligatoria per COMPLETE, misurata dal gate
   geografico di `scripts/history-master.mjs`, non dal gate CORE del motore).
4. Oceania e Asia centrale/steppe: citate dove pertinenti (Mongoli, Via della Seta);
   unità dedicate solo se il fabbisogno didattico lo richiede.

## 3. Civiltà e processi inclusi

Preistoria e antropogenesi; Mezzaluna fertile; Egitto; Levante (Ittiti, Fenici,
Ebrei); Grecia (inclusi Minoici/Micenei come ponte); Roma; cristianesimo antico;
tardoantico; Bisanzio; Islam e califfati; Europa medievale; Africa (Nubia/Kush,
Axum, Cartagine, Ghana/Mali/Songhai, tratta, colonialismo, decolonizzazione);
Cina imperiale e contemporanea; India antica e moderna; Giappone premoderno e
contemporaneo; Mesoamerica e Ande; Italia come percorso trasversale;
Rinascimento; scoperte; Riforma/Controriforma; assolutismo; rivoluzione
scientifica; Illuminismo; rivoluzioni; Ottocento; imperialismo; guerre mondiali;
interbellico; seconda guerra; Shoah; Resistenza; guerra fredda; decolonizzazione;
UE; Medio Oriente contemporaneo; globalizzazione; XXI secolo.

## 4. Criteri di inclusione

- Rilevanza curricolare (secondaria superiore italiana) o nesso causale
  documentato con eventi inclusi (es. Via della Seta, espansione mongola).
- Ogni unità ha prerequisiti espliciti; nessuna unità avanzata senza fondamenti.

## 5. Criteri di esclusione

- Microstoria locale senza portata generale (salvo percorso Italia).
- Eventi dopo la data di redazione senza fonti verificate.
- Contenuti che richiederebbero fonti non disponibili: stato `draft`/`blocked`
  con motivazione, MAI inventati.

## 6. Livello didattico

Secondaria superiore come base (livello COMPLETO autonomamente studiabile);
livello DETTAGLIATO fino a propedeutica universitaria dove pertinente.
Tre spiegazioni obbligatorie: semplice (RAPIDA), approfondita (COMPLETA),
tecnica (DETTAGLIATA con profondità informativa diversa, non testo allungato).

## 7. Profondità attesa (contentDepth)

- `overview`: panoramiche e raccordi (es. Mediterraneo come ponte).
- `standard`: studio scolastico completo e autonomo (default).
- `deep`: periodi centrali con storiografia e dibattiti.
- `encyclopedic`: grandi snodi con multiperspettiva (politica, economia,
  società, militare, cultura, tecnologia, geografia).

## 8. Cosa significa COMPLETE per Storia (§35 operativa)

1. scope defined (questo documento);
2. domain coverage sufficient (tutte le unità della matrice con contenuto);
3. CORE coverage complete (zero critical gap, aree CORE ≥ fully/verified);
4. world coverage sufficient (nessuna regione §2.3 a zero nodi);
5. chronology coherent (chrono parse + catene causa-effetto navigabili);
6. prerequisites coherent (gate esistente);
7. content depth adequate (nessuna unità `deep`/`encyclopedic` con solo overview);
8. important claims sufficiently backed (claims sostanziali con supportedBy);
9. source verification pipeline passed (reachable → metadata → content_reviewed);
10. quality, coverage e readiness gate passati.
Il 100% della matrice da solo NON basta.

## 9. Storiografia strutturata (campo `historiography`)

Dal ciclo di maturazione avanzata la storiografia NON è più solo prosa dentro
`explanations.approfondita`, ma un campo opzionale strutturato del nodo
(vedi `src/model/types.mjs`, typedef `HistoriographyDebate`):

```text
question       questione storica controversa (min 20 char)
whyContested   perché è controversa
positions[]    ≥ 2 posizioni: label, authors[], works[], evidence[], status
agreements[]   punti di accordo
disputes[]     punti di disaccordo
limits[]       limiti delle interpretazioni e delle fonti
supportedBy[]  id delle fonti del nodo (tracciabilità come per i claim)
```

Regole vincolanti:

- `authors`/`works` si compilano SOLO se la fonte registrata li nomina; una
  posizione senza autori verificati resta senza autori (mai scuole inventate).
- `evidence` non può essere vuota: una posizione senza evidenze non entra.
- `supportedBy` deve citare fonti reali del nodo (`scripts/validate.mjs` lo impone).
- Se il dibattito non è verificabile si omette il campo, non si inventa.

### 9.1 Livelli di lettura e storiografia

- RAPIDA (`explanations.semplice`): al massimo "esiste un dibattito" e la
  questione in una frase.
- COMPLETA (`explanations.approfondita`): spiegazione essenziale del dibattito,
  senza bibliografia.
- DETTAGLIATISSIMA (`explanations.tecnica` + `historiography`): autori, opere,
  evidenze, divergenze, limiti, contesto storiografico.

### 9.2 Fonti primarie: checklist di registrazione

Una fonte primaria si registra (`sourceType: "primary-source"`) solo dopo
LOCATE → IDENTIFY → READ → CHECK CONTEXT, e nel nodo deve dichiarare:
autore/produttore, periodo, destinatario/funzione, provenienza, trasmissione,
limiti e la domanda storica collegata (`supports`). Un testo antico senza
contesto non è una fonte utilizzabile didatticamente.

## 10. Regione rappresentata ≠ regione sviluppata

`scripts/history-master.mjs` misura due cose diverse: presenza di nodi published
per macroregione e profondità effettiva (contentDepth, content_reviewed). Una
regione con struttura completa ma soli nodi `standard` è **rappresentata**, non
**adeguatamente sviluppata**: il gate mondiale non assorbe il gate CORE.
