import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ExemplarSchema, ResearchCaseSchema, type CaseSummary, type Exemplar, type ResearchCase, type Reviewer } from "@scriptecho/contracts";
import { z } from "zod";
import { AppError } from "../errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Change = { action: string; reviewer?: Reviewer | null; evidence?: string | null; recordTokens?: boolean };
type NewCase = Pick<ResearchCase, "title" | "provenance"> & { image: Buffer; width: number; height: number; sourceFormat: string };

/**
 * Keeps each case in its own folder on this machine. Nothing is stored unless a person creates a case,
 * and writes are synchronous, so two changes in one process cannot interleave.
 */
export class CaseStore {
  private readonly cases: string;
  private readonly exemplarFile: string;

  constructor(root: string) {
    this.cases = join(root, "cases");
    this.exemplarFile = join(root, "exemplars.json");
    mkdirSync(this.cases, { recursive: true });
  }

  /** The id reaches a file path, so anything but a UUID is refused before the path is built. */
  private directory(id: string): string {
    if (!UUID.test(id) || !existsSync(join(this.cases, id, "case.json"))) throw new AppError("not_found", "That case does not exist.");
    return join(this.cases, id);
  }

  private write(file: string, content: string): void {
    const temporary = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, content);
    renameSync(temporary, file);
  }

  private save(record: ResearchCase): ResearchCase {
    const parsed = ResearchCaseSchema.parse(record);
    this.write(join(this.cases, parsed.id, "case.json"), JSON.stringify(parsed));
    return parsed;
  }

  create({ title, provenance, image, width, height, sourceFormat }: NewCase): ResearchCase {
    const id = randomUUID();
    const at = new Date().toISOString();
    mkdirSync(join(this.cases, id));
    writeFileSync(join(this.cases, id, "image.jpg"), image);
    return this.save({
      id, title, createdAt: at, updatedAt: at, revision: 1, provenance, quality: null, scriptId: null, languageId: null, analysis: null,
      image: { sha256: createHash("sha256").update(image).digest("hex"), width, height, sourceFormat, bytes: image.length },
      tokens: [], notes: [], citations: [], reviewState: "not_reviewed",
      history: [{ revision: 1, at, action: "Case created", reviewer: null, evidence: null, tokens: null }],
    });
  }

  get(id: string): ResearchCase {
    return ResearchCaseSchema.parse(JSON.parse(readFileSync(join(this.directory(id), "case.json"), "utf8")));
  }

  image(id: string): Buffer {
    return readFileSync(join(this.directory(id), "image.jpg"));
  }

  list(): CaseSummary[] {
    return readdirSync(this.cases).filter((name) => UUID.test(name) && existsSync(join(this.cases, name, "case.json")))
      .map((name) => this.get(name)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ id, title, updatedAt, scriptId, languageId, tokens, reviewState }) => ({ id, title, updatedAt, scriptId, languageId, tokens: tokens.length, reviewState }));
  }

  /** Applies a change only to the revision the caller saw, so a stale page cannot overwrite a correction. */
  update(id: string, expectedRevision: number, change: Change, apply: (record: ResearchCase) => void): ResearchCase {
    const record = this.get(id);
    if (record.revision !== expectedRevision) throw new AppError("conflict", "This case changed since you opened it. Reload it, then try again.");
    apply(record);
    const at = new Date().toISOString();
    record.revision += 1;
    record.updatedAt = at;
    record.history.push({ revision: record.revision, at, action: change.action, reviewer: change.reviewer ?? null, evidence: change.evidence ?? null,
      tokens: change.recordTokens ? structuredClone(record.tokens) : null });
    return this.save(record);
  }

  delete(id: string): void {
    rmSync(this.directory(id), { recursive: true, force: true });
    this.write(this.exemplarFile, JSON.stringify(this.exemplars().filter((exemplar) => exemplar.caseId !== id)));
  }

  exemplars(scriptId?: string): Exemplar[] {
    if (!existsSync(this.exemplarFile)) return [];
    const all = z.array(ExemplarSchema).parse(JSON.parse(readFileSync(this.exemplarFile, "utf8")));
    return scriptId ? all.filter((exemplar) => exemplar.scriptId === scriptId) : all;
  }

  addExemplar(exemplar: Omit<Exemplar, "id" | "createdAt">): Exemplar {
    const record: Exemplar = { ...exemplar, id: randomUUID(), createdAt: new Date().toISOString() };
    const others = this.exemplars().filter((item) => !(item.caseId === exemplar.caseId && item.tokenId === exemplar.tokenId));
    this.write(this.exemplarFile, JSON.stringify([...others, record]));
    return record;
  }
}
