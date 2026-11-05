/**
 * Motore del knowledge graph: caricamento file-based, adiacenze, navigazione.
 * Progettato per lazy-loading: il client carica un nodo alla volta;
 * il server non invia mai l'intero corpus in una risposta.
 * @module engine/graph
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Legge subject.json di una materia. */
export async function loadSubject(contentRoot, subject) {
  const raw = await readFile(join(contentRoot, subject, "subject.json"), "utf8");
  return JSON.parse(raw);
}

/** Elenca gli id dei nodi di una materia (senza caricarne il contenuto). */
export async function listNodeIds(contentRoot, subject) {
  const dir = join(contentRoot, subject, "nodes");
  let files = [];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .map((slug) => `${subject}:${slug}`)
    .sort();
}

/** Carica un singolo nodo per id. Ritorna null se assente/malformato. */
export async function loadNode(contentRoot, id) {
  const m = /^([a-z0-9-]+):([a-z0-9][a-z0-9\-/]*)$/.exec(String(id || ""));
  if (!m) return null;
  const [, subject, slug] = m;
  // Protezione path traversal: lo slug validato sopra non contiene "." né "\"
  try {
    const raw = await readFile(join(contentRoot, subject, "nodes", `${slug}.json`), "utf8");
    const node = JSON.parse(raw);
    if (node.id !== id) return null;
    return node;
  } catch {
    return null;
  }
}

/** Carica più nodi (batch limitato, per evitare payload enormi). */
export async function loadNodes(contentRoot, ids, max = 50) {
  const out = [];
  for (const id of ids.slice(0, max)) {
    const n = await loadNode(contentRoot, id);
    if (n) out.push(n);
  }
  return out;
}

/** Figli diretti (per parent id). Richiede la lista dei nodi caricati. */
export function childrenOf(nodes, parentId) {
  return nodes
    .filter((n) => n.parent === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Breadcrumb dal nodo radice al nodo dato (segue catena parent). */
export function breadcrumbs(nodeById, node) {
  const trail = [];
  const seen = new Set();
  let cur = node;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift(cur);
    cur = cur.parent ? nodeById.get(cur.parent) : null;
  }
  return trail;
}

/** Mappa di adiacenza delle relazioni (solo tra nodi esistenti). */
export function adjacency(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const adj = new Map();
  for (const n of nodes) {
    const edges = [];
    for (const r of n.relations || []) {
      if (ids.has(r.to)) edges.push({ from: n.id, ...r });
    }
    adj.set(n.id, edges);
  }
  return adj;
}

/** Prerequisiti transitivi di un nodo (chiusura, protetta da cicli).
 * Considera sia il campo `prerequisites` sia le relazioni `PREREQUISITE`. */
export function transitivePrerequisites(nodeById, adj, startId, maxDepth = 20) {
  const found = [];
  const visited = new Set([startId]);
  const stack = [{ id: startId, depth: 0 }];
  const outEdges = (id) => {
    const viaRel = (adj.get(id) || []).filter((e) => e.type === "PREREQUISITE").map((e) => e.to);
    const viaField = nodeById.get(id)?.prerequisites || [];
    return [...new Set([...viaRel, ...viaField])];
  };
  while (stack.length) {
    const { id, depth } = stack.pop();
    if (depth >= maxDepth) continue;
    for (const to of outEdges(id)) {
      if (visited.has(to)) continue;
      visited.add(to);
      const target = nodeById.get(to);
      if (target) found.push(target);
      stack.push({ id: to, depth: depth + 1 });
    }
  }
  return found;
}

/** Rileva cicli PREREQUISITE/PART_OF (indesiderati nella gerarchia didattica). */
export function findOrderingCycles(nodes) {
  const adj = adjacency(nodes).size ? adjacency(nodes) : new Map();
  const orderAdj = new Map();
  for (const n of nodes) {
    const viaRel = (adj.get(n.id) || [])
      .filter((e) => e.type === "PREREQUISITE" || e.type === "PART_OF")
      .map((e) => e.to);
    // PART_OF punta di norma al padre: se punta al figlio è comunque un arco da controllare
    orderAdj.set(n.id, [...new Set([...viaRel, ...(n.prerequisites || [])])]);
  }
  const cycles = [];
  const color = new Map(); // 0=unvisited 1=in-stack 2=done
  const path = [];
  function dfs(u) {
    color.set(u, 1);
    path.push(u);
    for (const v of orderAdj.get(u) || []) {
      if (color.get(v) === 1) {
        cycles.push([...path.slice(path.indexOf(v)), v]);
      } else if (!color.get(v)) {
        dfs(v);
      }
    }
    path.pop();
    color.set(u, 2);
  }
  for (const n of nodes) if (!color.get(n.id)) dfs(n.id);
  return cycles;
}

/**
 * Learning path: prerequisiti (in ordine topologico semplificato) → nodo → sviluppi.
 * Ritorna {start:[...], current, next:[...]} con nodi reali, mai inventati.
 */
export function learningPath(nodeById, adj, nodeId) {
  const node = nodeById.get(nodeId);
  if (!node) return null;
  const prereqs = transitivePrerequisites(nodeById, adj, nodeId).reverse();
  const next = [];
  for (const [from, edges] of adj) {
    for (const e of edges) {
      if (e.to === nodeId && (e.type === "DEVELOPS_INTO" || e.type === "EFFECT")) {
        const n = nodeById.get(from);
        void n;
      }
    }
  }
  // "next" = nodi che dichiarano il corrente come prerequisito o che ne sono sviluppo
  for (const n of nodeById.values()) {
    const rels = adj.get(n.id) || [];
    if (rels.some((e) => e.to === nodeId && (e.type === "PREREQUISITE" || e.type === "PART_OF"))) {
      void 0; // il prerequisito è a monte, non a valle
    }
  }
  const downstream = [];
  for (const e of adj.get(nodeId) || []) {
    if (["DEVELOPS_INTO", "EFFECT", "APPLIES_TO", "EXAMPLE_OF"].includes(e.type)) {
      const t = nodeById.get(e.to);
      if (t) downstream.push(t);
    }
  }
  // Nodi che hanno il corrente come prerequisito (ricerca inversa)
  for (const n of nodeById.values()) {
    const edges = adj.get(n.id) || [];
    if (edges.some((e) => e.to === nodeId && e.type === "PREREQUISITE")) downstream.push(n);
  }
  return { start: prereqs, current: node, next: downstream };
}
