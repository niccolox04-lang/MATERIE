/**
 * Composer di contenuti: da un TITOLO DI SEZIONE a un contenuto pronto, ai
 * quattro livelli del corpus (RAPIDA → COMPLETA → DETTAGLIATA → ENCYCLOPEDIC),
 * secondo docs/HISTORY_SCOPE.md §6 e §9.1.
 *
 * Regole non negoziabili (stessa etica di ai/grounding.mjs):
 * - MAI si inventa contenuto. Ogni blocco assemblato contiene solo campi REALI
 *   del nodo, e dichiara `provenance: "kb"` + `nodeId`.
 * - Se il titolo non trova un nodo, si RIFIUTA e propone i candidati più vicini.
 * - Se il livello richiesto eccede ciò che il nodo contiene davvero, lo
 *   DICHIARA (notice) invece di gonfiare il testo.
 * - Le fonti e i claim sono riportati solo con il loro vero stato di
 *   verifica: nessun `content_reviewed` inventato.
 *
 * @module ai/compose
 */
import { tokenize, STOPWORDS } from "../engine/search.mjs";
import { PROVENANCE } from "./grounding.mjs";

/** I quattro formati, dal più breve al più esteso. */
export const FORMATS = Object.freeze([
  {
    id: "scheda",
    label: "Scheda rapida",
    level: "RAPIDA",
    blurb: "L'idea essenziale in un colpo d'occhio: cos'è, quando, perché conta.",
    hint: "Sintesi + parole semplici",
    words: [90, 260],
  },
  {
    id: "studio",
    label: "Studio",
    level: "COMPLETA",
    blurb: "La spiegazione con definizioni, esempi, errori tipici e prerequisiti.",
    hint: "+ definizioni, esempi, errori, prerequisiti",
    words: [200, 520],
  },
  {
    id: "approfondimento",
    label: "Approfondimento",
    level: "DETTAGLIATA",
    blurb: "Aggiunge il livello tecnico, i controesempi e il dibattito storiografico.",
    hint: "+ livello tecnico, controesempi, dibattiti",
    words: [300, 900],
  },
  {
    id: "dossier",
    label: "Dossier",
    level: "ENCYCLOPEDIC",
    blurb: "Dossier completo: claim con stato di verifica, fonti, collegamenti, quiz.",
    hint: "+ claim verificati, fonti, collegamenti, quiz",
    words: [500, 2000],
  },
]);

export const FORMAT_IDS = Object.freeze(FORMATS.map((f) => f.id));

/** Soglia di confidenza sotto la quale il titolo è considerato NON trovato. */
export const MATCH_ACCEPT = 0.34;
/** Soglia sotto la quale un candidato viene mostrato solo come suggerimento. */
export const MATCH_SUGGEST = 0.12;

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u030f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const titleTokens = (s) => tokenize(s).filter((t) => t.length > 2 || /\d/.test(t));

/** Quanti livelli di lettura il nodo contiene davvero (mai presunti). */
export function nodeLevels(node) {
  const ex = node?.explanations || {};
  return {
    rapida: Boolean(ex.semplice || node?.summary),
    completa: Boolean(ex.approfondita),
    dettagliata: Boolean(ex.tecnica || (node?.historiography || []).length),
    encyclopedic:
      Boolean(
        ex.tecnica &&
          (node?.counterexamples || []).length &&
          (node?.examples || []).length &&
          (node?.errorsTypical || []).length
      ) || ((node?.claims || []).length > 0 && (node?.sources || []).length > 0),
  };
}

/** Punteggio di un nodo per un titolo: overlap dei token, normalizzato 0..1. */
function scoreNode(node, tokens, q) {
  if (!tokens.length) return 0;
  const titleN = norm(node.title);
  const slug = String(node.slug || String(node.id).split(":")[1] || "").replace(/-/g, " ");
  const kw = (node.keywords || []).map(norm).join(" ");
  const summary = norm(node.summary || "");
  const hit = (hay) => tokens.filter((t) => hay.includes(t)).length;
  const tHits = hit(titleN);
  const kHits = hit(kw);
  const sHits = hit(summary);
  if (!tHits && !kHits && !sHits) return 0;
  // overlap pesato: titolo 1.0, keywords 0.75, summary 0.45 → normalizzato a 0..1
  const overlap = (tHits * 1.0 + kHits * 0.75 + sHits * 0.45) / (tokens.length * 2.2);
  // bonus esatti: id/slug o titolo identici al query dominate il resto
  if (slug === q || titleN === q) return 1;
  if (titleN.startsWith(q) || q.startsWith(titleN)) return Math.min(1, overlap + 0.15);
  return overlap;
}

