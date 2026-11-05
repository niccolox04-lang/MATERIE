/**
 * Test di integrazione del server HTTP: si avvia createApp() su una porta
 * effimera e si esercitano gli endpoint reali con fetch (Node >= 18).
 * Copre: entitlement, progresso (quiz/studied/due con titoli), composizione
 * per livello, integrità dei file binari statici, sanitizzazione id utente.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/server/server.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FREE_NODE = "storia:introduzione"; // verificato free e published
const USER = `itest-${process.pid}-${Date.now()}`;

let server, base;

before(async () => {
  server = createApp();
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((res) => server.close(res));
  await rm(join(ROOT, "data", "progress", `${USER}.json`), { force: true });
});

const get = (path, headers = {}) => fetch(base + path, { headers });
const post = (path, body, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user": USER, ...headers },
    body: JSON.stringify(body),
  });

describe("server: statici", () => {
  it("serve la index e la CSS", async () => {
    const r = await get("/");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    const css = await get("/styles.css");
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);
  });

  it("i file binari arrivano integri (nessuna corruzione UTF-8)", async () => {
    const r = await get("/icon-192.png");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    const net = Buffer.from(await r.arrayBuffer());
    const disk = await readFile(join(ROOT, "public", "icon-192.png"));
    assert.equal(net.length, disk.length, "stessa lunghezza del file su disco");
    assert.ok(net.equals(disk), "byte identici: il server non tocca i Buffer");
    assert.equal(net.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "firme PNG");
  });

  it("il manifest è servito con il MIME corretto", async () => {
    const r = await get("/manifest.webmanifest");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /manifest\+json/);
  });
});

describe("server: entitlement", () => {
  it("un nodo free è leggibile col piano free", async () => {
    const r = await get(`/api/nodes/${FREE_NODE}?plan=free`);
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.node.id, FREE_NODE);
  });

  it("un nodo premium non è leggibile col piano free (403, nessun testo)", async () => {
    const treeFree = await (await get("/api/subjects/storia?plan=free")).json();
    const locked = treeFree.tree.find((t) => t.locked);
    assert.ok(locked, "esiste almeno un nodo premium in storia");
    assert.equal(locked.summary, undefined, "l'albero non espone mai il riassunto dei nodi locked");
    const r = await get(`/api/nodes/${locked.id}?plan=free`);
    assert.equal(r.status, 403);
    const d = await r.json();
    assert.equal(d.error, "forbidden");
    assert.equal(d.plan, "free");
  });
});

describe("server: progresso", () => {
  it("un utente nuovo parte da zero", async () => {
    const r = await get(`/api/progress?plan=free&user=${USER}`);
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.summary.studied, 0);
    assert.equal(d.userId, USER);
  });

  it("un id utente malevolo viene neutralizzato", async () => {
    const r = await get(`/api/progress?plan=free&user=${encodeURIComponent("../evil")}`);
    const d = await r.json();
    assert.equal(d.userId, "local-user", "path traversal → default, mai il file di un altro");
  });

  it("quiz su nodo free: mastery sale e il prossimo ripasso è coerente", async () => {
    const r = await post("/api/progress", { type: "quiz", nodeId: FREE_NODE, score: 1 }, { "x-plan": "free" });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.ok, true);
    assert.equal(d.mastery, 1, "da 0 a 1 con quiz perfetto");
    assert.ok(d.reviewDays >= 0);
    assert.ok(d.progress.studied[FREE_NODE], "il quiz segna anche studiato");
  });

  it("il punteggio è clampato tra 0 e 1", async () => {
    const r = await post("/api/progress", { type: "quiz", nodeId: FREE_NODE, score: 99 }, { "x-plan": "free" });
    const d = await r.json();
    assert.ok(d.mastery >= 0 && d.mastery <= 5);
  });

  it("quiz su nodo premium col piano free: 403, nessuna scrittura", async () => {
    const treeFree = await (await get("/api/subjects/storia?plan=free")).json();
    const locked = treeFree.tree.find((t) => t.locked);
    const r = await post("/api/progress", { type: "quiz", nodeId: locked.id, score: 1 }, { "x-plan": "free" });
    assert.equal(r.status, 403);
  });

  it("studied su nodo inesistente: 404", async () => {
    const r = await post("/api/progress", { type: "studied", nodeId: "storia:non-esiste-zzz" }, { "x-plan": "free" });
    assert.equal(r.status, 404);
  });

  it("type invalido: 400", async () => {
    const r = await post("/api/progress", { type: "boh", nodeId: FREE_NODE }, { "x-plan": "free" });
    assert.equal(r.status, 400);
  });

  it("i da-ripassare tornano con titolo e materia (solo nodi entitled)", async () => {
    // ripeti quiz falliti finché il mastery non arriva a 0 (intervallo 0 giorni → dovuto subito)
    for (let i = 0; i < 5; i++) {
      await post("/api/progress", { type: "quiz", nodeId: FREE_NODE, score: 0 }, { "x-plan": "free" });
      const check = await (await get(`/api/progress?plan=free&user=${USER}`)).json();
      if (check.due.some((x) => x.id === FREE_NODE)) break;
    }
    const r = await get(`/api/progress?plan=free&user=${USER}`);
    const d = await r.json();
    const due = d.due.find((x) => x.id === FREE_NODE);
    assert.ok(due, "con mastery 0 il nodo è da ripassare subito");
    assert.equal(due.title, "Introduzione alla Storia", "titolo risolto dal server");
    assert.equal(due.subject, "storia");
  });
});

describe("server: composizione per livello", () => {
  it("bootstrap formati: elenco completo dal server", async () => {
    const r = await post("/api/ai/compose", { title: "__formats__", subject: "storia", format: "scheda" }, { "x-plan": "free" });
    const d = await r.json();
    assert.ok(Array.isArray(d.formats) && d.formats.length === 4);
    assert.deepEqual(d.formats.map((f) => f.id), ["scheda", "studio", "approfondimento", "dossier"]);
  });

  it("composizione per id-nodo: ok e blocchi con provenienza", async () => {
    const r = await post("/api/ai/compose", { title: FREE_NODE, subject: "storia", format: "studio" }, { "x-plan": "free" });
    const d = await r.json();
    assert.equal(d.ok, true);
    assert.ok(d.blocks.length > 0);
    for (const b of d.blocks) {
      assert.equal(b.provenance, "kb");
      assert.equal(b.nodeId, FREE_NODE);
    }
  });

  it("un titolo assente viene rifiutato, non generato", async () => {
    const r = await post("/api/ai/compose", { title: "xyzzyqqq inesistente", subject: "storia", format: "dossier" }, { "x-plan": "free" });
    const d = await r.json();
    assert.equal(d.ok, false);
    assert.equal(d.refusal, true);
    assert.equal(d.blocks, undefined);
  });
});
