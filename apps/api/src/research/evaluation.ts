import type { ResearchDatasetRecord } from "@scriptecho/contracts";

/** Separate from M0. A prediction names one dataset record, and each measure uses only the fields it needs. */
export type Prediction = {
  recordId: string;
  /** Ranked script IDs. Empty means the system abstained. */
  scripts: string[];
  strength?: "strong" | "moderate" | "weak" | null;
  text?: string | null;
  latencyMs?: number | null;
};

export function editDistance<T>(first: ArrayLike<T>, second: ArrayLike<T>): number {
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= second.length; j += 1) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (first[i - 1] === second[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[second.length]!;
}

const letters = (text: string) => [...text.normalize("NFC").replace(/\s+/gu, " ").trim()];
const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean);

/** Edits per reference unit. Both are undefined for empty references, and both can exceed 1. */
export function errorRate<T>(reference: T[], hypothesis: T[]): number | null {
  return reference.length === 0 ? null : editDistance(reference, hypothesis) / reference.length;
}
export const characterErrorRate = (reference: string, hypothesis: string) => errorRate(letters(reference), letters(hypothesis));
export const wordErrorRate = (reference: string, hypothesis: string) => errorRate(words(reference), words(hypothesis));

/** Refuses data whose splits could leak: one object or image in two splits, or a duplicate ID. */
export function checkDataset(records: ResearchDatasetRecord[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const groups = new Map<string, string>();
  const images = new Map<string, string>();
  for (const record of records) {
    if (ids.has(record.id)) problems.push(`duplicate record ${record.id}`);
    ids.add(record.id);
    for (const [seen, key, label] of [[groups, record.objectGroup, "object"], [images, record.imageSha256, "image"]] as const) {
      const split = seen.get(key);
      if (split && split !== record.split) problems.push(`${label} ${key} appears in both ${split} and ${record.split}`);
      seen.set(key, record.split);
    }
  }
  return problems;
}

type Fraction = { correct: number; total: number };
const fraction = (hits: boolean[]): Fraction => ({ correct: hits.filter(Boolean).length, total: hits.length });

export type EvaluationReport = {
  /** True only when every scored record is held out. Anything else must not be quoted as a result. */
  reportable: boolean;
  warning: string | null;
  records: number;
  missingPredictions: string[];
  top1: Fraction;
  top3: Fraction;
  rejection: Fraction;
  characterErrorRate: number | null;
  wordErrorRate: number | null;
  reliabilityByStrength: Record<string, Fraction>;
  byScript: Record<string, Fraction>;
  byImageQuality: Record<string, Fraction>;
  byPeriod: Record<string, Fraction>;
  byDamage: Record<string, Fraction>;
  medianLatencyMs: number | null;
};

function grouped(rows: { key: string | null; hit: boolean }[]): Record<string, Fraction> {
  const groups: Record<string, boolean[]> = {};
  for (const { key, hit } of rows) (groups[key ?? "not_recorded"] ??= []).push(hit);
  return Object.fromEntries(Object.entries(groups).map(([key, hits]) => [key, fraction(hits)]));
}

/** Fractions, never percentages, so a small denominator stays visible. `rejectionLabels` are classes the system must refuse. */
export function evaluate(records: ResearchDatasetRecord[], predictions: Prediction[], rejectionLabels: string[]): EvaluationReport {
  const problems = checkDataset(records);
  if (problems.length > 0) throw new Error(`Dataset refused: ${problems.join("; ")}`);
  const byRecord = new Map(predictions.map((prediction) => [prediction.recordId, prediction]));
  const scored = records.filter((record) => record.scriptLabel !== null && byRecord.has(record.id));
  const rows = scored.map((record) => {
    const prediction = byRecord.get(record.id)!;
    return { record, prediction, rejected: rejectionLabels.includes(record.scriptLabel!), top1: prediction.scripts[0] === record.scriptLabel, top3: prediction.scripts.slice(0, 3).includes(record.scriptLabel!) };
  });
  const inScope = rows.filter((row) => !row.rejected);
  const texts = scored.flatMap((record) => {
    const text = byRecord.get(record.id)!.text;
    return record.referenceText !== null && typeof text === "string" ? [{ reference: record.referenceText, text }] : [];
  });
  const pooled = (split: (text: string) => string[]) => {
    const size = texts.reduce((sum, row) => sum + split(row.reference).length, 0);
    return size === 0 ? null : texts.reduce((sum, row) => sum + editDistance(split(row.reference), split(row.text)), 0) / size;
  };
  const latencies = rows.flatMap((row) => (typeof row.prediction.latencyMs === "number" ? [row.prediction.latencyMs] : [])).sort((a, b) => a - b);
  const reportable = rows.length > 0 && rows.every((row) => row.record.split === "held_out");
  return {
    reportable,
    warning: reportable ? null : "Some scored records are not held out. These numbers are for development only and must not be reported as performance.",
    records: rows.length,
    missingPredictions: records.filter((record) => !byRecord.has(record.id)).map((record) => record.id),
    top1: fraction(inScope.map((row) => row.top1)),
    top3: fraction(inScope.map((row) => row.top3)),
    rejection: fraction(rows.filter((row) => row.rejected).map((row) => row.prediction.scripts.length === 0)),
    characterErrorRate: pooled(letters),
    wordErrorRate: pooled(words),
    reliabilityByStrength: grouped(inScope.map((row) => ({ key: row.prediction.strength ?? null, hit: row.top1 }))),
    byScript: grouped(inScope.map((row) => ({ key: row.record.scriptLabel, hit: row.top1 }))),
    byImageQuality: grouped(inScope.map((row) => ({ key: row.record.imageQuality, hit: row.top1 }))),
    byPeriod: grouped(inScope.map((row) => ({ key: row.record.period, hit: row.top1 }))),
    byDamage: grouped(inScope.map((row) => ({ key: row.record.damaged === null ? null : row.record.damaged ? "damaged" : "undamaged", hit: row.top1 }))),
    medianLatencyMs: latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)]! : null,
  };
}
