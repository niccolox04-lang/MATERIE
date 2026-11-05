/** Test grafo: referenze, cicli, breadcrumb, search, AI grounded. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { adjacency, breadcrumbs, findOrderingCycles, learningPath } from "../src/engine/graph.mjs";
import { searchNodes } from "../src/engine/search.mjs";
import { answerGrounded, makeQuestions, compareNodes } from "../src/ai/grounding.mjs";
import { gradeQuiz, updateMastery, nextReview } from "../src/engine/learning.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["src", "public", "scripts", "tests", "docs", "node_modules", "data", ".git"]);

async function published() {
  const out = [];
  for (const e of await readdir(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
    const dir = join(ROOT, e.name, "nodes");
    if (!existsSync(dir)) continue;
    for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
      const n = JSON.parse(await readFile(join(dir, f), "utf8"));
      if (n.status === "published") out.push(n);
    }
  }
  return out;
}

describe("graph", () => {
  it("parent e relazioni puntano a nodi esistenti", async () => {
    const nodes = await published();
    const ids = new Set(nodes.map((n) => n.id));
    // planned referenziabili: includi anche quelli
    for (const e of await readdir(ROOT, { withFileTypes: true })) {
      if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
      const dir = join(ROOT, e.name, "nodes");
      if (!existsSync(dir)) continue;
      for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
        const n = JSON.parse(await readFile(join(dir, f), "utf8"));
        ids.add(n.id);
      }
    }
    for (const n of nodes) {
      if (n.parent) assert.ok(ids.has(n.parent), `${n.id} parent ${n.parent}`);
      for (const r of n.relations || []) assert.ok(ids.has(r.to), `${n.id} -> ${r.to}`);
      for (const p of n.prerequisites || []) assert.ok(ids.has(p), `${n.id} prereq ${p}`);
    }
  });

  it("nessun ciclo PREREQUISITE/PART_OF", async () => {
    const cycles = findOrderingCycles(await published());
    assert.deepEqual(cycles, [], JSON.stringify(cycles));
  });

  it("breadcrumbs risalgono al padre", async () => {
    const nodes = await published();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const leaf = nodes.find((n) => n.id === "filosofia:platone-anima");
    assert.ok(leaf);
    const trail = breadcrumbs(byId, leaf).map((n) => n.id);
    assert.ok(trail.includes("filosofia:platone"), trail.join(">"));
  });

  it("learningPath: prerequisiti a monte reali", async () => {
    const nodes = await published();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const lp = learningPath(byId, adjacency(nodes), "filosofia:platone-teoria-idee");
    assert.ok(lp.start.some((n) => n.id === "filosofia:socrate"));
  });

  it("search trova Platone e rispetta subject", async () => {
    const nodes = await published();
    const hits = searchNodes(nodes, "anamnesi");
    assert.ok(hits.some((h) => h.node.id === "filosofia:platone-anamnesi"));
    const onlyStoria = searchNodes(nodes, "fonti", { subject: "storia" });
    assert.ok(onlyStoria.every((h) => h.node.subject === "storia"));
  });

  it("AI grounded cita nodi reali o rifiuta onestamente", async () => {
    const nodes = await published();
    const ok = answerGrounded(nodes, "anamnesi");
    assert.ok(!ok.refusal && ok.citations.length > 0);
    const ko = answerGrounded(nodes, "xqzwrtkbl inutile");
    assert.equal(ko.refusal, true);
    assert.deepEqual(ko.citations, []);
  });

  it("compare/questions/grade/mastery funzionano", async () => {
    const nodes = await published();
    const a = nodes.find((n) => n.id === "filosofia:socrate");
    const b = nodes.find((n) => n.id === "filosofia:platone");
    const cmp = compareNodes(a, b);
    assert.equal(cmp.rows.length, 3);
    assert.ok(makeQuestions(a).length > 0);
    const g = gradeQuiz([{ q: "x", choices: ["a", "b"], answer: 1 }], [1]);
    assert.equal(g.score, 1);
    assert.equal(updateMastery(2, 1), 3);
    assert.equal(nextReview(5), 35);
  });
});
