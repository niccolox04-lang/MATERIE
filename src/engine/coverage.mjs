/**
 * Coverage disciplinare: distingue NODE QUALITY (validate.mjs) da
 * SUBJECT COVERAGE (quanto del dominio è coperto) e SUBJECT READINESS
 * (la materia è utilizzabile come corpus?). La coverage si basa sulle
 * unità disciplinari di <materia>/coverage.json, MAI sul conteggio nodi.
 *
 * Soglie documentate (vedi docs/COVERAGE.md):
 * - area: 0 not_started | <25 outlined | <60 partially_covered |
 *   <100 substantially_covered | 100 fully_covered (+backing verificato = verified)
 * - readiness: foundation | developing | substantial | near_complete | complete
 * - complete richiede: TUTTE le CORE fully_covered+, zero critical gap,
 *   qualityGate, prerequisiti coerenti, fonti al 100% sulle unità CORE,
 *   fonti al 100% su TUTTE le unità della matrice (HISTORY_SCOPE §8.8)
 *   e profondità dichiarata su ≥80% delle unità (§8.7). Non è ottenibile
 *   per numero di nodi.
 * @module engine/coverage
 */

import { AREA_STATUS, READINESS, IMPORTANCE } from "../model/types.mjs";

export { AREA_STATUS, READINESS, IMPORTANCE };
export const IMPORTANCE_WEIGHT = Object.freeze({ core: 4, important: 2, secondary: 1, optional: 0.5 });

export const THRESHOLDS = Object.freeze({
  outlinedBelow: 25,
  partialBelow: 60,
  coreNearCompleteMin: 75, // ogni area CORE per near_complete
  coreCompleteMin: 100, // di fatto fully_covered
  sourceBackingMin: 1, // frazione nodi CORE con backing verificato, per complete: 100% (nessuna unità CORE senza fonte verificata; HISTORY_SCOPE §8.8)
  unitBackingMin: 1, // frazione TUTTE le unità della matrice con backing verificato, per complete: 100% (§8.8)
  unitDepthMin: 0.8, // frazione unità con profondità dichiarata ≠ none, per complete (§8.7)
  substantialOverallMin: 50,
  developingOverallMin: 10,
});

/** Punteggio unità: 1 published, 0.4 reviewed/draft, 0 altrimenti/assente. */
export function unitScore(nodeById, unit) {
  if (!unit.nodeId) return 0;
  const n = nodeById.get(unit.nodeId);
  if (!n) return 0;
  if (n.status === "published") return 1;
  if (n.status === "reviewed" || n.status === "draft") return 0.4;
  return 0;
}

/** Un nodo ha backing verificato: fonte content_reviewed, oppure proof autocontenuta. */
export function nodeVerifiedBacking(n) {
  if (!n || n.status !== "published") return false;
  if ((n.sources || []).some((s) => s.verificationStatus === "content_reviewed")) return true;
  if ((n.proof || []).length >= 2) return true; // dimostrazione autocontenuta e verificabile
  return false;
}

/** Coverage % di un'area + stato + lacune (unità con score < 1). */
export function computeAreaCoverage(area, nodeById) {
  const units = area.units || [];
  let num = 0;
  let den = 0;
  const gaps = [];
  for (const u of units) {
    const w = u.weight ?? 1;
    den += w;
    const s = unitScore(nodeById, u);
    num += w * s;
    if (s < 1) gaps.push(u.id);
  }
  const pct = den ? (100 * num) / den : 0;
  let status = "not_started";
  if (pct >= 100) status = "fully_covered";
  else if (pct >= THRESHOLDS.partialBelow) status = "substantially_covered";
  else if (pct >= THRESHOLDS.outlinedBelow) status = "partially_covered";
  else if (pct > 0) status = "outlined";
  if (status === "fully_covered") {
    const allBacked = units.every((u) => {
      const n = nodeById.get(u.nodeId);
      return nodeVerifiedBacking(n);
    });
    if (allBacked) status = "verified";
  }
  return { pct: Math.round(pct * 10) / 10, status, gaps };
}

/** Media pesata per importanza su tutte le aree. */
export function overallCoverage(areaResults, areas) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < areas.length; i++) {
    const w = IMPORTANCE_WEIGHT[areas[i].importance] ?? 1;
    num += w * areaResults[i].pct;
    den += w;
  }
  return den ? Math.round((100 * num) / den / 100 * 10) / 10 : 0;
}

