import type { Box, Origin, SignToken } from "@scriptecho/contracts";

export const ORIGIN_LABELS: Record<Origin, string> = {
  ai_generated: "AI-generated", rule_based: "Rule-based", source_derived: "Source-derived",
  human_corrected: "Human-corrected", expert_reviewed: "Expert-reviewed", unverified: "Unverified",
};

const union = (first: Box | null, second: Box | null): Box | null => {
  if (!first || !second) return first ?? second;
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return { x, y, width: Math.max(first.x + first.width, second.x + second.width) - x, height: Math.max(first.y + first.height, second.y + second.height) - y };
};

const freshId = (tokens: SignToken[]) => {
  const used = new Set(tokens.map((token) => token.id));
  let index = tokens.length + 1;
  while (used.has(`t${String(index).padStart(4, "0")}`)) index += 1;
  return `t${String(index).padStart(4, "0")}`;
};

export const replaceToken = (tokens: SignToken[], index: number, change: Partial<SignToken>) =>
  tokens.map((token, position) => (position === index ? { ...token, ...change } : token));

export const removeToken = (tokens: SignToken[], index: number) => tokens.filter((_, position) => position !== index);

export function moveToken(tokens: SignToken[], index: number, step: -1 | 1) {
  const target = index + step;
  if (target < 0 || target >= tokens.length) return tokens;
  const next = [...tokens];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Joins a sign broken across two boxes. The reading is cleared, because neither part's reading describes the whole. */
export function mergeWithNext(tokens: SignToken[], index: number) {
  const first = tokens[index];
  const second = tokens[index + 1];
  if (!first || !second) return tokens;
  const merged: SignToken = { ...first, box: union(first.box, second.box), readings: [], status: "unread", segmentationUncertain: true,
    wordBreakAfter: second.wordBreakAfter, lineBreakAfter: second.lineBreakAfter };
  return [...tokens.slice(0, index), merged, ...tokens.slice(index + 2)];
}

/** Separates two touching signs at the middle of the box, for a person to check. */
export function splitToken(tokens: SignToken[], index: number) {
  const token = tokens[index];
  if (!token?.box || token.box.width < 2) return tokens;
  const left = Math.floor(token.box.width / 2);
  const first: SignToken = { ...token, box: { ...token.box, width: left }, readings: [], status: "unread", segmentationUncertain: true, wordBreakAfter: false, lineBreakAfter: false };
  const second: SignToken = { ...first, id: freshId(tokens), box: { ...token.box, x: token.box.x + left, width: token.box.width - left },
    wordBreakAfter: token.wordBreakAfter, lineBreakAfter: token.lineBreakAfter };
  return [...tokens.slice(0, index), first, second, ...tokens.slice(index + 1)];
}

/** Adds a box a person drew, on the image's own pixels. A stray click makes nothing. */
export function addBox(tokens: SignToken[], from: [number, number], to: [number, number], image: { width: number; height: number }) {
  const left = Math.max(0, Math.round(Math.min(from[0], to[0])));
  const top = Math.max(0, Math.round(Math.min(from[1], to[1])));
  const width = Math.min(image.width, Math.round(Math.max(from[0], to[0]))) - left;
  const height = Math.min(image.height, Math.round(Math.max(from[1], to[1]))) - top;
  if (width < 3 || height < 3) return tokens;
  const token: SignToken = { id: freshId(tokens), box: { x: left, y: top, width, height }, readings: [], status: "unread", segmentationUncertain: false,
    wordBreakAfter: false, lineBreakAfter: false, origin: "human_corrected", note: null };
  return [...tokens, token];
}

/** Records a gap in the text, which has no box because nothing of it survives. */
export function insertGap(tokens: SignToken[], index: number) {
  const gap: SignToken = { id: freshId(tokens), box: null, readings: [], status: "lost", segmentationUncertain: false, wordBreakAfter: false, lineBreakAfter: false, origin: "human_corrected", note: null };
  return [...tokens.slice(0, index + 1), gap, ...tokens.slice(index + 1)];
}
