import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ReferenceCollectionSchema, type Claim, type Comparison, type ReferenceCollection, type ScriptDetail,
  type ScriptRecord, type ScriptSummary, type SourceRecord,
} from "@scriptecho/contracts";

export const REFERENCE_VERSION = "2026-11-01";
const CHARACTER_NOTE = "Characters come from Unicode. They are modern normalized forms, not attested letter shapes from any inscription.";
const COMPARISON_CAVEAT = "Visual similarity does not establish historical descent or a linguistic relationship.";

export type ScriptFacts = { name: string; alternativeNames: string[]; direction: string | null };

const TRAIT_TOPICS: Record<string, string> = {
  writing_direction: "Writing direction",
  structure: "Writing system type",
  letter_form: "Letter form",
};

export function loadCollection(directory: string): ReferenceCollection {
  const scripts = readdirSync(join(directory, "scripts"))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(directory, "scripts", file), "utf8")));
  const sources = JSON.parse(readFileSync(join(directory, "sources.json"), "utf8"));
  const visualTerms = JSON.parse(readFileSync(join(directory, "visual_vocabulary.json"), "utf8")).terms;
  return ReferenceCollectionSchema.parse({ version: REFERENCE_VERSION, scripts, sources, visualTerms });
}

function claimsOf(script: ScriptRecord): Claim[] {
  return [script.historicalPeriod, script.geographicDistribution, script.directionality, ...script.characteristics,
    ...script.relationships].filter((claim): claim is Claim => claim !== null);
}

