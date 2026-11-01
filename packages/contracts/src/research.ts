import { z } from "zod";
import { AnalysisResultSchema, ScriptIdSchema } from "./analysis";
import { SourceRecordSchema } from "./reference";

const Id = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,80}$/);
const Note = z.string().trim().min(1).max(2000);

/** Where a piece of content came from. Every layer of a reading carries one, and the interface shows it. */
export const OriginSchema = z.enum(["ai_generated", "rule_based", "source_derived", "human_corrected", "expert_reviewed", "unverified"]);

/** `expert_reviewed` is reachable only through a named person's own attestation, never by code. */
export const SignReviewStatusSchema = z.enum(["unreviewed", "expert_reviewed"]);

export const SignKindSchema = z.enum(["letter", "consonant", "vowel", "vowel_sign"]);

export const SignRecordSchema = z.strictObject({
  id: Id,
  character: z.string().min(1).max(4),
  codePoint: z.string().regex(/^U\+[0-9A-F]{4,6}$/),
  name: z.string().min(1),
  kind: SignKindSchema,
  /** One sign can have several readings. All of them are kept. */
  values: z.array(z.string().min(1).max(8)).min(1),
  schemes: z.record(z.string(), z.string().min(1)),
  allographs: z.array(z.string().min(1)),
  reviewStatus: SignReviewStatusSchema,
});

export const TransliterationSchemeSchema = z.strictObject({ id: Id, label: z.string().min(1), reversible: z.boolean() });

export const SignInventorySchema = z.strictObject({
  scriptId: ScriptIdSchema,
  version: z.string().min(1),
  scope: z.string().min(1),
  inherentVowel: z.string().nullable(),
  schemes: z.array(TransliterationSchemeSchema).min(1),
  sourceIds: z.array(Id).min(1),
  signs: z.array(SignRecordSchema).min(1),
  limitations: z.array(z.string().min(1)).min(1),
});

export const LexicalEntrySchema = z.strictObject({
  id: Id,
  lemma: z.string().min(1),
  /** Lower-case romanised forms that this entry matches. A form is listed, never derived. */
  forms: z.array(z.string().min(1)).min(1),
  partOfSpeech: z.string().min(1),
  gloss: z.string().min(1),
  sourceIds: z.array(Id).min(1),
  locator: z.string().min(1),
});

export const LanguagePackSchema = z.strictObject({
  id: Id,
  name: z.string().min(1),
  /** Scripts this language may be written in. It never lets a script imply a language (ADR-032). */
  scriptIds: z.array(ScriptIdSchema).min(1),
  sources: z.array(SourceRecordSchema).min(1),
  entries: z.array(LexicalEntrySchema),
  limitations: z.array(z.string().min(1)).min(1),
});

export const LanguageSummarySchema = z.strictObject({
  id: Id, name: z.string(), scriptIds: z.array(z.string()), entryCount: z.number().int().nonnegative(), limitations: z.array(z.string()),
});

export const BoxSchema = z.strictObject({
  x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
  width: z.number().int().positive(), height: z.number().int().positive(),
});

/** How legible a token is. `unread` means no person or rule has offered a reading yet. */
export const TokenStatusSchema = z.enum(["unread", "certain", "uncertain", "damaged", "illegible", "lost", "unknown_sign"]);
const NEEDS_READING = new Set(["certain", "uncertain", "damaged"]);

/** A reading is a list of signs, so a ligature is one token holding several signs. */
export const ReadingSchema = z.strictObject({ signIds: z.array(Id).min(1).max(6), note: Note.nullable() });

export const SignTokenSchema = z.strictObject({
  id: Id,
  /** In the pixels of the stored image. Null for a sign with no visible trace, such as a restored gap. */
  box: BoxSchema.nullable(),
  /** Every reading is a live alternative. Array order is display order, not a ranking of truth. */
  readings: z.array(ReadingSchema).max(8),
  status: TokenStatusSchema,
  segmentationUncertain: z.boolean(),
  wordBreakAfter: z.boolean(),
  lineBreakAfter: z.boolean(),
  origin: OriginSchema,
  note: Note.nullable(),
}).superRefine((token, ctx) => {
  if (NEEDS_READING.has(token.status) && token.readings.length === 0) {
    ctx.addIssue({ code: "custom", message: `status '${token.status}' needs at least one reading` });
  }
  if (!NEEDS_READING.has(token.status) && token.readings.length > 0) {
    ctx.addIssue({ code: "custom", message: `status '${token.status}' cannot hold a reading` });
  }
  if (token.status === "certain" && token.readings.length > 1) {
    ctx.addIssue({ code: "custom", message: "alternative readings mean the status cannot be 'certain'" });
  }
});

export const ReviewerRoleSchema = z.enum(["researcher", "qualified_expert"]);
export const ReviewerSchema = z.strictObject({ name: z.string().trim().min(1).max(120), role: ReviewerRoleSchema });

export const ReviewStateSchema = z.enum(["not_reviewed", "in_review", "disputed", "unresolved", "approved_by_expert"]);

