/**
 * Server minimale zero-dipendenze: serve la web-app statica + API con
 * gate entitlement SERVER-SIDE. Il client free non riceve mai il corpus premium.
 *
 * Autenticazione/pagamenti REALI: non implementati qui (nessun fake login).
 * Il server accetta un'entitlement VERIFICATA dal futuro livello auth tramite
 * header `x-plan` SOLO in sviluppo locale; in produzione questo valore deve
 * provenire da sessione/JWT verificato (vedi docs/API_CONTRACT.md).
 *
 * Endpoints:
 *   GET  /api/subjects
 *   GET  /api/subjects/:subject            (subject.json + lista id, NON i contenuti)
 *   GET  /api/nodes/:id                    (singolo nodo, 403 se non entitled)
 *   GET  /api/children?parent=<id>         (figli entitled, metadati+contenuto se entitled)
 *   GET  /api/search?q=..&subject=..       (solo nodi entitled al piano)
 *   POST /api/ai/ask                       ({question, nodeIds?} retrieval grounded)
 *   POST /api/ai/compose                   ({title, format} composizione per livello)
 *   GET  /api/progress                     (progresso di studio per utente anonimo)
 *   POST /api/progress                     ({type:"studied"|"quiz", nodeId, score?})
 *   POST /api/print                        ({nodeId, scope} job con watermark, audit log)
 *
 * Avvio: node src/server/server.mjs  (PORT / CONTENT_ROOT da env)
 * @module server/server
 */
import { createServer } from "node:http";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadSubject, listNodeIds, loadNode, childrenOf, loadNodes } from "../engine/graph.mjs";
import { searchNodes } from "../engine/search.mjs";
import { normalizePlan, filterVisible, requireAccess, EntitlementError, canUseAdvancedAI } from "../engine/entitlements.mjs";
import { answerGrounded, answerWithLLM } from "../ai/grounding.mjs";
import { composeSection, toMarkdown, resolveSection, FORMATS } from "../ai/compose.mjs";
import { buildPrintJob, auditLine } from "../engine/print.mjs";
import { progressStore, sanitizeUserId } from "./progress.mjs";

const PORT = Number(process.env.PORT || 3000);
// CONTENT_ROOT: directory che contiene le cartelle di materia. Default: radice progetto.
const HERE = dirname(fileURLToPath(import.meta.url));
// CONTENT_ROOT: directory che contiene le cartelle di materia. Default: radice progetto.
const ROOT = process.env.CONTENT_ROOT || join(HERE, "..", "..");
const CONTENT_ROOT = existsSync(join(ROOT, "filosofia")) ? ROOT : ROOT;
const PUBLIC = join(HERE, "..", "..", "public");
const DATA = join(ROOT, "data");
const progress = progressStore(DATA);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function planOf(req, url) {
  // SVILUPPO: ?plan= o x-plan. PRODUZIONE: sostituire con JWT di sessione verificato.
  const h = req.headers["x-plan"];
  const q = url.searchParams.get("plan");
  return normalizePlan(h || q || "free");
}

function userIdOf(req, url) {
  // ANONIMO/LOCALE: id generato dal client (mai usato come autenticazione).
  // Produzione: sostituire con l'id di sessione verificato dal livello auth.
  return sanitizeUserId(req.headers["x-user"] || url.searchParams.get("user")) || "local-user";
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  // I Buffer passano intatti: i file binari (png) non devono fare toString().
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(data);
}

