/**
 * AI grounded: retrieval locale + provenance esplicita, anti-allucinazione.
 * - MAI inventa contenuti spacciandoli per knowledge base.
 * - Ogni affermazione derivata dalla KB cita gli id dei nodi usati.
 * - Se l'evidenza è insufficiente, lo dichiara (REFUSAL) invece di inventare.
 * - L'LLM esterno è solo un adapter opzionale (richiede OPENAI_API_KEY + piano ULTRA);
 *   senza chiave, tutte le funzioni "avanzate" operano in modalità estrattiva locale.
 * @module ai/grounding
 */
import { searchNodes, tokenize } from "../engine/search.mjs";
import { canUseAdvancedAI } from "../engine/entitlements.mjs";

export const PROVENANCE = Object.freeze({
  KB: "kb", // contenuto presente nella knowledge base
  EXTERNAL: "external", // fonte esterna verificata citata
  INFERENCE: "inference", // inferenza/sintesi generativa, NON fatto KB
  UNVERIFIED: "unverified", // dato non verificato
});

/**
 * Recupera i nodi pertinenti (retrieval lessicale) — base RAG.
 */
export function retrieve(nodes, question, k = 4) {
  return searchNodes(nodes, question, { limit: k }).map((r) => r.node);
}

/** Estrae frasi rilevanti (estrattivo, senza LLM). */
function extractSentences(nodes, terms, maxChars = 1200) {
  const out = [];
  for (const n of nodes) {
    const text = [n.explanations?.approfondita, n.explanations?.semplice, ...(n.definitions || [])]
      .filter(Boolean)
      .join(" ");
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      const low = s.toLowerCase();
      if (terms.some((t) => t.length > 2 && low.includes(t))) {
        out.push({ text: s.trim(), nodeId: n.id });
        if (out.join(" ").length > maxChars) break;
      }
    }
  }
  return out.slice(0, 8);
}

/**
 * Risposta grounded ESTRATTIVA (funziona senza LLM, per tutti i piani entitled al nodo).
 * Ritorna {answer, citations:[nodeId], provenance, refusal?}.
 */
export function answerGrounded(nodes, question) {
  const q = String(question || "").trim();
  if (!q) return { answer: "", citations: [], provenance: PROVENANCE.UNVERIFIED, refusal: true };
  const terms = tokenize(q);
  const hits = retrieve(nodes, q, 4);
  if (!hits.length) {
    return {
      answer:
        "Nella knowledge base non ho trovato evidenza sufficiente per rispondere. " +
        "Non genero una risposta inventata: prova a riformulare o studia i prerequisiti indicati nella mappa.",
      citations: [],
      provenance: PROVENANCE.UNVERIFIED,
      refusal: true,
    };
  }
  const ev = extractSentences(hits, terms);
  if (!ev.length) {
    return {
      answer:
        `Ho individuato questi nodi pertinenti — ${hits.map((h) => h.id).join(", ")} — ` +
        "ma nessuna frase abbastanza pertinente da citare testualmente. " +
        "Apri i nodi citati per la spiegazione completa.",
      citations: hits.map((h) => h.id),
      provenance: PROVENANCE.KB,
      refusal: false,
    };
  }
  return {
    answer: ev.map((e) => e.text).join(" "),
    citations: [...new Set(ev.map((e) => e.nodeId))],
    provenance: PROVENANCE.KB,
    refusal: false,
  };
}

/** Genera domande di autovalutazione ESTRATTIVE da un nodo (reale, senza LLM). */
export function makeQuestions(node, n = 5) {
  const qs = [...(node.learning?.questionsOpen || [])];
  for (const d of node.definitions || []) {
    if (qs.length >= n) break;
    qs.push(`Spiega con parole tue: ${d.split(".")[0]}.`);
  }
  for (const k of node.keywords || []) {
    if (qs.length >= n) break;
    const q = `Cosa significa "${k}" nel contesto di "${node.title}"?`;
    if (!qs.includes(q)) qs.push(q);
  }
  return qs.slice(0, n).map((q) => ({ q, provenance: PROVENANCE.KB, source: node.id }));
}

/** Confronto ESTRATTIVO tra due nodi (mai inventato: solo campi reali). */
export function compareNodes(a, b) {
  const rows = [
    { dim: "Definizione", a: (a.definitions || [])[0] || a.summary || "—", b: (b.definitions || [])[0] || b.summary || "—" },
    { dim: "Parole chiave", a: (a.keywords || []).join(", ") || "—", b: (b.keywords || []).join(", ") || "—" },
    {
      dim: "Relazioni",
      a: (a.relations || []).map((r) => `${r.type}→${r.to}`).join("; ") || "—",
      b: (b.relations || []).map((r) => `${r.type}→${r.to}`).join("; ") || "—",
    },
  ];
  return { a: a.id, b: b.id, rows, provenance: PROVENANCE.KB };
}

/**
 * Adapter LLM reale (OpenAI-compatible). NON finge:
 * - richiede piano ULTRA + OPENAI_API_KEY;
 * - inietta SOLO contesto KB + istruzioni anti-allucinazione;
 * - ritorna testo marcato come INFERENCE con citazioni KB.
 */
export async function answerWithLLM({ plan, nodes, question, fetchImpl = fetch }) {
  if (!canUseAdvancedAI(plan)) {
    throw new Error("AI avanzata richiede il piano ULTRA.");
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      ...answerGrounded(nodes, question),
      note: "LLM non configurato (OPENAI_API_KEY assente): risposta estrattiva locale.",
      provenance: PROVENANCE.KB,
    };
  }
  const ctx = retrieve(nodes, question, 5)
    .map((n) => `### ${n.id} — ${n.title}\n${n.summary || ""}\n${n.explanations?.approfondita || ""}`.slice(0, 1500))
    .join("\n\n");
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const res = await fetchImpl(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Sei un tutor didattico. Usa SOLO il contesto fornito per i fatti; " +
            "distingui fatti KB, inferenze e dati non verificati; " +
            "se il contesto non basta, dichiara che il dato non è verificato invece di inventarlo. " +
            "Cita sempre gli id dei nodi usati.",
        },
        { role: "user", content: `CONTESTO KB:\n${ctx}\n\nDOMANDA: ${question}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return { answer: text, citations: retrieve(nodes, question, 5).map((n) => n.id), provenance: PROVENANCE.INFERENCE };
}
