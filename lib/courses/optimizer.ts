export const RECOMMENDATION_ALGORITHM_VERSION = "care-combination-v1";
export interface RecommendationCandidate {
  id: string; durationSeconds: number; goals: string[]; purpose: string;
  relevance: number; complementarity: number; preference: number;
  eligible: boolean; duplicateGroup: string;
}
export interface OptimizationInput {
  candidates: RecommendationCandidate[]; targetGoals: string[]; budgetSeconds: number;
  preferenceAvailable: boolean; pairSimilarities: Record<string, number>;
}
export interface RecommendationScore {
  total: number; coverage: number; relevance: number; complementarity: number;
  preference: number; redundancy: number; durationSeconds: number;
}
const SCALE = 1_000_000;
const units = (value: number) => Math.round(value * SCALE);
const value = (scaled: number) => scaled / SCALE;
const divide = (numerator: number, denominator: number) => numerator >= 0
  ? Math.trunc((numerator + Math.floor(denominator / 2)) / denominator)
  : -Math.trunc((-numerator + Math.floor(denominator / 2)) / denominator);
function token(value: string) {
  if (!value?.trim() || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("Invalid recommendation token");
}
function feature(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Recommendation features must be in [0,1]");
  return Math.round(value * 10_000) / 10_000;
}
export function pairKey(left: string, right: string) {
  token(left); token(right);
  if (left === right) throw new Error("Distinct resource ids required");
  return left < right ? `${left}\n${right}` : `${right}\n${left}`;
}
function validate(input: OptimizationInput) {
  if (input.candidates.length > 20 || !Number.isInteger(input.budgetSeconds) || input.budgetSeconds <= 0) throw new Error("Invalid recommendation input");
  const ids = new Set<string>();
  for (const candidate of input.candidates) {
    token(candidate.id); token(candidate.purpose);
    if (ids.has(candidate.id) || !Number.isInteger(candidate.durationSeconds) || candidate.durationSeconds < 0) throw new Error("Invalid candidate");
    ids.add(candidate.id); candidate.goals.forEach(token);
    feature(candidate.relevance); feature(candidate.complementarity); feature(candidate.preference);
    if (candidate.duplicateGroup) token(candidate.duplicateGroup);
  }
  input.targetGoals.forEach(token);
  for (const [key, similarity] of Object.entries(input.pairSimilarities)) {
    const pair = key.split("\n");
    if (pair.length !== 2 || !ids.has(pair[0]) || !ids.has(pair[1]) || pair[0] >= pair[1]) throw new Error("Invalid semantic pair");
    feature(similarity);
  }
}

/** 移植原项目有限组合评分；时长是硬约束，缺失时长不能伪装成零成本。 */
export function evaluateCombination(input: OptimizationInput, selectedIds: string[]): RecommendationScore | null {
  validate(input);
  const target = new Set(input.targetGoals);
  if (!target.size || !selectedIds.length || selectedIds.length > 3 || new Set(selectedIds).size !== selectedIds.length) return null;
  const chosen = selectedIds.map(id => input.candidates.find(candidate => candidate.id === id));
  if (chosen.some(candidate => !candidate?.eligible || candidate.durationSeconds <= 0)) return null;
  const candidates = chosen as RecommendationCandidate[];
  const durationSeconds = candidates.reduce((sum, candidate) => sum + candidate.durationSeconds, 0);
  if (durationSeconds > input.budgetSeconds) return null;
  const groups = candidates.map(candidate => candidate.duplicateGroup).filter(Boolean);
  if (new Set(groups).size !== groups.length) return null;
  const covered = new Set(candidates.flatMap(candidate => candidate.goals).filter(goal => target.has(goal)));
  const coverage = divide(covered.size * SCALE, target.size);
  const average = (key: "relevance" | "complementarity" | "preference") => divide(candidates.reduce((sum, candidate) => sum + units(feature(candidate[key])), 0), candidates.length);
  const relevance = average("relevance"), complementarity = average("complementarity");
  const preference = input.preferenceAvailable ? average("preference") : 0;
  let pairSum = 0, pairs = 0;
  for (let a = 0; a < candidates.length; a++) for (let b = a + 1; b < candidates.length; b++) {
    pairs++;
    if (candidates[a].purpose !== candidates[b].purpose) continue;
    const similarity = input.pairSimilarities[pairKey(candidates[a].id, candidates[b].id)];
    if (similarity !== undefined) pairSum += units(feature(similarity));
    else {
      const union = new Set([...candidates[a].goals, ...candidates[b].goals]);
      const overlap = candidates[a].goals.filter(goal => candidates[b].goals.includes(goal));
      pairSum += units(feature(union.size ? overlap.length / union.size : 1));
    }
  }
  const redundancy = pairs ? divide(pairSum, pairs) : 0;
  const total = input.preferenceAvailable
    ? divide(4 * coverage + 3 * relevance + 2 * complementarity + preference - 2 * redundancy, 10)
    : divide(5 * (4 * coverage + 3 * relevance + 2 * complementarity) - 9 * redundancy, 45);
  return { total: value(total), coverage: value(coverage), relevance: value(relevance), complementarity: value(complementarity), preference: value(preference), redundancy: value(redundancy), durationSeconds };
}
function better(ids: string[], score: RecommendationScore, winner: { ids: string[]; score: RecommendationScore } | null) {
  return !winner || score.total > winner.score.total || (score.total === winner.score.total && (
    score.durationSeconds < winner.score.durationSeconds || (score.durationSeconds === winner.score.durationSeconds && (
      score.redundancy < winner.score.redundancy || (score.redundancy === winner.score.redundancy && ids.join("\n") < winner.ids.join("\n"))
    ))
  ));
}
export function optimizeRecommendations(input: OptimizationInput) {
  validate(input);
  const candidates = [...input.candidates].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let winner: { ids: string[]; score: RecommendationScore } | null = null;
  let evaluatedCombinations = 0;
  const visit = (ids: string[], start: number) => {
    if (ids.length) {
      evaluatedCombinations++;
      const score = evaluateCombination(input, ids);
      if (score && better(ids, score, winner)) winner = { ids, score };
    }
    if (ids.length === 3) return;
    for (let index = start; index < candidates.length; index++) visit([...ids, candidates[index].id], index + 1);
  };
  visit([], 0);
  const selected = winner as { ids: string[]; score: RecommendationScore } | null;
  return { ids: selected?.ids ?? [], score: selected?.score ?? { total: 0, coverage: 0, relevance: 0, complementarity: 0, preference: 0, redundancy: 0, durationSeconds: 0 }, evaluatedCombinations, algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION };
}
export function reuseRecommendations(input: OptimizationInput, previous: string[], epsilon = 0.02) {
  if (!Number.isFinite(epsilon) || epsilon < 0) throw new Error("Invalid reuse budget");
  const optimum = optimizeRecommendations(input);
  const oldScore = evaluateCombination(input, previous);
  const gap = oldScore ? Math.max(0, optimum.score.total - oldScore.total) : Infinity;
  const reused = Boolean(oldScore && gap <= epsilon + 1e-9);
  return { ...optimum, ids: reused ? [...previous].sort() : optimum.ids, score: reused ? oldScore! : optimum.score, reused, gap };
}
export function normalizedCosine(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length || [...left, ...right].some(number => !Number.isFinite(number))) throw new Error("Embedding dimension or value mismatch");
  const norm = Math.hypot(...left) * Math.hypot(...right);
  if (!norm) throw new Error("Zero embedding vector");
  return Math.min(1, Math.max(0, (left.reduce((sum, number, index) => sum + number * right[index], 0) / norm + 1) / 2));
}
