/**
 * Persistenza del progresso di studio: un file JSON per utente anonimo,
 * nessuna dipendenza esterna. Le regole di mastery / ripasso sono quelle
 * pure di engine/learning.mjs (unica fonte di verità, testata lì).
 *
 * L'utente qui è solo un identificatore locale (x-user / cookie generato dal
 * client): NON è autenticazione. Il backend reale dovrà sostituirlo con un
 * id di sessione verificato (docs/API_CONTRACT.md).
 *
 * @module server/progress
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { emptyProgress, markStudied, updateMastery, nextReview, dueForReview } from "../engine/learning.mjs";

const USER_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Validazione dell'id utente anonimo: mai percorsi, mai injection. */
export function sanitizeUserId(raw) {
  const u = String(raw || "").trim();
  return USER_RE.test(u) ? u : null;
}

/** Sintesi per la dashboard (numeri reali, mai inventati). */
export function summarize(progress) {
  const studied = Object.keys(progress.studied || {}).length;
  const masteryVals = Object.values(progress.mastery || {});
  const avgMastery = masteryVals.length
    ? Math.round((masteryVals.reduce((a, b) => a + b, 0) / masteryVals.length) * 10) / 10
    : 0;
  const due = dueForReview(progress).length;
  const days = (progress.streak?.days || []).slice().sort();
  let streak = 0;
  if (days.length) {
    const day = 86400000;
    const today = new Date().toISOString().slice(0, 10);
    let cursor = days[days.length - 1] === today ? new Date(today) : null;
    if (cursor) {
      streak = 1;
      for (let i = days.length - 1; i >= 0; i--) {
        const prev = new Date(days[i - 1]);
        if (!days[i - 1]) break;
        if ((cursor - prev) / day === 1) {
          streak++;
          cursor = prev;
        } else break;
      }
    }
  }
  return { studied, avgMastery, due, streak, masteryCount: masteryVals.length };
}

/** Registra una risposta al quiz: aggiorna mastery e schedule di ripasso. */
function applyQuiz(progress, nodeId, score) {
  const now = new Date().toISOString();
  const p = structuredClone(progress);
  p.studied = p.studied || {};
  p.mastery = p.mastery || {};
  p.reviews = p.reviews || {};
  p.streak = p.streak || { days: [] };
  const prev = p.mastery[nodeId] || 0;
  p.mastery[nodeId] = updateMastery(prev, score);
  p.reviews[nodeId] = now;
  if (!p.studied[nodeId]) p.studied[nodeId] = now;
  const today = now.slice(0, 10);
  const days = new Set(p.streak.days || []);
  days.add(today);
  p.streak.days = [...days].sort().slice(-60);
  return { progress: p, mastery: p.mastery[nodeId], prev, reviewDays: nextReview(p.mastery[nodeId]) };
}

/**
 * Fabbrica dello store: `dataDir` è la cartella dati del progetto
 * (default <root>/data). Ogni utente anonimo ha il suo file.
 */
export function progressStore(dataDir) {
  const dir = join(dataDir, "progress");

  async function load(userId) {
    try {
      const raw = await readFile(join(dir, `${userId}.json`), "utf8");
      const p = JSON.parse(raw);
      return { ...emptyProgress(), ...p };
    } catch {
      return emptyProgress();
    }
  }

  async function save(userId, progress) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${userId}.json`), JSON.stringify(progress, null, 2));
  }

  return {
    async get(userId) {
      const progress = await load(userId);
      return { progress, summary: summarize(progress) };
    },

    /** Segna un nodo come studiato (esplicito o da quiz). */
    async studied(userId, nodeId) {
      const progress = markStudied(await load(userId), nodeId);
      await save(userId, progress);
      return { progress, summary: summarize(progress) };
    },

    /** Applica un quiz: ritorna mastery, variazione e prossimo ripasso. */
    async quiz(userId, nodeId, score) {
      const base = await load(userId);
      const { progress, mastery, prev, reviewDays } = applyQuiz(base, nodeId, score);
      await save(userId, progress);
      return { progress, summary: summarize(progress), mastery, prev, reviewDays };
    },

    /** Nodi da ripassare oggi (con titolo, se il nodo esiste ed è entitled). */
    async due(userId) {
      const progress = await load(userId);
      return dueForReview(progress).map((id) => ({ id, mastery: progress.mastery?.[id] ?? 0 }));
    },
  };
}
