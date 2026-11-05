/**
 * Strumenti di apprendimento: progress, mastery, spaced repetition, quiz scoring.
 * Funzioni pure (testabili), persistenza a carico del futuro backend.
 * @module engine/learning
 */

/** Crea uno stato di progresso vuoto per un utente. */
export function emptyProgress() {
  return { studied: {}, mastery: {}, reviews: {}, streak: { days: [] } };
}

/** Segna un nodo come studiato. Ritorna nuovo stato (immutabile). */
export function markStudied(progress, nodeId, at = new Date().toISOString()) {
  const p = structuredClone(progress);
  p.studied[nodeId] = at;
  return p;
}

/**
 * Aggiorna mastery 0..5 dopo un quiz.
 * @param {number} prev mastery precedente
 * @param {number} score 0..1 frazione risposte corrette
 */
export function updateMastery(prev, score) {
  if (score >= 0.85) return Math.min(5, (prev || 0) + 1);
  if (score >= 0.6) return prev || 0;
  return Math.max(0, (prev || 0) - 1);
}

/** Valuta un quiz: ritorna {correct, total, score}. */
export function gradeQuiz(quiz, answers) {
  let correct = 0;
  quiz.forEach((q, i) => {
    if (answers[i] === q.answer) correct++;
  });
  return { correct, total: quiz.length, score: quiz.length ? correct / quiz.length : 0 };
}

/**
 * Prossimo ripasso (spaced repetition semplificata SM-2-like).
 * Intervalli in giorni per mastery 0..5: [0,1,3,7,16,35].
 */
export function nextReview(mastery) {
  const table = [0, 1, 3, 7, 16, 35];
  return table[Math.max(0, Math.min(5, mastery ?? 0))];
}

/** Nodi da ripassare oggi (mastery < 4 o review scaduta). */
export function dueForReview(progress, now = new Date()) {
  const due = [];
  for (const [id, level] of Object.entries(progress.mastery || {})) {
    const last = progress.reviews?.[id];
    const interval = nextReview(level);
    if (!last) {
      due.push(id);
      continue;
    }
    const diffDays = (now - new Date(last)) / 86400000;
    if (diffDays >= interval) due.push(id);
  }
  return due;
}
