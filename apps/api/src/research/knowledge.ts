import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  LanguagePackSchema, SignInventorySchema, type LanguagePack, type LanguageSummary, type SignInventory, type SignRecord,
} from "@scriptecho/contracts";

function readDirectory<T>(directory: string, parse: (value: unknown) => T): T[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((file) => file.endsWith(".json")).sort()
    .map((file) => parse(JSON.parse(readFileSync(join(directory, file), "utf8"))));
}

export const loadInventories = (knowledge: string) => readDirectory(join(knowledge, "sign_inventories"), (value) => SignInventorySchema.parse(value));
export const loadLanguages = (knowledge: string) => readDirectory(join(knowledge, "languages"), (value) => LanguagePackSchema.parse(value));

/** Checks that a schema cannot express. A non-empty result must stop the server, so a script joins only with valid data. */
export function checkResearchKnowledge(inventories: SignInventory[], languages: LanguagePack[], scriptIds: string[], sourceIds: string[]): string[] {
  const problems: string[] = [];
  const known = new Set(scriptIds);
  const sources = new Set(sourceIds);
  const seen = new Set<string>();
  for (const inventory of inventories) {
    const label = inventory.scriptId;
    if (seen.has(label)) problems.push(`duplicate inventory ${label}`);
    seen.add(label);
    if (!known.has(label)) problems.push(`inventory ${label} has no script record`);
    for (const id of inventory.sourceIds) if (!sources.has(id)) problems.push(`inventory ${label} cites unknown source ${id}`);
    const schemes = new Set(inventory.schemes.map((scheme) => scheme.id));
    const signIds = new Set<string>();
    for (const sign of inventory.signs) {
      if (signIds.has(sign.id)) problems.push(`${label} duplicate sign ${sign.id}`);
      signIds.add(sign.id);
      const expected = `U+${sign.character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
      if (expected !== sign.codePoint) problems.push(`${label} sign ${sign.id} does not match its code point`);
      for (const scheme of Object.keys(sign.schemes)) if (!schemes.has(scheme)) problems.push(`${label} sign ${sign.id} uses unknown scheme ${scheme}`);
      if (sign.kind === "vowel_sign" && !inventory.inherentVowel) problems.push(`${label} has a vowel sign but no inherent vowel`);
    }
    for (const scheme of inventory.schemes.filter((item) => item.reversible)) {
      const values = inventory.signs.map((sign) => sign.schemes[scheme.id]);
      if (values.includes(undefined) || new Set(values).size !== values.length) problems.push(`${label} scheme ${scheme.id} is marked reversible but is not`);
    }
  }
  const languageIds = new Set<string>();
  for (const language of languages) {
    if (languageIds.has(language.id)) problems.push(`duplicate language ${language.id}`);
    languageIds.add(language.id);
    for (const script of language.scriptIds) if (!seen.has(script)) problems.push(`language ${language.id} names script ${script}, which has no inventory`);
    const local = new Set(language.sources.map((source) => source.id));
    const entries = new Set<string>();
    for (const entry of language.entries) {
      if (entries.has(entry.id)) problems.push(`${language.id} duplicate entry ${entry.id}`);
      entries.add(entry.id);
      for (const id of entry.sourceIds) if (!local.has(id)) problems.push(`${language.id} entry ${entry.id} cites unknown source ${id}`);
      for (const form of entry.forms) if (form !== form.toLowerCase()) problems.push(`${language.id} entry ${entry.id} form ${form} is not lower case`);
    }
  }
  return problems;
}

export class ResearchKnowledge {
  private readonly inventories: Map<string, SignInventory>;
  private readonly languages: Map<string, LanguagePack>;
  private readonly signs = new Map<string, Map<string, SignRecord>>();

  constructor(inventories: SignInventory[], languages: LanguagePack[], scriptIds: string[], sourceIds: string[]) {
    const problems = checkResearchKnowledge(inventories, languages, scriptIds, sourceIds);
    if (problems.length > 0) throw new Error(`Invalid research knowledge: ${problems.join("; ")}`);
    this.inventories = new Map(inventories.map((inventory) => [inventory.scriptId, inventory]));
    this.languages = new Map(languages.map((language) => [language.id, language]));
    for (const inventory of inventories) this.signs.set(inventory.scriptId, new Map(inventory.signs.map((sign) => [sign.id, sign])));
  }

  inventory = (scriptId: string) => this.inventories.get(scriptId) ?? null;
  sign = (scriptId: string, signId: string) => this.signs.get(scriptId)?.get(signId) ?? null;
  language = (id: string) => this.languages.get(id) ?? null;

  languageList(): LanguageSummary[] {
    return [...this.languages.values()].map((language) => ({
      id: language.id, name: language.name, scriptIds: language.scriptIds, entryCount: language.entries.length, limitations: language.limitations,
    }));
  }
}
