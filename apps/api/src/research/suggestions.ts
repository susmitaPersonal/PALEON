import type { Exemplar, ResearchCase, SignInventory, SuggestionReport } from "@scriptecho/contracts";
import { decodeFeatures, featureSimilarity, signFeatures, type GrayImage } from "./vision";

const MIN_SIMILARITY = 0.5;
const MAX_SUGGESTIONS = 3;
const NOTE = "Shape overlap with signs a person has approved. The number is not a probability, and a suggestion becomes a reading only when a person accepts it.";

/** Compares each unread sign with approved examples of the same script. A sign is never compared with itself. */
export function suggestReadings(record: ResearchCase, image: GrayImage, inventory: SignInventory, exemplars: Exemplar[]): SuggestionReport {
  const decoded = exemplars.map((exemplar) => ({ exemplar, features: decodeFeatures(exemplar.features) }));
  const tokens = record.tokens.filter((token) => token.box && (token.status === "unread" || token.status === "uncertain")).map((token) => {
    const features = signFeatures(image, token.box!, record.image);
    const best = new Map<string, { similarity: number; exemplars: number }>();
    for (const { exemplar, features: known } of decoded) {
      if (exemplar.caseId === record.id && exemplar.tokenId === token.id) continue;
      const similarity = featureSimilarity(features, known);
      const current = best.get(exemplar.signId) ?? { similarity: 0, exemplars: 0 };
      best.set(exemplar.signId, { similarity: Math.max(current.similarity, similarity), exemplars: current.exemplars + 1 });
    }
    const suggestions = [...best].filter(([, value]) => value.similarity >= MIN_SIMILARITY)
      .sort((a, b) => b[1].similarity - a[1].similarity).slice(0, MAX_SUGGESTIONS)
      .flatMap(([signId, value]) => {
        const sign = inventory.signs.find((item) => item.id === signId);
        return sign ? [{ signId, character: sign.character, similarity: Math.round(value.similarity * 100) / 100, exemplars: value.exemplars }] : [];
      });
    return { tokenId: token.id, suggestions };
  });
  return { method: "exemplar_comparison", exemplarCount: exemplars.length, note: NOTE, tokens };
}
