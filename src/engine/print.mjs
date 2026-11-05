/**
 * Stampa/export controllata: watermark + audit, mai solo `@media print`.
 * Il server genera il payload di stampa (con watermark) solo se entitled;
 * il client non può stampare nodi che non ha ricevuto.
 * @module engine/print
 */
import { randomUUID } from "node:crypto";

/**
 * Costruisce un job di stampa server-side.
 * @param {{plan:string, userId:string}} entitlement entitlement verificata
 * @param {object} node nodo (già verificato con requireAccess)
 * @param {{scope:string}} opts scope: "node" | "branch" | "path"
 */
export function buildPrintJob(entitlement, node, opts = {}) {
  const { plan, userId } = entitlement;
  const now = new Date().toISOString();
  return {
    jobId: randomUUID(),
    nodeId: node.id,
    subject: node.subject,
    title: node.title,
    scope: opts.scope || "node",
    plan,
    watermark: {
      userId,
      printedAt: now,
      docCode: `DOC-${node.subject.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      notice: "Copia personale legata all'account — redistribuzione non consentita.",
    },
    contentHash: null, // calcolato dal server al momento dell'emissione
    createdAt: now,
  };
}

/** Prompt di audit per ogni export (il server lo scrive in data/*.log). */
export function auditLine(job) {
  return JSON.stringify({
    t: job.createdAt,
    job: job.jobId,
    node: job.nodeId,
    user: job.watermark.userId,
    plan: job.plan,
    scope: job.scope,
    doc: job.watermark.docCode,
  });
}
