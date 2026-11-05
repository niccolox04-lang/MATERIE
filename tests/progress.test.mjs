/**
 * Test dello store di progresso: persistenza su file, mastery secondo le
 * regole pure di engine/learning.mjs, sanitizzazione dell'id utente.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { progressStore, sanitizeUserId, summarize } from "../src/server/progress.mjs";
import { nextReview } from "../src/engine/learning.mjs";

const dir = await mkdtemp(join(tmpdir(), "md-progress-"));
const store = progressStore(dir);

after(async () => rm(dir, { recursive: true, force: true }));

describe("progress: sanitizzazione id utente", () => {
  it("accetta id alfanumerici semplici", () => {
    assert.equal(sanitizeUserId("anon-abc123"), "anon-abc123");
    assert.equal(sanitizeUserId("Local_User"), "Local_User");
  });

  it("rifiuta path traversal e caratteri pericolosi", () => {
    assert.equal(sanitizeUserId("../etc/passwd"), null);
    assert.equal(sanitizeUserId("a/b"), null);
    assert.equal(sanitizeUserId("a\\b"), null);
    assert.equal(sanitizeUserId(""), null);
    assert.equal(sanitizeUserId(null), null);
    assert.equal(sanitizeUserId("x".repeat(65)), null);
  });
});

describe("progress: persistenza", () => {
  it("un utente nuovo parte con progresso vuoto", async () => {
    const { progress, summary } = await store.get("u-new");
    assert.deepEqual(progress.studied, {});
    assert.equal(summary.studied, 0);
    assert.equal(summary.due, 0);
  });

  it("mark studied registra il nodo e lo conta", async () => {
    const { progress, summary } = await store.studied("u-new", "storia:shoah");
    assert.ok(progress.studied["storia:shoah"], "il nodo deve essere marcato studiato");
    assert.equal(summary.studied, 1);
    // la persistenza su file deve sopravvivere a una nuova lettura
    const again = await store.get("u-new");
    assert.ok(again.progress.studied["storia:shoah"], "lo stato deve essere su disco");
  });

  it("il quiz aggiorna il padroneggiamento secondo le regole di learning.mjs", async () => {
    const before = await store.get("u-quiz");
    const prev = before.progress.mastery["storia:shoah"] || 0;
    const out = await store.quiz("u-quiz", "storia:shoah", 1);
    assert.equal(out.mastery, Math.min(5, prev + 1), "mastery cresce di 1 con quiz perfetto");
    // un quiz fallito decrementa
    const down = await store.quiz("u-quiz", "storia:shoah", 0);
    assert.ok(down.mastery <= out.mastery, "un quiz fallito non aumenta il mastery");
  });

  it("il punteggio è clampato tra 0 e 1 lato server", async () => {
    const out = await store.quiz("u-clamp", "storia:shoah", 17);
    assert.ok(out.mastery >= 0 && out.mastery <= 5, "mastery entro i limiti");
  });

  it("il prossimo dipende dal mastery secondo la tabella SM-2-like", async () => {
    const out = await store.quiz("u-review", "storia:shoah", 1);
    assert.equal(out.reviewDays, nextReview(out.mastery));
  });

  it("riepilogo: media mastery e nodi da ripassare", async () => {
    await store.quiz("u-sum", "storia:shoah", 1);
    await store.quiz("u-sum", "storia:atene-classica", 1);
    const { summary } = await store.get("u-sum");
    const due = await store.due("u-sum");
    assert.equal(summary.studied, 2, "entrambi i nodi risultano studiati");
    assert.ok(summary.avgMastery > 0, "la media mastery è calcolata sui nodi esistenti");
    assert.ok(Array.isArray(due), "due restituisce una lista");
  });
});

describe("progress: summarize", () => {
  it("su uno stato vuoto non inventa numeri", () => {
    const s = summarize({ studied: {}, mastery: {}, reviews: {}, streak: { days: [] } });
    assert.equal(s.studied, 0);
    assert.equal(s.avgMastery, 0);
    assert.equal(s.due, 0);
    assert.equal(s.streak, 0);
  });

  it("conta la serie di giorni consecutivi solo se oggi è incluso", () => {
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const s = summarize({ studied: {}, mastery: {}, reviews: {}, streak: { days: [yest, today] } });
    assert.equal(s.streak, 2, "ieri + oggi = serie di 2");
  });
});
