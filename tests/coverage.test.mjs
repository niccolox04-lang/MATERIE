/** Test coverage: unità (non nodi), readiness derivata, divieto di complete prematuro. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  computeAreaCoverage,
  computeReadiness,
  criticalGaps,
  unitScore,
} from "../src/engine/coverage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["src", "public", "scripts", "tests", "docs", "node_modules", "data", ".git"]);

async function loadSubject(subject) {
  const cov = JSON.parse(await readFile(join(ROOT, subject, "coverage.json"), "utf8"));
  const nodeById = new Map();
  const dir = join(ROOT, subject, "nodes");
  if (existsSync(dir)) {
    for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
      const n = JSON.parse(await readFile(join(dir, f), "utf8"));
      nodeById.set(n.id, n);
    }
  }
  return { cov, nodeById };
}

describe("coverage", () => {
  it("ogni materia ha coverage.json coerente e unità senza nodeId dangling", async () => {
    for (const e of await readdir(ROOT, { withFileTypes: true })) {
      if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
      const { cov, nodeById } = await loadSubject(e.name);
      assert.ok(cov.curriculumScope.length >= 20, e.name);
      for (const a of cov.macroAreas) {
        for (const u of a.units) {
          if (u.nodeId) assert.ok(nodeById.has(u.nodeId), `${e.name}: ${u.id} → ${u.nodeId} dangling`);
        }
      }
    }
  });

  it("nessuna materia è complete (divieto premature complete)", async () => {
    for (const s of ["storia", "greco", "latino", "matematica", "fisica", "filosofia"]) {
      const { cov, nodeById } = await loadSubject(s);
      const { readiness } = computeReadiness(cov, nodeById, { qualityGate: true, prereqsCoherent: true });
      assert.notEqual(readiness, "complete", `${s} marcata complete con lacune CORE`);
    }
  });

  it("complete è raggiungibile in linea di principio (fixture), ma non senza gate", async () => {
    const { computeReadiness: cr } = await import("../src/engine/coverage.mjs");
    const matrix = {
      macroAreas: [{ id: "a", title: "A", importance: "core", units: [{ id: "u1", title: "U1", tier: "foundational", nodeId: "s:u1", contentDepth: "deep" }] }],
    };
    const byId = new Map([["s:u1", { status: "published", sources: [{ verificationStatus: "content_reviewed" }] }]]);
    assert.equal(cr(matrix, byId, { qualityGate: true, prereqsCoherent: true }).readiness, "complete");
    assert.notEqual(cr(matrix, byId, { qualityGate: false, prereqsCoherent: true }).readiness, "complete");
    assert.notEqual(cr(matrix, byId, { qualityGate: true, prereqsCoherent: false }).readiness, "complete");
  });

  it("complete richiede qualityGate: senza, resta non-complete", async () => {
    const { cov, nodeById } = await loadSubject("filosofia");
    const bad = computeReadiness(cov, nodeById, { qualityGate: false, prereqsCoherent: true });
    assert.notEqual(bad.readiness, "complete");
  });

  it("unitScore: published 1, draft 0.4, assente 0", () => {
    const byId = new Map([
      ["a", { status: "published" }],
      ["b", { status: "draft" }],
    ]);
    assert.equal(unitScore(byId, { nodeId: "a" }), 1);
    assert.equal(unitScore(byId, { nodeId: "b" }), 0.4);
    assert.equal(unitScore(byId, { nodeId: "zz" }), 0);
    assert.equal(unitScore(byId, {}), 0);
  });

  it("area fully_covered solo al 100%, verified solo con backing", () => {
    const full = { units: [{ id: "u1", nodeId: "a" }] };
    const byId = new Map([["a", { status: "published", sources: [{ verificationStatus: "content_reviewed" }] }]]);
    assert.equal(computeAreaCoverage(full, byId).status, "verified");
    const unbacked = new Map([["a", { status: "published", sources: [{ verificationStatus: "reachable" }] }]]);
    assert.equal(computeAreaCoverage(full, unbacked).status, "fully_covered");
    const partial = { units: [{ id: "u1", nodeId: "a" }, { id: "u2", nodeId: null }, { id: "u3", nodeId: "a" }] };
    assert.equal(computeAreaCoverage(partial, byId).status, "substantially_covered"); // 66.7%
    const low = { units: [{ id: "u1", nodeId: "a" }, { id: "u2", nodeId: null }] };
    assert.equal(computeAreaCoverage(low, byId).status, "partially_covered"); // 50%
  });
});
