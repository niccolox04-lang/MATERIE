/** Test entitlements centralizzati + premium leakage. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canAccess, filterVisible, requireAccess, EntitlementError, canPrint, canUseAdvancedAI } from "../src/engine/entitlements.mjs";

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

describe("entitlements", () => {
  it("gerarchia free < pro < ultra", () => {
    const pro = { id: "x", status: "published", access: "pro" };
    assert.equal(canAccess("free", pro), false);
    assert.equal(canAccess("pro", pro), true);
    assert.equal(canAccess("ultra", pro), true);
  });

  it("draft/planned/reviewed/deprecated mai serviti (solo published)", () => {
    for (const s of ["draft", "planned", "reviewed", "deprecated"])
      assert.equal(canAccess("ultra", { id: "x", status: s, access: "free" }), false);
  });

  it("requireAccess lancia 403", () => {
    assert.throws(() => requireAccess("free", { id: "x", status: "published", access: "pro" }), EntitlementError);
  });

  it("AI avanzata e stampa: ultra / almeno pro", () => {
    assert.equal(canUseAdvancedAI("pro"), false);
    assert.equal(canUseAdvancedAI("ultra"), true);
    assert.equal(canPrint("free", { id: "x", status: "published", access: "free" }), false);
    assert.equal(canPrint("pro", { id: "x", status: "published", access: "pro" }), true);
  });

  it("almeno un nodo pro esiste e non è visibile free (reale, non mock)", async () => {
    const nodes = await published();
    const premium = nodes.filter((n) => n.access !== "free");
    assert.ok(premium.length > 0, "atteso almeno un nodo premium reale");
    const freeIds = new Set(filterVisible("free", nodes).map((n) => n.id));
    for (const p of premium) assert.ok(!freeIds.has(p.id), `${p.id} visibile free!`);
  });

  it("nessun testo premium nel bundle free (premium leakage)", async () => {
    const nodes = await published();
    const freeTexts = filterVisible("free", nodes).map((n) => n.explanations?.approfondita || "").join("\n");
    for (const p of nodes.filter((n) => n.access !== "free")) {
      const probe = (p.explanations?.approfondita || "").slice(0, 80);
      if (probe.length > 60) assert.ok(!freeTexts.includes(probe.slice(0, 60)), `leak ${p.id}`);
    }
  });
});