/**
 * Risolve un TITOLO in nodi del corpus.
 * Ritorna { matched, candidates } dove `matched` è vuoto se il titolo non
 * trova riscontro (nessuna invenzione: il chiamante deve rifiutare).
 */
export function resolveSection(nodes, title, { subject } = {}) {
  const q = norm(title);
  const tokens = titleTokens(title);
  const pool = subject ? nodes.filter((n) => n.subject === subject) : nodes;
  if (!q || !pool.length) return { matched: [], candidates: [] };

  const scored = pool
    .map((n) => ({ node: n, score: scoreNode(n, tokens, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // 1) corrispondenza esatta slug/id
  const exact = pool.find((n) => n.id === String(title).trim() || n.slug === String(title).trim());
  if (exact) {
    return {
      matched: [{ node: exact, score: 1, how: "id esatto" }],
      candidates: scored.slice(0, 6).map((s) => ({ node: s.node, score: s.score, how: "correlato" })),
    };
  }

  const top = scored[0];
  if (top && top.score >= MATCH_ACCEPT) {
    return {
      matched: [{ node: top.node, score: top.score, how: top.score >= 0.6 ? "titolo esatto" : "affinità" }],
      candidates: scored.slice(1, 6).map((s) => ({ node: s.node, score: s.score, how: "correlato" })),
    };
  }

  // 2) titolo composto: "X e Y", "X, Y", "X – Y" → più nodi
  const parts = String(title)
    .split(/\s*(?:,|;|\be\b|\bed\b|[-–—]|\bpiù\b)\s*/i)
    .map((p) => norm(p))
    .filter((p) => p.length > 3);
  if (parts.length > 1) {
    const perPart = parts
      .map((p) => {
        const toks = titleTokens(p);
        const best = pool
          .map((n) => ({ node: n, score: scoreNode(n, toks, p) }))
          .sort((a, b) => b.score - a.score)[0];
        return best && best.score >= MATCH_ACCEPT ? best : null;
      })
      .filter(Boolean);
    const uniq = [...new Map(perPart.map((p) => [p.node.id, p])).values()];
    if (uniq.length >= 2) {
      return {
        matched: uniq.map((p) => ({ node: p.node, score: p.score, how: "sezione composta" })),
        candidates: scored.slice(0, 6).map((s) => ({ node: s.node, score: s.score, how: "correlato" })),
      };
    }
  }

  return {
    matched: [],
    candidates: scored
      .filter((s) => s.score >= MATCH_SUGGEST)
      .slice(0, 6)
      .map((s) => ({ node: s.node, score: s.score, how: "suggerito" })),
  };
}

const block = (node, heading, body, extra = {}) => ({
  heading,
  body,
  nodeId: node.id,
  nodeTitle: node.title,
  provenance: PROVENANCE.KB,
  ...extra,
});

const list = (node, heading, items, kind) =>
  items && items.length ? block(node, heading, null, { kind, items: items.slice() }) : null;

/** Proiezione sicura di un candidato: SOLO metadati, mai il testo del nodo. */
export const projectCandidate = ({ node, score, how }) => ({
  id: node.id,
  title: node.title,
  subject: node.subject,
  status: node.status,
  access: node.access,
  score: Math.round(score * 100) / 100,
  how,
});

/** Compone il contenuto di UN nodo al livello richiesto (solo campi reali). */
export function composeNode(node, formatId) {
  const format = FORMATS.find((f) => f.id === formatId) || FORMATS[0];
  const rank = FORMAT_IDS.indexOf(format.id);
  const lv = nodeLevels(node);
  const ex = node.explanations || {};
  const out = [];
  const notices = [];

  // --- testata (sempre) ---
  const head = (node.summary || "").trim();
  if (head) out.push(block(node, "In sintesi", head));
  if (node.chrono?.label || node.chrono?.place) {
    const when = [node.chrono?.label, node.chrono?.place].filter(Boolean).join(" · ");
    if (when) out.push(block(node, "Quando e dove", when, { kind: "meta" }));
  }

  // --- livello 1: RAPIDA ---
  if (ex.semplice) out.push(block(node, "In parole semplici", ex.semplice));
  if (rank >= 1) {
    list(node, "Definizioni chiave", node.definitions, "definitions");
    list(node, "Esempi", node.examples, "examples");
    list(node, "Errori da evitare", node.errorsTypical, "errors");
  }

  // --- livello 2: COMPLETA ---
  if (rank >= 1 && ex.approfondita) {
    out.push(block(node, "Spiegazione approfondita", ex.approfondita));
  }
  if (rank >= 1 && (node.prerequisites || []).length) {
    out.push(block(node, "Da sapere prima", null, { kind: "prerequisites", items: node.prerequisites.slice() }));
  }

  // --- livello 3: DETTAGLIATA ---
  if (rank >= 2) {
    if (ex.tecnica) out.push(block(node, "Livello tecnico", ex.tecnica));
    list(node, "Controesempi", node.counterexamples, "counterexamples");
    for (const h of node.historiography || []) {
      const pos = (h.positions || []).map(
        (p) => `${p.label} — ${p.authors?.length ? p.authors.join(", ") : "autori non verificati nella fonte"}`
      );
      out.push(
        block(node, `Dibattito: ${h.question}`, [h.whyContested, ...pos].filter(Boolean).join("\n"), {
          kind: "historiography",
          agreements: h.agreements || [],
          disputes: h.disputes || [],
          limits: h.limits || [],
        })
      );
    }
  }

  // --- livello 4: ENCYCLOPEDIC ---
  if (rank >= 3) {
    if ((node.claims || []).length) {
      out.push(
        block(node, "Affermazioni e stato di verifica", null, {
          kind: "claims",
          items: node.claims.map((c) => ({
            text: c.statement,
            status: c.status || "non dichiarato",
            supportedBy: c.supportedBy || [],
          })),
        })
      );
    }
    if ((node.sources || []).length) {
      out.push(
        block(node, "Fonti e verifica", null, {
          kind: "sources",
          items: node.sources.map((s) => ({
            text: `${s.title}${s.author ? ` — ${s.author}` : ""}`,
            status: s.verificationStatus,
            note: s.note || "",
          })),
        })
      );
    }
    const rels = (node.relations || []).map((r) => `${r.type.replace(/_/g, " ").toLowerCase()} → ${r.to}`);
    list(node, "Collegamenti nella mappa", rels, "relations");
    if ((node.learning?.quiz || []).length) {
      out.push(
        block(node, "Verifica se hai capito", null, {
          kind: "quiz",
          items: node.learning.quiz.map((q) => ({ q: q.q, choices: q.choices, answer: q.answer, explanation: q.explanation })),
        })
      );
    }
  }

  // --- onestà: cosa il nodo NON contiene (mai gonfiare per sembrare completo) ---
  const fmt = FORMATS.find((f) => f.id === formatId);
  if (rank >= 2 && !lv.dettagliata) {
    notices.push(
      `Il nodo non contiene un livello tecnico né un dibattito storiografico: la sezione tecnica è assente nella base di conoscenza, non è stata sintetizzata. Il formato "${fmt.label}" (${fmt.level}) resta quindi parziale.`
    );
  }
  if (rank >= 3 && !lv.encyclopedic) {
    notices.push(
      "Materiale incompleto per un dossier: mancano fonti/claim o esempi e controesempi. Il dossier riporta solo ciò che esiste."
    );
  }
  if (!(node.sources || []).length) {
    notices.push(
      "Nessuna fonte registrata su questo nodo: contenuto non ancora verificato, non usabile come citazione."
    );
  }

  return { blocks: out, notices, levels: lv, format };
}


const wordCount = (blocks) =>
  blocks.reduce((acc, b) => {
    const t = b.body ? b.body.split(/\s+/).length : 0;
    const i = (b.items || []).reduce(
      (a, x) => a + (typeof x === "string" ? x.split(/\s+/).length : (x.text || x.q || "").split(/\s+/).length),
      0
    );
    return acc + t + i;
  }, 0);

/** Etichetta le fonti: quante sono davvero content_reviewed. */
function auditSources(nodes) {
  const all = nodes.flatMap((n) => n.sources || []);
  const reviewed = all.filter((s) => s.verificationStatus === "content_reviewed").length;
  return {
    total: all.length,
    contentReviewed: reviewed,
    ratio: all.length ? reviewed / all.length : 0,
  };
}

/**
 * Statistiche + verdetto di completezza rispetto al formato richiesto.
 * `fill` confronta le parole reali con l'intervallo tipico del formato:
 * sotto-soglia = "corpo più snello del previsto", sopra = "ricco".
 */
function buildStats(blocks, matched, formatId, words) {
  const f = FORMATS.find((x) => x.id === formatId) || FORMATS[0];
  const [lo, hi] = f.words;
  const fill = words < lo ? "snello" : words > hi ? "ricco" : "in linea";
  return {
    words,
    blocks: blocks.length,
    nodes: matched.length,
    expected: [lo, hi],
    fill,
    // quanto del livello richiesto il corpus copre davvero
    depthOk: matched.every((m) => {
      const lv = nodeLevels(m.node);
      if (formatId === "scheda") return lv.rapida;
      if (formatId === "studio") return lv.rapida && lv.completa;
      if (formatId === "approfondimento") return lv.rapida && lv.completa && lv.dettagliata;
      return lv.rapida && lv.completa && lv.dettagliata && lv.encyclopedic;
    }),
  };
}

/**
 * Punto d'ingresso: { title, subject, format } → contenuto composto.
 * Non solleva mai per "contenuto assente": ritorna un rifiuto esplicito.
 */
export function composeSection(nodes, { title, subject, format } = {}) {
  const cleanTitle = String(title || "").trim();
  const fmt = FORMAT_IDS.includes(format) ? format : "scheda";
  if (!cleanTitle) {
    return { ok: false, refusal: true, reason: "empty", title: "", format: fmt, candidates: [] };
  }
  const { matched, candidates } = resolveSection(nodes, cleanTitle, { subject });
  if (!matched.length) {
    return {
      ok: false,
      refusal: true,
      reason: "no-match",
      title: cleanTitle,
      format: fmt,
      message:
        "Nessuna sezione del corpus corrisponde a questo titolo. Non genero un contenuto inventato: " +
        "scegli una delle sezioni suggerite oppure apri la mappa e aggiungi il nodo.",
      candidates: candidates.map(projectCandidate),
    };
  }
  const composed = matched.map((m) => ({ ...composeNode(m.node, fmt), match: m }));
  const blocks = composed.flatMap((c) => c.blocks);
  const notices = [...new Set(composed.flatMap((c) => c.notices))];
  return {
    ok: true,
    refusal: false,
    title: cleanTitle,
    format: fmt,
    level: FORMATS.find((f) => f.id === fmt).level,
    blocks,
    notices,
    nodes: matched.map((m) => ({
      id: m.node.id,
      title: m.node.title,
      subject: m.node.subject,
      score: Math.round(m.score * 100) / 100,
      how: m.how,
      status: m.node.status,
      access: m.node.access,
      levels: nodeLevels(m.node),
    })),
    candidates: candidates.map(projectCandidate),
    sources: auditSources(matched.map((m) => m.node)),
    stats: buildStats(blocks, matched, fmt, wordCount(blocks)),
  };
}

/** Rendering Markdown fedele ai blocchi (per copia/esportazione). */
export function toMarkdown(result) {
  if (!result?.ok) return "";
  const L = [];
  L.push(`# ${result.title}`, "");
  L.push(`> ${result.level} · ${result.stats.words} parole · fonti verificate ${result.sources.contentReviewed}/${result.sources.total}`);
  L.push(`> Nodi: ${result.nodes.map((n) => n.id).join(", ")}`);
  L.push("");
  for (const b of result.blocks) {
    L.push(`## ${b.heading}`);
    if (b.body) L.push("", b.body);
    if (b.items?.length) {
      L.push("");
      for (const it of b.items) {
        if (typeof it === "string") L.push(`- ${it}`);
        else if (it.q && it.choices) L.push(`- **${it.q}** → ${it.choices[it.answer] ?? "?"}`);
        else L.push(`- ${it.text}${it.status ? ` _(${it.status})_` : ""}`);
      }
    }
    if (b.agreements?.length) L.push("", `**Accordi:** ${b.agreements.join("; ")}`);
    if (b.disputes?.length) L.push("", `**Dispute:** ${b.disputes.join("; ")}`);
    if (b.limits?.length) L.push("", `**Limiti:** ${b.limits.join("; ")}`);
    L.push("", `_Fonte: ${b.nodeId} (${b.provenance})_`, "");
  }
  if (result.notices.length) {
    L.push("---", "", "**Avvertenze di completezza**", "");
    for (const n of result.notices) L.push(`- ${n}`);
  }
  return L.join("\n");
}
