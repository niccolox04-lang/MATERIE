/**
 * Modello dati canonico della piattaforma.
 * Zero dipendenze. Le costanti qui sono l'unica fonte di verità;
 * la validazione (scripts/validate.mjs) e i test le importano.
 *
 * @module model/types
 */

/** Livelli di accesso ai contenuti. */
export const ACCESS_LEVELS = Object.freeze({
  FREE: "free",
  PRO: "pro",
  ULTRA: "ultra",
});

/** Ordine gerarchico dei piani (per confronto). */
export const PLAN_RANK = Object.freeze({ free: 0, pro: 1, ultra: 2 });

/** Stati di pubblicazione di un nodo. Pipeline: planned → draft → reviewed → published. */
export const NODE_STATUS = Object.freeze({
  PLANNED: "planned",
  DRAFT: "draft",
  REVIEWED: "reviewed",
  PUBLISHED: "published",
  DEPRECATED: "deprecated",
});

/**
 * Tipi di nodo. `area`/`periodo`/`macroargomento` sono contenitori strutturali,
 * `concetto`/`approfondimento` sono foglie didattiche. Le materie possono
 * usare sotto-tipi specialistici (es. `filosofo`, `opera`, `costrutto`)
 * purché restino sotto-tipi di questi tipi base (vedi subject.json taxonomy).
 */
export const NODE_TYPES = Object.freeze([
  "area",
  "periodo",
  "macroargomento",
  "argomento",
  "sottoargomento",
  "concetto",
  "approfondimento",
]);

/** Relazioni ammesse nel knowledge graph. */
export const RELATION_TYPES = Object.freeze([
  "PREREQUISITE",
  "CAUSE",
  "EFFECT",
  "PART_OF",
  "EXAMPLE_OF",
  "CONTRASTS_WITH",
  "INFLUENCES",
  "INFLUENCED_BY",
  "SIMILAR_TO",
  "DEVELOPS_INTO",
  "APPLIES_TO",
  "RELATED_TO",
]);

/** Relazioni che implicano un vincolo di ordinamento didattico. */
export const ORDERING_RELATIONS = Object.freeze(["PREREQUISITE", "PART_OF"]);

/** Stati di verifica di un claim (interpretazioni concorrenti: disputed). */
export const CLAIM_STATUS = Object.freeze(["verified", "partially_verified", "unverified", "disputed"]);

/**
 * Stati ammessi per una POSIZIONE storiografica: stessi valori dei claim.
 * Una posizione resta `unverified` finché la fonte registrata non la sostiene.
 */
export const HISTORIOGRAPHY_POSITION_STATUS = CLAIM_STATUS;

/** Stati di coverage di una macroarea disciplinare. */
export const AREA_STATUS = Object.freeze([
  "not_started",
  "outlined",
  "partially_covered",
  "substantially_covered",
  "fully_covered",
  "verified",
]);

/** Stato complessivo di una materia (readiness). */
export const READINESS = Object.freeze(["foundation", "developing", "substantial", "near_complete", "complete"]);

/** Importanza delle macroaree (pesi in engine/coverage.mjs). */
export const IMPORTANCE = Object.freeze(["core", "important", "secondary", "optional"]);

/** Livelli di difficoltà progressiva (opzionale per nodo). */
export const LEVELS = Object.freeze(["foundation", "intermediate", "advanced", "deep"]);

/**
 * Livelli di verifica di una fonte. HTTP 200 ≠ contenuto verificato:
 * - unverified: mai controllata
 * - reachable: URL risponde (HEAD/GET ok), contenuto NON revisionato
 * - verified_metadata: titolo/autore/editore confermati, contenuto NON revisionato
 * - content_reviewed: contenuto letto e confrontato con le affermazioni sostenute
 */
export const SOURCE_VERIFICATION = Object.freeze(["unverified", "reachable", "verified_metadata", "content_reviewed"]);
export const SOURCE_TYPES = Object.freeze([
  "book",
  "encyclopedia",
  "university",
  "institution",
  "archive",
  "museum",
  "library",
  "academic-site",
  "primary-source",
  "article",
  "video",
  "podcast",
  "other",
]);

/** Piani di abbonamento. */
export const PLANS = Object.freeze(["free", "pro", "ultra"]);