export const ImageProvenanceSchema = z.strictObject({
  sourceDescription: z.string().trim().max(1000),
  rights: z.string().trim().max(1000),
});

export const ImageMeasurementSchema = z.strictObject({
  method: z.literal("rule_based_measurement"),
  meanBrightness: z.number(),
  contrast: z.number(),
  sharpness: z.number(),
  flags: z.array(z.enum(["low_contrast", "blurred", "very_dark", "very_bright", "small_image"])),
  lineOrientation: z.enum(["horizontal", "vertical", "unclear"]),
  note: z.string(),
});

export const RevisionSchema = z.strictObject({
  revision: z.number().int().positive(),
  at: z.string(),
  action: z.string().min(1),
  reviewer: ReviewerSchema.nullable(),
  evidence: z.string().nullable(),
  /** The tokens as they stood after this change, so any earlier reading can be recovered. */
  tokens: z.array(SignTokenSchema).nullable(),
});

export const ResearchNoteSchema = z.strictObject({ id: z.string(), at: z.string(), author: z.string(), text: Note });
export const CitationSchema = z.strictObject({ id: z.string(), at: z.string(), text: Note, url: z.url().nullable() });

export const ResearchCaseSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().positive(),
  image: z.strictObject({
    sha256: z.string().regex(/^[0-9a-f]{64}$/), width: z.number().int().positive(), height: z.number().int().positive(),
    sourceFormat: z.string(), bytes: z.number().int().positive(),
  }),
  provenance: ImageProvenanceSchema,
  quality: ImageMeasurementSchema.nullable(),
  /** Set by a person. An analysis candidate never fills this, so a guess cannot select a reading system. */
  scriptId: ScriptIdSchema.nullable(),
  languageId: Id.nullable(),
  analysis: AnalysisResultSchema.nullable(),
  tokens: z.array(SignTokenSchema).max(2000),
  notes: z.array(ResearchNoteSchema),
  citations: z.array(CitationSchema),
  reviewState: ReviewStateSchema,
  history: z.array(RevisionSchema),
});

export const CaseSummarySchema = z.strictObject({
  id: z.uuid(), title: z.string(), updatedAt: z.string(), scriptId: z.string().nullable(), languageId: z.string().nullable(),
  tokens: z.number().int().nonnegative(), reviewState: ReviewStateSchema,
});

export const TransliterationSegmentSchema = z.strictObject({
  tokenIds: z.array(z.string()).min(1),
  /** Each alternative in Leiden-style notation. More than one means the ambiguity was preserved. */
  alternatives: z.array(z.string()).min(1),
  /** Bare letters for lookup. Null when the sign cannot be read. */
  plain: z.array(z.string()).nullable(),
  status: TokenStatusSchema,
  origin: OriginSchema,
});

export const TransliterationWordSchema = z.strictObject({
  segments: z.array(TransliterationSegmentSchema),
  lineBreakAfter: z.boolean(),
});

export const TransliterationSchema = z.strictObject({
  scriptId: ScriptIdSchema,
  scheme: Id,
  inventoryVersion: z.string(),
  method: z.literal("rule_based"),
  words: z.array(TransliterationWordSchema),
  text: z.string(),
  unresolvedTokens: z.number().int().nonnegative(),
  notation: z.string(),
  limitations: z.array(z.string()),
});

export const LexicalMatchSchema = z.strictObject({
  form: z.string(), entryId: z.string(), lemma: z.string(), partOfSpeech: z.string(), gloss: z.string(),
  sourceIds: z.array(z.string()), locator: z.string(),
});

export const WordAnalysisSchema = z.strictObject({
  tokenIds: z.array(z.string()),
  transliteration: z.string(),
  candidateForms: z.array(z.string()),
  matches: z.array(LexicalMatchSchema),
  state: z.enum(["matched", "ambiguous", "no_lexical_match", "unreadable", "too_many_alternatives"]),
});

export const TranslationStatusSchema = z.enum(["language_not_established", "no_readable_text", "partial", "all_words_matched"]);

/** Glosses set beside words. There is no sentence field, because no grammar has been applied. */
export const TranslationHypothesisSchema = z.strictObject({
  scriptId: ScriptIdSchema,
  languageId: Id.nullable(),
  status: TranslationStatusSchema,
  method: z.literal("lexicon_lookup"),
  words: z.array(WordAnalysisSchema),
  matchedWords: z.number().int().nonnegative(),
  unmatchedWords: z.number().int().nonnegative(),
  sources: z.array(SourceRecordSchema),
  reviewState: ReviewStateSchema,
  limitations: z.array(z.string()),
});

export const SignSuggestionSchema = z.strictObject({
  signId: z.string(), character: z.string(), similarity: z.number().min(0).max(1), exemplars: z.number().int().positive(),
});

export const TokenSuggestionsSchema = z.strictObject({
  tokenId: z.string(), suggestions: z.array(SignSuggestionSchema).max(3),
});

export const SuggestionReportSchema = z.strictObject({
  method: z.literal("exemplar_comparison"),
  exemplarCount: z.number().int().nonnegative(),
  note: z.string(),
  tokens: z.array(TokenSuggestionsSchema),
});