async function readBody(req) {
  let s = "";
  for await (const c of req) s += c;
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

async function discoverSubjects() {
  // Materie = sottocartelle con subject.json
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(CONTENT_ROOT, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (["src", "public", "scripts", "tests", "docs", "node_modules", "data"].includes(e.name)) continue;
    try {
      const s = await loadSubject(CONTENT_ROOT, e.name);
      out.push({ subject: s.subject, title: s.title, description: s.description });
    } catch {
      /* cartella non-materia: ignora */
    }
  }
  return out.sort((a, b) => a.subject.localeCompare(b.subject));
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const plan = planOf(req, url);

      // ---- statici ----
      if (!url.pathname.startsWith("/api/")) {
        const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1).split("?")[0];
        if (file.includes("..")) return send(res, 400, { error: "bad path" });
        try {
          const data = await readFile(join(PUBLIC, file));
          return send(res, 200, data, MIME[extname(file)] || "application/octet-stream");
        } catch {
          return send(res, 404, { error: "not found" });
        }
      }

      // ---- API ----
      if (req.method === "GET" && url.pathname === "/api/subjects") {
        return send(res, 200, { subjects: await discoverSubjects(), plan });
      }

      let m = /^\/api\/subjects\/([a-z0-9-]+)$/.exec(url.pathname);
      if (req.method === "GET" && m) {
        const subject = await loadSubject(CONTENT_ROOT, m[1]);
        const ids = await listNodeIds(CONTENT_ROOT, m[1]);
        // Di proposito: solo metadati + id. I contenuti si caricano per-nodo con gate.
        const nodes = await loadNodes(CONTENT_ROOT, ids, 5000);
        const published = nodes.filter((n) => n.status === "published");
        const visible = filterVisible(plan, published);
        const visibleIds = new Set(visible.map((n) => n.id));
        return send(res, 200, {
          subject: { subject: subject.subject, title: subject.title, description: subject.description, areas: subject.areas },
          // Piano corrente: nodi entitled completi nell'albero (solo metadati qui);
          // nodi premium: SOLO titolo+lock (nessun testo/summary/keyword esposti).
          tree: published.map((n) =>
            visibleIds.has(n.id)
              ? { id: n.id, title: n.title, parent: n.parent, type: n.type, order: n.order }
              : { id: n.id, title: n.title, parent: n.parent, type: n.type, order: n.order, locked: true, required: n.access }
          ),
          total: ids.length,
          visible: visible.length,
          plan,
        });
      }

      m = /^\/api\/nodes\/(.+)$/.exec(url.pathname);
      if (req.method === "GET" && m) {
        const node = await loadNode(CONTENT_ROOT, decodeURIComponent(m[1]));
        if (!node) return send(res, 404, { error: "node not found" });
        try {
          requireAccess(plan, node);
        } catch (e) {
          if (e instanceof EntitlementError) return send(res, 403, { error: "forbidden", required: node.access, plan });
          throw e;
        }
        return send(res, 200, { node, plan });
      }

      if (req.method === "GET" && url.pathname === "/api/children") {
        const parent = url.searchParams.get("parent");
        const node = await loadNode(CONTENT_ROOT, parent);
        if (!node) return send(res, 404, { error: "parent not found" });
        try {
          requireAccess(plan, node);
        } catch {
          return send(res, 403, { error: "forbidden", plan });
        }
        // Figli: serviamo i metadati di tutti i figli entitled; il contenuto resta nel singolo nodo.
        const ids = await listNodeIds(CONTENT_ROOT, node.subject);
        const all = await loadNodes(CONTENT_ROOT, ids, 5000);
        const kids = childrenOf(all, parent).filter((k) => {
          try {
            requireAccess(plan, k);
            return true;
          } catch {
            return false;
          }
        });
        return send(res, 200, { parent, children: kids, plan });
      }

      if (req.method === "GET" && url.pathname === "/api/search") {
        const q = url.searchParams.get("q") || "";
        const subject = url.searchParams.get("subject") || undefined;
        // Indicizza solo nodi entitled (mai esporre snippet premium a piani free)
        const subjects = subject ? [subject] : (await discoverSubjects()).map((s) => s.subject);
        let corpus = [];
        for (const s of subjects) {
          const ids = await listNodeIds(CONTENT_ROOT, s);
          const nodes = await loadNodes(CONTENT_ROOT, ids, 5000);
          corpus.push(...filterVisible(plan, nodes));
        }
        const hits = searchNodes(corpus, q, { subject, limit: 25 }).map((h) => ({
          id: h.node.id,
          title: h.node.title,
          subject: h.node.subject,
          type: h.node.type,
          score: h.score,
          snippet: (h.node.summary || "").slice(0, 200),
        }));
        return send(res, 200, { q, hits, plan });
      }

      if (req.method === "POST" && url.pathname === "/api/ai/ask") {
        const body = await readBody(req);
        const question = String(body.question || "");
        const wantLLM = Boolean(body.llm);
        let corpus = [];
        if (Array.isArray(body.nodeIds) && body.nodeIds.length) {
          const nodes = await loadNodes(CONTENT_ROOT, body.nodeIds.slice(0, 8), 8);
          corpus = filterVisible(plan, nodes);
        } else {
          const subjects = (await discoverSubjects()).map((s) => s.subject);
          for (const s of subjects) {
            const ids = await listNodeIds(CONTENT_ROOT, s);
            corpus.push(...filterVisible(plan, await loadNodes(CONTENT_ROOT, ids, 5000)));
          }
        }
        if (wantLLM) {
          if (!canUseAdvancedAI(plan)) return send(res, 403, { error: "L'AI avanzata richiede il piano ULTRA." });
          const out = await answerWithLLM({ plan, nodes: corpus, question });
          return send(res, 200, out);
        }
        return send(res, 200, answerGrounded(corpus, question));
      }

      // Laboratorio: dal titolo di una sezione a un contenuto composto.
      // Il corpus è filtrato per entitlement: un piano free non riceve MAI
      // il testo premium, solo l'eventuale rifiuto con i candidati (solo id).
      if (req.method === "POST" && url.pathname === "/api/ai/compose") {
        const body = await readBody(req);
        const wantMd = body.markdown === true;
        const subjects = body.subject
          ? [String(body.subject)]
          : (await discoverSubjects()).map((s) => s.subject);
        let corpus = [];
        let allNodes = [];
        for (const s of subjects) {
          const ids = await listNodeIds(CONTENT_ROOT, s);
          const nodes = await loadNodes(CONTENT_ROOT, ids, 5000);
          allNodes.push(...nodes);
          corpus.push(...filterVisible(plan, nodes));
        }
        const out = composeSection(corpus, {
          title: body.title,
          subject: body.subject ? String(body.subject) : undefined,
          format: body.format,
        });
        // Se il titolo ESISTE ma è premium: lo diciamo (solo metadati + piano
        // richiesto). Il testo non lascia mai il server. È l'unico modo onesto
        // per distinguere "non esiste" da "serve un piano superiore".
        if (!out.ok && out.reason === "no-match" && String(body.title || "").trim()) {
          try {
            const visibleIds = new Set(corpus.map((n) => n.id));
            const { matched } = resolveSection(allNodes, body.title, {
              subject: body.subject ? String(body.subject) : undefined,
            });
            const locked = matched
              .filter((m) => !visibleIds.has(m.node.id))
              .map((m) => ({
                id: m.node.id,
                title: m.node.title,
                subject: m.node.subject,
                required: m.node.access,
                score: Math.round(m.score * 100) / 100,
              }));
            if (locked.length) {
              out.locked = locked;
              out.message =
                "Questa sezione esiste nel corpus ma richiede un piano superiore. " +
                "Il testo non viene inviato dal server: cambia piano per leggerlo.";
            }
          } catch {
            /* la diagnosi del lock è best-effort: il rifiuto resta valido */
          }
        }
        // I candidati di un rifiuto restano metadati: id+titolo+score, mai il testo.
        const payload = {
          ...out,
          formats: FORMATS,
          corpusSize: corpus.length,
          markdown: wantMd && out.ok ? toMarkdown(out) : undefined,
          plan,
        };
        return send(res, 200, payload);
      }

      // Progresso di studio: persistenza lato server, un file JSON per utente
      // anonimo. Il contenuto dei nodi premium resta fuori da questo percorso.
      if (req.method === "GET" && url.pathname === "/api/progress") {
        const userId = userIdOf(req, url);
        const { progress: p, summary } = await progress.get(userId);
        const due = await progress.due(userId);
        // Risolvi i titoli dei nodi da ripassare (solo nodi entitled: un id
        // di un nodo premium non deve neanche rivelarne il titolo al piano free).
        const dueTitled = [];
        for (const d of due) {
          const n = await loadNode(CONTENT_ROOT, d.id);
          if (!n) continue;
          try {
            requireAccess(plan, n);
          } catch {
            continue;
          }
          dueTitled.push({ ...d, title: n.title, subject: n.subject });
        }
        return send(res, 200, { userId, progress: p, summary, due: dueTitled, plan });
      }

      if (req.method === "POST" && url.pathname === "/api/progress") {
        const userId = userIdOf(req, url);
        const body = await readBody(req);
        const nodeId = String(body.nodeId || "");
        if (!nodeId) return send(res, 400, { error: "nodeId richiesto" });
        const node = await loadNode(CONTENT_ROOT, nodeId);
        if (!node) return send(res, 404, { error: "node not found" });
        try {
          requireAccess(plan, node);
        } catch {
          return send(res, 403, { error: "forbidden", plan });
        }
        if (body.type === "studied") {
          const { progress: p, summary } = await progress.studied(userId, nodeId);
          return send(res, 200, { ok: true, userId, progress: p, summary, plan });
        }
        if (body.type === "quiz") {
          const score = Math.max(0, Math.min(1, Number(body.score) || 0));
          const out = await progress.quiz(userId, nodeId, score);
          return send(res, 200, { ok: true, userId, ...out, plan });
        }
        return send(res, 400, { error: "type deve essere studied o quiz" });
      }

      if (req.method === "POST" && url.pathname === "/api/print") {
        const body = await readBody(req);
        const node = await loadNode(CONTENT_ROOT, body.nodeId);
        if (!node) return send(res, 404, { error: "node not found" });
        try {
          requireAccess(plan, node);
        } catch {
          return send(res, 403, { error: "forbidden", plan });
        }
        if (plan === "free") return send(res, 403, { error: "La stampa richiede almeno il piano PRO." });
        const userId = String(req.headers["x-user"] || "local-user");
        const job = buildPrintJob({ plan, userId }, node, { scope: body.scope || "node" });
        try {
          await mkdir(join(ROOT, "data"), { recursive: true });
          await appendFile(join(ROOT, "data", "print-audit.log"), auditLine(job) + "\n");
        } catch {
          /* audit best-effort in locale */
        }
        return send(res, 200, { job, node });
      }

      return send(res, 404, { error: "unknown endpoint" });
    } catch (e) {
      return send(res, 500, { error: String(e?.message || e) });
    }
  });
}

if (process.argv[1] && process.argv[1].endsWith("server.mjs")) {
  createApp().listen(PORT, () => console.log(`Mappe didattiche su http://localhost:${PORT} (contentRoot=${CONTENT_ROOT})`));
}
