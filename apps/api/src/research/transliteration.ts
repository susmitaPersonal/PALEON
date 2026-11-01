import type { SignInventory, SignRecord, SignToken, Transliteration, TransliterationSegment } from "@scriptecho/contracts";

const NOTATION = "Leiden-style: a dot below marks a damaged or uncertain letter, + an illegible sign, [...] lost text, ? an unread or unknown sign, and a/b alternative readings.";
const UNDERDOT = "̣";
const OPAQUE: Partial<Record<SignToken["status"], string>> = { illegible: "+", lost: "[...]", unread: "?", unknown_sign: "?" };

const dotted = (text: string) => [...text.normalize("NFD")].map((char) => (/\p{L}/u.test(char) ? char + UNDERDOT : char)).join("").normalize("NFC");

function signValues(sign: SignRecord, scheme: string): string[] {
  if (scheme === "conventional") return sign.values;
  return [sign.schemes[scheme] ?? sign.values[0]!];
}

/** Every way of joining the signs of one reading. A vowel sign replaces the inherent vowel of the sign before it. */
function readingForms(signs: SignRecord[], scheme: string, inherent: string | null): string[] {
  let forms = [""];
  for (const sign of signs) {
    const values = signValues(sign, scheme);
    forms = forms.flatMap((form) => values.map((value) => {
      if (scheme === "conventional" && sign.kind === "vowel_sign" && inherent && form.endsWith(inherent)) {
        return form.slice(0, -inherent.length) + value;
      }
      return form + value;
    }));
  }
  return [...new Set(forms)];
}

function segmentFor(token: SignToken, inventory: SignInventory, scheme: string): TransliterationSegment {
  const base = { tokenIds: [token.id], status: token.status, origin: token.origin };
  const opaque = OPAQUE[token.status];
  if (opaque) return { ...base, alternatives: [opaque], plain: null };
  const bySign = new Map(inventory.signs.map((sign) => [sign.id, sign]));
  const plain = [...new Set(token.readings.flatMap((reading) => {
    const signs = reading.signIds.map((id) => bySign.get(id));
    if (signs.some((sign) => !sign)) throw new Error(`unknown sign in token ${token.id}`);
    return readingForms(signs as SignRecord[], scheme, inventory.inherentVowel);
  }))];
  return { ...base, alternatives: token.status === "certain" ? plain : plain.map(dotted), plain };
}

/** A following vowel sign joins the consonant before it, and keeps a trace to both tokens. */
function attachVowelSign(previous: TransliterationSegment, vowel: TransliterationSegment, inherent: string): TransliterationSegment {
  const join = (form: string, value: string) => (form.endsWith(inherent) ? form.slice(0, -inherent.length) + value : form + value);
  const combine = (first: string[], second: string[]) => [...new Set(first.flatMap((form) => second.map((value) => join(form, value))))];
  const order = ["certain", "uncertain", "damaged"];
  const status = order[Math.max(order.indexOf(previous.status), order.indexOf(vowel.status))] as SignToken["status"];
  const plain = combine(previous.plain!, vowel.plain!);
  return { tokenIds: [...previous.tokenIds, ...vowel.tokenIds], status, origin: previous.origin === vowel.origin ? previous.origin : "unverified",
    alternatives: status === "certain" ? plain : plain.map(dotted), plain };
}

const isVowelSign = (token: SignToken, inventory: SignInventory) => token.readings.length > 0 && token.readings.every((reading) =>
  reading.signIds.length === 1 && inventory.signs.find((sign) => sign.id === reading.signIds[0])?.kind === "vowel_sign");

/** Rules only. Tokens are read in stored order, so the person who orders them decides the reading direction. */
export function transliterate(tokens: SignToken[], inventory: SignInventory, scheme = "conventional"): Transliteration {
  if (!inventory.schemes.some((item) => item.id === scheme)) throw new RangeError(`unknown scheme ${scheme}`);
  const words: Transliteration["words"] = [];
  let segments: TransliterationSegment[] = [];
  tokens.forEach((token, index) => {
    const segment = segmentFor(token, inventory, scheme);
    const previous = segments.at(-1);
    if (scheme === "conventional" && inventory.inherentVowel && previous?.plain && segment.plain && isVowelSign(token, inventory)) {
      segments[segments.length - 1] = attachVowelSign(previous, segment, inventory.inherentVowel);
    } else {
      segments.push(segment);
    }
    if (token.wordBreakAfter || token.lineBreakAfter || index === tokens.length - 1) {
      words.push({ segments, lineBreakAfter: token.lineBreakAfter });
      segments = [];
    }
  });
  const text = words.map((word, index) => {
    const body = word.segments.map((segment) => (segment.alternatives.length > 1 ? `(${segment.alternatives.join("/")})` : segment.alternatives[0])).join("");
    return body + (index === words.length - 1 ? "" : word.lineBreakAfter ? "\n" : " ");
  }).join("");
  return {
    scriptId: inventory.scriptId, scheme, inventoryVersion: inventory.version, method: "rule_based", words, text,
    unresolvedTokens: tokens.filter((token) => token.status !== "certain").length, notation: NOTATION, limitations: inventory.limitations,
  };
}

/** Maps a reversible transliteration back to sign IDs, or null if any character is not in the scheme. */
export function reverseTransliteration(text: string, inventory: SignInventory, scheme: string): string[] | null {
  if (!inventory.schemes.find((item) => item.id === scheme)?.reversible) return null;
  const lookup = new Map(inventory.signs.map((sign) => [sign.schemes[scheme], sign.id]));
  const signs = [...text].map((char) => lookup.get(char));
  return signs.every(Boolean) ? (signs as string[]) : null;
}
