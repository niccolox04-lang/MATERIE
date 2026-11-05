/**
 * Ricerca lessicale reale (titolo, testi, definizioni, keywords, autori/opere).
 * La ricerca semantica (embeddings) è pianificata: interfaccia pronta in
 * `semanticSearch` ma SENZA fake — lancia se l'indice vettoriale manca.
 * @module engine/search
 */

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Stopword italiano/inglese: ignorate in ricerca e retrieval (mai contenuto). */
export const STOPWORDS = new Set(
  "cosa cosa? che chi come dove quando quale quali quanto quanti quello questa questo sono sei siamo siete ho hai ha abbiamo hanno è era erano sia stato stata anche molto più meno non si ci ne lo la i gli le un uno una del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle con per tra fra ed od ma se perché poiché come cosa fare stato essere avere the a an of to in on is are was were what which how why when where who whom whose that this these those and or but with from".split(/\s+/)
);

/** Tokenizza una query: minuscole, no stopword, lunghezza >1. */
export function tokenize(query) {
  return norm(query)
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function haystack(node) {
  const parts = [
    node.title,
    node.summary,
    node.explanations?.semplice,
    node.explanations?.approfondita,
    node.explanations?.tecnica,
    ...(node.definitions || []),
    ...(node.examples || []),
    ...(node.keywords || []),
    // storiografia: le questioni e le posizioni devono essere trovabili
    ...(node.historiography || []).flatMap((h) => [
      h.question,
      h.whyContested,
      ...(h.positions || []).flatMap((p) => [p.label, ...(p.authors || []), ...(p.works || []), ...(p.evidence || [])]),
      ...(h.agreements || []),
      ...(h.disputes || []),
      ...(h.limits || []),
    ]),
    ...(node.sources || []).map((s) => `${s.title} ${s.author || ""}`),
    ...(node.learning?.quiz || []).map((q) => q.q),
  ];
  return norm(parts.filter(Boolean).join("\n"));
}

/**
 * Ricerca full-text con scoring TF-lite (occorrenze pesate per campo).
 * @param {object[]} nodes nodi già filtrati per entitlement
 * @param {string} query
 * @param {{subject?:string, type?:string, limit?:number}} opts
 */
export function searchNodes(nodes, query, opts = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const { subject, type, limit = 25 } = opts;
  const out = [];
  for (const n of nodes) {
    if (subject && n.subject !== subject) continue;
    if (type && n.type !== type) continue;
    const hay = haystack(n);
    const titleN = norm(n.title);
    let score = 0;
    for (const t of terms) {
      if (!hay.includes(t)) {
        score = -1;
        break;
      }
      const occ = hay.split(t).length - 1;
      score += Math.min(occ, 5);
      if (titleN.includes(t)) score += 5;
      if ((n.keywords || []).some((k) => norm(k).includes(t))) score += 3;
    }
    if (score >= 0) out.push({ node: n, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Ricerca semantica (pianificata). NON simula risultati:
 * lancia un errore esplicito se l'indice vettoriale non è stato costruito.
 */
export async function semanticSearch() {
  throw new Error(
    "Ricerca semantica non ancora disponibile: indice vettoriale non costruito. Usa searchNodes (lessicale)."
  );
}