export const ExemplarSchema = z.strictObject({
  id: z.uuid(), scriptId: ScriptIdSchema, signId: Id, caseId: z.uuid(), tokenId: Id, approvedBy: ReviewerSchema, createdAt: z.string(),
  /** Fixed-size ink pattern, base64 encoded. It is a reduced copy of part of the image. */
  features: z.string().min(1),
});

/** The six kinds of data a research record can be. Only `held_out` may produce a reported result. */
export const DataSplitSchema = z.enum(["training", "validation", "held_out", "synthetic", "expert_reference", "unverified"]);

export const ResearchDatasetRecordSchema = z.strictObject({
  id: Id,
  split: DataSplitSchema,
  /** Physical object or source group. Two records with one group must share a split. */
  objectGroup: z.string().min(1),
  imageSha256: z.string().regex(/^[0-9a-f]{64}$/),
  originalSource: z.string().min(1),
  rights: z.string().min(1),
  scriptLabel: z.string().nullable(),
  languageLabel: z.string().nullable(),
  period: z.string().nullable(),
  region: z.string().nullable(),
  imageQuality: z.enum(["good", "fair", "poor"]).nullable(),
  damaged: z.boolean().nullable(),
  /** Reference text, exactly as published. Null means no ground truth exists, and none may be invented. */
  referenceText: z.string().nullable(),
  referenceTranslation: z.string().nullable(),
  references: z.array(z.string()),
  annotationReviewer: z.string().nullable(),
  qualityStatus: z.enum(["unreviewed", "source_checked", "expert_reviewed"]),
}).superRefine((record, ctx) => {
  if (record.qualityStatus === "expert_reviewed" && !record.annotationReviewer) {
    ctx.addIssue({ code: "custom", message: "expert_reviewed needs a named reviewer" });
  }
  if (record.split === "expert_reference" && record.qualityStatus !== "expert_reviewed") {
    ctx.addIssue({ code: "custom", message: "the expert_reference split needs expert_reviewed records" });
  }
});

export const CreateCaseFieldsSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  sourceDescription: z.string().trim().max(1000).default(""),
  rights: z.string().trim().max(1000).default(""),
});

export const UpdateCaseSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  scriptId: ScriptIdSchema.nullable().optional(),
  languageId: Id.nullable().optional(),
});

export const SaveTokensSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  tokens: z.array(SignTokenSchema).max(2000),
  reviewer: ReviewerSchema,
  evidence: z.string().trim().min(1).max(2000).nullable(),
});

export const SegmentRequestSchema = z.strictObject({ expectedRevision: z.number().int().positive() });

export const AddNoteSchema = z.strictObject({
  expectedRevision: z.number().int().positive(), author: z.string().trim().min(1).max(120), text: Note,
});

export const AddCitationSchema = z.strictObject({
  expectedRevision: z.number().int().positive(), text: Note,
  url: z.url().refine((url) => url.startsWith("https://"), "citations must use https").nullable(),
});

export const ReviewRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  state: ReviewStateSchema,
  reviewer: ReviewerSchema,
  evidence: z.string().trim().min(1).max(2000),
  /** The reviewer's own statement of qualification. It is required for expert approval, and the app cannot check it. */
  attestsQualified: z.boolean(),
}).superRefine((request, ctx) => {
  if (request.state === "approved_by_expert" && !(request.reviewer.role === "qualified_expert" && request.attestsQualified)) {
    ctx.addIssue({ code: "custom", message: "only a qualified expert's own attestation can approve" });
  }
});

export const AddExemplarSchema = z.strictObject({ tokenId: Id, approvedBy: ReviewerSchema });

export type Origin = z.infer<typeof OriginSchema>;
export type SignRecord = z.infer<typeof SignRecordSchema>;
export type SignInventory = z.infer<typeof SignInventorySchema>;
export type LanguagePack = z.infer<typeof LanguagePackSchema>;
export type LanguageSummary = z.infer<typeof LanguageSummarySchema>;
export type Box = z.infer<typeof BoxSchema>;
export type TokenStatus = z.infer<typeof TokenStatusSchema>;
export type SignToken = z.infer<typeof SignTokenSchema>;
export type Reviewer = z.infer<typeof ReviewerSchema>;
export type ReviewState = z.infer<typeof ReviewStateSchema>;
export type ImageQualityReport = z.infer<typeof ImageMeasurementSchema>;
export type ResearchCase = z.infer<typeof ResearchCaseSchema>;
export type CaseSummary = z.infer<typeof CaseSummarySchema>;
export type Transliteration = z.infer<typeof TransliterationSchema>;
export type TransliterationSegment = z.infer<typeof TransliterationSegmentSchema>;
export type TranslationHypothesis = z.infer<typeof TranslationHypothesisSchema>;
export type WordAnalysis = z.infer<typeof WordAnalysisSchema>;
export type SuggestionReport = z.infer<typeof SuggestionReportSchema>;
export type Exemplar = z.infer<typeof ExemplarSchema>;
export type ResearchDatasetRecord = z.infer<typeof ResearchDatasetRecordSchema>;
