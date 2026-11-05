/** Test integrità contenuti: ogni nodo published rispetta il modello. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["src", "public", "scripts", "tests", "docs", "node_modules", "data", ".git"]);

async function allNodes() {
  const out = [];
  for (const e of await readdir(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
    const dir = join(ROOT, e.name, "nodes");
    if (!existsSync(dir)) continue;
    for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
      out.push(JSON.parse(await readFile(join(dir, f), "utf8")));
    }
  }
  return out;
}

describe("content model", () => {
  it("ogni published ha id/titolo/summary/spiegazioni/version/date", async () => {
    for (const n of (await allNodes()).filter((n) => n.status === "published")) {
      assert.match(n.id, /^[a-z0-9-]+:[a-z0-9][a-z0-9\-/]*$/, n.id);
      assert.ok(n.title?.length >= 3, n.id);
      assert.ok(n.summary?.length >= 40, `${n.id} summary corta`);
      assert.ok(n.explanations?.semplice && n.explanations?.approfondita, `${n.id} spiegazioni`);
      assert.ok(!JSON.stringify(n).toLowerCase().includes("lorem ipsum"), `${n.id} placeholder`);
      assert.ok(Number(n.version) >= 1 && !Number.isNaN(Date.parse(n.updatedAt)), n.id);
    }
  });

  it("fonti con verificationStatus coerente; claims puntano a fonti del nodo", async () => {
    const { SOURCE_VERIFICATION, LEVELS } = await import("../src/model/types.mjs");
    for (const n of (await allNodes()).filter((n) => ["published", "reviewed"].includes(n.status))) {
      const ids = new Set((n.sources || []).map((s) => s.id));
      for (const s of n.sources || []) {
        assert.ok(SOURCE_VERIFICATION.includes(s.verificationStatus), `${n.id} fonte ${s.id}`);
        assert.equal(s.verified === true, s.verificationStatus === "content_reviewed", `${n.id} fonte ${s.id}`);
      }
      for (const c of n.claims || []) {
        assert.ok(c.statement?.length >= 20, `${n.id} claim corta`);
        for (const sid of c.supportedBy) assert.ok(ids.has(sid), `${n.id} claim→${sid}`);
      }
      if (n.level) assert.ok(LEVELS.includes(n.level), n.id);
    }
  });
  it("quiz con answer in range e scelte >= 2", async () => {
    for (const n of await allNodes()) {
      for (const q of n.learning?.quiz || []) {
        assert.ok(q.choices.length >= 2, n.id);
        assert.ok(q.answer >= 0 && q.answer < q.choices.length, `${n.id} answer range`);
      }
    }
  });

  it("nessuna relazione verso id malformati", async () => {
    for (const n of await allNodes()) {
      for (const r of n.relations || []) assert.match(String(r.to), /^[a-z0-9-]+:/, `${n.id} -> ${r.to}`);
    }
  });
});