/** Coverage separata foundational vs advanced (tier delle unità). */
export function tierCoverage(matrix, nodeById, tier) {
  let num = 0;
  let den = 0;
  for (const a of matrix.macroAreas || []) {
    for (const u of a.units || []) {
      if (u.tier !== tier) continue;
      const w = u.weight ?? 1;
      den += w;
      num += w * unitScore(nodeById, u);
    }
  }
  return den ? Math.round((10000 * num) / den) / 100 : 0;
}

/** Critical gap: unità scoperta (score 0) in area CORE con peso >= 2. */
export function criticalGaps(matrix, nodeById) {
  const out = [];
  for (const a of matrix.macroAreas || []) {
    if (a.importance !== "core") continue;
    for (const u of a.units || []) {
      if ((u.weight ?? 1) >= 2 && unitScore(nodeById, u) === 0) out.push(`${a.id}::${u.id}`);
    }
  }
  return out;
}

/** Frazione di nodi CORE con backing verificato (soglia fonti per complete). */
export function coreBackingFraction(matrix, nodeById) {
  let backed = 0;
  let total = 0;
  for (const a of matrix.macroAreas || []) {
    if (a.importance !== "core") continue;
    for (const u of a.units || []) {
      const n = u.nodeId ? nodeById.get(u.nodeId) : null;
      if (n && n.status === "published") {
        total++;
        if (nodeVerifiedBacking(n)) backed++;
      }
    }
  }
  return total ? backed / total : 0;
}

/**
 * Readiness derivata. `checks = { qualityGate, prereqsCoherent }` vengono
 * da validate.mjs (il gate coverage NON si auto-assegna la qualità).
 */
export function computeReadiness(matrix, nodeById, checks = {}) {
  const areas = matrix.macroAreas || [];
  const results = areas.map((a) => computeAreaCoverage(a, nodeById));
  const overall = overallCoverage(results, areas);
  const coreIdx = areas.map((a, i) => (a.importance === "core" ? i : -1)).filter((i) => i >= 0);
  const coreResults = coreIdx.map((i) => results[i]);
  const gaps = criticalGaps(matrix, nodeById);
  const backing = coreBackingFraction(matrix, nodeById);

  // Oltre alle CORE: TUTTE le unità della matrice (fonti §8.8, profondità §8.7)
  let unitsAll = 0;
  let unitsBacked = 0;
  let unitsDeep = 0;
  for (const a of areas) {
    for (const u of a.units || []) {
      const n = u.nodeId ? nodeById.get(u.nodeId) : null;
      if (n && n.status === "published") {
        unitsAll++;
        if (nodeVerifiedBacking(n)) unitsBacked++;
        if ((u.contentDepth || "none") !== "none") unitsDeep++;
      }
    }
  }
  const unitBacking = unitsAll ? unitsBacked / unitsAll : 0;
  const unitDepth = unitsAll ? unitsDeep / unitsAll : 0;

  const allCoreFull = coreResults.length > 0 && coreResults.every((r) => r.status === "fully_covered" || r.status === "verified");
  if (
    allCoreFull &&
    gaps.length === 0 &&
    checks.qualityGate === true &&
    checks.prereqsCoherent === true &&
    backing >= THRESHOLDS.sourceBackingMin &&
    unitBacking >= THRESHOLDS.unitBackingMin &&
    unitDepth >= THRESHOLDS.unitDepthMin
  ) {
    return { readiness: "complete", overall, gaps, backing, coreResults };
  }
  if (coreResults.length > 0 && coreResults.every((r) => r.pct >= THRESHOLDS.coreNearCompleteMin) && gaps.length === 0) {
    return { readiness: "near_complete", overall, gaps, backing, coreResults };
  }
  if (overall >= THRESHOLDS.substantialOverallMin && coreResults.every((r) => r.pct >= THRESHOLDS.outlinedBelow)) {
    return { readiness: "substantial", overall, gaps, backing, coreResults };
  }
  if (overall > THRESHOLDS.developingOverallMin) {
    return { readiness: "developing", overall, gaps, backing, coreResults };
  }
  return { readiness: "foundation", overall, gaps, backing, coreResults };
}
