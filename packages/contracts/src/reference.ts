import { z } from "zod";
import { ScriptIdSchema } from "./analysis";

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9_.-]+$/);

export const SourceRecordSchema = z.strictObject({
  id: IdSchema,
  title: z.string().min(1),
  publisher: z.string().min(1),
  year: z.number().int(),
  url: z.url().refine((url) => url.startsWith("https://"), "sources must use https"),
  accessedOn: z.iso.date(),
  /** How the text was read. A search excerpt never counts as reading the source directly. */
  accessMethod: z.enum(["read_directly", "search_excerpt"]),
  reuseNote: z.string().min(1),
});

export const ClaimSchema = z.strictObject({
  id: IdSchema,
  text: z.string().min(1),
  sourceIds: z.array(IdSchema).min(1),
  locator: z.string().min(1),
});

/** A trait makes a claim comparable between scripts. It must point at a stored claim. */
export const TraitSchema = z.strictObject({
  key: z.enum(["writing_direction", "structure", "letter_form"]),
  value: z.string().min(1),
  claimId: IdSchema,
});

export const ReferenceCharacterSchema = z.strictObject({
  character: z.string().min(1).max(4),
  codePoint: z.string().regex(/^U\+[0-9A-F]{4,6}$/),
  name: z.string().min(1),
});

export const VerificationStatusSchema = z.enum(["source_checked_not_expert_reviewed", "expert_reviewed"]);

export const ScriptRecordSchema = z.strictObject({
  id: ScriptIdSchema,
  name: z.string().min(1),
  alternativeNames: z.array(z.string()),
  historicalPeriod: ClaimSchema.nullable(),
  geographicDistribution: ClaimSchema.nullable(),
  directionality: ClaimSchema.nullable(),
  characteristics: z.array(ClaimSchema),
  relationships: z.array(ClaimSchema),
  traits: z.array(TraitSchema),
  referenceCharacters: z.array(ReferenceCharacterSchema),
  verificationStatus: VerificationStatusSchema,
  limitations: z.array(z.string().min(1)).min(1),
});

export const ReferenceCollectionSchema = z.strictObject({
  version: z.string().min(1),
  scripts: z.array(ScriptRecordSchema).min(1),
  sources: z.array(SourceRecordSchema).min(1),
  visualTerms: z.array(z.string().regex(/^\p{Ll}+$/u)).min(1),
});

export const ScriptSummarySchema = z.strictObject({
  id: ScriptIdSchema,
  name: z.string(),
  alternativeNames: z.array(z.string()),
  verificationStatus: VerificationStatusSchema,
  incompleteFields: z.array(z.string()),
});

export const ScriptDetailSchema = z.strictObject({
  script: ScriptRecordSchema,
  sources: z.array(SourceRecordSchema),
  incompleteFields: z.array(z.string()),
  characterNote: z.string(),
});

export const ComparisonPointSchema = z.strictObject({
  topic: z.string(),
  first: z.string().nullable(),
  second: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const ComparisonSchema = z.strictObject({
  first: z.strictObject({ id: z.string(), name: z.string() }),
  second: z.strictObject({ id: z.string(), name: z.string() }),
  shared: z.array(ComparisonPointSchema),
  differences: z.array(ComparisonPointSchema),
  missingEvidence: z.array(z.string()),
  referenceCharacters: z.strictObject({
    first: z.array(ReferenceCharacterSchema),
    second: z.array(ReferenceCharacterSchema),
  }),
  sources: z.array(SourceRecordSchema),
  caveat: z.string(),
});

export type SourceRecord = z.infer<typeof SourceRecordSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ScriptRecord = z.infer<typeof ScriptRecordSchema>;
export type ReferenceCollection = z.infer<typeof ReferenceCollectionSchema>;
export type ScriptSummary = z.infer<typeof ScriptSummarySchema>;
export type ScriptDetail = z.infer<typeof ScriptDetailSchema>;
export type Comparison = z.infer<typeof ComparisonSchema>;
export type ReferenceCharacter = z.infer<typeof ReferenceCharacterSchema>;