/**
 * Posizione dentro un dibattito storiografico. `label` è una lettura, NON una
 * scuola inventata: `authors`/`works` si compilano SOLO se la fonte registrata
 * li nomina, altrimenti restano vuoti e la posizione è `unverified`.
 * @typedef {Object} HistoriographyPosition
 * @property {string} label lettura/posizione (es. "conquista regia")
 * @property {string[]} [authors] autori attribuiti dalla fonte
 * @property {string[]} [works] opere citate dalla fonte
 * @property {string[]} evidence evidenze/argomenti portati dalla fonte
 * @property {"verified"|"partially_verified"|"unverified"|"disputed"} status
 */

/**
 * Dibattito storiografico strutturato: questione → perché è controversa →
 * posizioni con evidenze → accordi → dispute → limiti. Serve al livello
 * DETTAGLIATISSIMA; in RAPIDA basta sapere che il dibattito esiste.
 * @typedef {Object} HistoriographyDebate
 * @property {string} id
 * @property {string} question questione storica controversa
 * @property {string} [whyContested] perché la questione è controversa
 * @property {HistoriographyPosition[]} positions almeno due (altrimenti non è un dibattito)
 * @property {string[]} [agreements] punti di accordo tra le posizioni
 * @property {string[]} [disputes] punti di disaccordo
 * @property {string[]} [limits] limiti delle interpretazioni / delle fonti
 * @property {string[]} supportedBy id delle fonti del nodo (tracciabilità come per i claim)
 */

/**
 * @typedef {Object} Relation
 * @property {string} type uno di RELATION_TYPES
 * @property {string} to id stabile del nodo destinazione (subject:slug)
 * @property {string} [note] nota didattica sulla relazione
 */

/**
 * @typedef {Object} Source
 * @property {string} id
 * @property {string} title
 * @property {string} [author]
 * @property {string} [publisher]
 * @property {string} [url] solo URL realmente controllati (vedi verificationStatus)
 * @property {string} sourceType uno di SOURCE_TYPES
 * @property {string} [language] es. "it", "en", "grc", "la"
 * @property {boolean} verified legacy: true SOLO se verificationStatus === "content_reviewed"
 * @property {string} verificationStatus uno di SOURCE_VERIFICATION
 * @property {string} accessedAt ISO date di controllo
 * @property {string[]} [supports] quali affermazioni del nodo sostiene (tracciabilità claim→fonte)
 * @property {string} [note]
 */

/**
 * @typedef {Object} ConceptNode
 * @property {string} id stabile "materia:slug-percorso"
 * @property {string} subject es. "filosofia"
 * @property {string} title
 * @property {string} slug
 * @property {string} status uno di NODE_STATUS
 * @property {string} access uno di ACCESS_LEVELS
 * @property {string} type uno di NODE_TYPES (+ sotto-tipi documentati in subject.json)
 * @property {string|null} parent id del padre, null per radici di materia
 * @property {number} order ordinamento tra fratelli
 * @property {number} version
 * @property {string} createdAt ISO
 * @property {string} updatedAt ISO
 * @property {string} [summary]
 * @property {{semplice?:string, approfondita?:string, tecnica?:string}} [explanations]
 * @property {string[]} [definitions]
 * @property {string[]} [examples]
 * @property {string[]} [counterexamples]
 * @property {string[]} [errorsTypical]
 * @property {string[]} [keywords]
 * @property {string[]} [prerequisites] ids
 * @property {string} [level] uno di LEVELS (difficoltà progressiva)
 * @property {{id:string, statement:string, supportedBy:string[], status?:"verified"|"partially_verified"|"unverified"|"disputed"}[]} [claims] proposizioni importanti con fonti (id di sources dello stesso nodo)
 * @property {HistoriographyDebate[]} [historiography] dibattiti storiografici strutturati (questione→posizioni→evidenze→accordi→dispute→limiti; solo con fonti che li sostengono)
 * @property {{start?:string, end?:string, label?:string, place?:string}} [chrono] collocazione temporale (storia)
 * @property {string[]} [proof] passaggi dimostrativi (matematica)
 * @property {{expr:string, meaning?:string}[]} [formulas] formule con significato (matematica/fisica)
 * @property {Relation[]} [relations]
 * @property {Source[]} [sources]
 * @property {{videos?:any[], images?:any[], audios?:any[], documents?:any[]}} [media]
 * @property {{flashcards?:{q:string,a:string}[], quiz?:{q:string,choices:string[],answer:number,explanation?:string}[], questionsOpen?:string[]}} [learning]
 */