/** Referential checks that a schema cannot express. A non-empty result must stop the server. */
export function checkCollection(collection: ReferenceCollection): string[] {
  const problems: string[] = [];
  const sourceIds = new Set(collection.sources.map((source) => source.id));
  const scriptIds = new Set<string>();
  const seenClaims = new Set<string>();
  const usedSources = new Set<string>();
  if (sourceIds.size !== collection.sources.length) problems.push("duplicate source id");
  for (const script of collection.scripts) {
    if (scriptIds.has(script.id)) problems.push(`duplicate script id ${script.id}`);
    scriptIds.add(script.id);
    const claims = claimsOf(script);
    const claimIds = new Set(claims.map((claim) => claim.id));
    for (const claim of claims) {
      if (seenClaims.has(claim.id)) problems.push(`duplicate claim id ${claim.id}`);
      seenClaims.add(claim.id);
      for (const sourceId of claim.sourceIds) {
        usedSources.add(sourceId);
        if (!sourceIds.has(sourceId)) problems.push(`${claim.id} cites unknown source ${sourceId}`);
      }
    }
    for (const trait of script.traits) {
      if (!claimIds.has(trait.claimId)) problems.push(`${script.id} trait points at unknown claim ${trait.claimId}`);
    }
    for (const item of script.referenceCharacters) {
      const expected = `U+${item.character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
      if (expected !== item.codePoint) problems.push(`${script.id} character ${item.codePoint} does not match its code point`);
    }
  }
  for (const source of collection.sources) {
    if (!usedSources.has(source.id) && source.id !== "unicode-16-ucd") problems.push(`source ${source.id} is unused`);
  }
  return problems;
}

export class ReferenceService {
  private readonly scripts: Map<string, ScriptRecord>;
  private readonly sources: Map<string, SourceRecord>;
  readonly version: string;
  readonly visualTerms: ReadonlySet<string>;

  constructor(collection: ReferenceCollection) {
    const problems = checkCollection(collection);
    if (problems.length > 0) throw new Error(`Invalid reference collection: ${problems.join("; ")}`);
    this.scripts = new Map(collection.scripts.map((script) => [script.id, script]));
    this.sources = new Map(collection.sources.map((source) => [source.id, source]));
    this.version = collection.version;
    this.visualTerms = new Set(collection.visualTerms);
  }

  scriptIds(): string[] {
    return [...this.scripts.keys()];
  }

  name(id: string): string | null {
    return this.scripts.get(id)?.name ?? null;
  }

  /** What the verifier may rely on: stored names and the sourced direction trait, if the record has one. */
  facts(id: string): ScriptFacts | null {
    const script = this.scripts.get(id);
    if (!script) return null;
    return { name: script.name, alternativeNames: script.alternativeNames,
      direction: script.traits.find((trait) => trait.key === "writing_direction")?.value ?? null };
  }

  private incompleteFields(script: ScriptRecord): string[] {
    const fields: [string, unknown][] = [["Historical period", script.historicalPeriod],
      ["Geographic distribution", script.geographicDistribution], ["Directionality", script.directionality]];
    return fields.filter(([, value]) => value === null).map(([label]) => label);
  }

  list(): ScriptSummary[] {
    return [...this.scripts.values()].map((script) => ({
      id: script.id, name: script.name, alternativeNames: script.alternativeNames,
      verificationStatus: script.verificationStatus, incompleteFields: this.incompleteFields(script),
    }));
  }

  private sourcesFor(claims: Claim[]): SourceRecord[] {
    const ids = [...new Set(claims.flatMap((claim) => claim.sourceIds))];
    return ids.map((id) => this.sources.get(id)!);
  }

  detail(id: string): ScriptDetail | null {
    const script = this.scripts.get(id);
    if (!script) return null;
    const ucd = this.sources.get("unicode-16-ucd");
    return {
      script,
      sources: [...this.sourcesFor(claimsOf(script)), ...(ucd ? [ucd] : [])],
      incompleteFields: this.incompleteFields(script),
      characterNote: CHARACTER_NOTE,
    };
  }

  /** Compares stored, sourced traits only. Nothing here is generated, and absent data stays absent. */
  compare(firstId: string, secondId: string): Comparison | null {
    const first = this.scripts.get(firstId);
    const second = this.scripts.get(secondId);
    if (!first || !second) return null;
    const claims = new Map([...claimsOf(first), ...claimsOf(second)].map((claim) => [claim.id, claim]));
    const shared: Comparison["shared"] = [];
    const differences: Comparison["differences"] = [];
    const missingEvidence: string[] = [];
    const keys = [...new Set([...first.traits, ...second.traits].map((trait) => trait.key))];
    for (const key of keys) {
      const a = first.traits.find((trait) => trait.key === key);
      const b = second.traits.find((trait) => trait.key === key);
      const topic = TRAIT_TOPICS[key] ?? key;
      if (!a || !b) {
        missingEvidence.push(`${topic}: no stored claim for ${(a ? second : first).name}`);
        continue;
      }
      const claimA = claims.get(a.claimId)!;
      const claimB = claims.get(b.claimId)!;
      const point = { topic, first: claimA.text, second: claimB.text,
        sourceIds: [...new Set([...claimA.sourceIds, ...claimB.sourceIds])] };
      (a.value === b.value ? shared : differences).push(point);
    }
    for (const [label, field] of [["Historical period", "historicalPeriod"], ["Geographic distribution", "geographicDistribution"]] as const) {
      const a = first[field];
      const b = second[field];
      if (a && b) {
        differences.push({ topic: label, first: a.text, second: b.text, sourceIds: [...new Set([...a.sourceIds, ...b.sourceIds])] });
      } else if (!a || !b) {
        const absent = [!a ? first.name : null, !b ? second.name : null].filter(Boolean).join(" and ");
        missingEvidence.push(`${label}: no stored claim for ${absent}`);
      }
    }
    const used = [...shared, ...differences].flatMap((point) => point.sourceIds);
    return {
      first: { id: first.id, name: first.name },
      second: { id: second.id, name: second.name },
      shared, differences, missingEvidence,
      referenceCharacters: { first: first.referenceCharacters, second: second.referenceCharacters },
      sources: [...new Set(used)].map((id) => this.sources.get(id)!),
      caveat: COMPARISON_CAVEAT,
    };
  }
}
