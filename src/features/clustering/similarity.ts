import { tokenize } from "./tokenizer";

/** Jaccard similarity over token sets. */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Overlap coefficient: intersection / min(size). Better for short headlines. */
export function overlapCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });
  return intersection / Math.min(setA.size, setB.size);
}

/** Levenshtein edit distance ratio, 1 = identical. */
export function editSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0 || lenB === 0) return 0;
  const prev = new Array<number>(lenB + 1);
  const curr = new Array<number>(lenB + 1);
  for (let j = 0; j <= lenB; j += 1) prev[j] = j;
  for (let i = 1; i <= lenA; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= lenB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= lenB; j += 1) prev[j] = curr[j];
  }
  return 1 - prev[lenB] / Math.max(lenA, lenB);
}

export interface SimilarityScore {
  combined: number;
  title: number;
  entity: number;
}

/**
 * Composite similarity of two headlines.
 * Title similarity (token overlap + edit distance) carries most weight;
 * entity overlap acts as the guardrail against merging unrelated stories.
 */
export function headlineSimilarity(
  titleA: string,
  titleB: string,
  entitiesA: string[],
  entitiesB: string[],
): SimilarityScore {
  const tokensA = tokenize(titleA);
  const tokensB = tokenize(titleB);
  const jac = jaccard(tokensA, tokensB);
  const overlap = overlapCoefficient(tokensA, tokensB);
  const edit = editSimilarity(titleA.toLowerCase().replace(/\s/g, ""), titleB.toLowerCase().replace(/\s/g, ""));
  const title = jac * 0.5 + overlap * 0.3 + edit * 0.2;

  const entityOverlap = overlapCoefficient(entitiesA, entitiesB);
  return {
    combined: title * 0.65 + entityOverlap * 0.35,
    title,
    entity: entityOverlap,
  };
}
