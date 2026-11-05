/**
 * Entitlements centralizzati FREE / PRO / ULTRA.
 * UNICO punto in cui si decide l'accesso: nessun `if (isPremium)` sparso nel codice.
 * Il server (src/server/server.mjs) e il build-index usano SOLO queste funzioni.
 * @module engine/entitlements
 */
import { PLAN_RANK, PLANS } from "../model/types.mjs";

/** Normalizza un piano; default "free" se sconosciuto. */
export function normalizePlan(plan) {
  return PLANS.includes(plan) ? plan : "free";
}

/**
 * Determina il piano minimo richiesto per un nodo.
 * - access "free"  → free
 * - access "pro"   → pro
 * - access "ultra" → ultra
 */
export function requiredPlan(node) {
  if (!node) return "ultra"; // ignoto = nega
  return normalizePlan(node.access || "pro");
}

/**
 * Può questo piano vedere il nodo? (controllo server-side).
 * @param {string} plan piano dell'utente (verificato dal backend auth, mai dal client)
 * @param {object} node nodo contenuto
 */
export function canAccess(plan, node) {
  if (!node) return false;
  if (node.status !== "published") return false; // draft/planned/archived mai serviti
  return PLAN_RANK[normalizePlan(plan)] >= PLAN_RANK[requiredPlan(node)];
}

/** Filtra una lista di nodi a quelli visibili per il piano. */
export function filterVisible(plan, nodes) {
  return nodes.filter((n) => canAccess(plan, n));
}

/**
 * Proiezione sicura di un nodo per il piano dato.
 * - Se non autorizzato: ritorna null (il server risponde 403, non un payload parziale).
 * - Se autorizzato free su nodo free: include tutto il contenuto free.
 * Mai includere contenuti di nodi non autorizzati in payload aggregati.
 */
export function projectNode(plan, node) {
  if (!canAccess(plan, node)) return null;
  return node;
}

/** L'AI avanzata (LLM, generazione illimitata) richiede ULTRA. */
export function canUseAdvancedAI(plan) {
  return PLAN_RANK[normalizePlan(plan)] >= PLAN_RANK.ultra;
}

/** La stampa/export di nodi premium richiede almeno PRO. */
export function canPrint(plan, node) {
  return canAccess(plan, node) && PLAN_RANK[normalizePlan(plan)] >= PLAN_RANK.pro;
}

/**
 * Eccezione standard per diniego (usata dal server per 403 coerenti).
 */
export class EntitlementError extends Error {
  constructor(plan, nodeId) {
    super(`Piano '${plan}' non autorizzato per il nodo '${nodeId}'`);
    this.name = "EntitlementError";
    this.code = 403;
  }
}

/** Lancia se l'accesso non è consentito (helper server-side). */
export function requireAccess(plan, node) {
  if (!canAccess(plan, node)) throw new EntitlementError(plan, node?.id);
  return node;
}
