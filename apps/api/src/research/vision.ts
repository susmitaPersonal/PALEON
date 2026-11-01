import sharp from "sharp";
import type { Box, ImageQualityReport, Reviewer, SignToken } from "@scriptecho/contracts";

const WORKING_EDGE = 1000;
const MAX_TOKENS = 400;
const TEXTURE_LINE_SHARE = 0.3;
const TEXTURE_MIN_LINES = 8;
const FEATURE_SIZE = 24;
const LOW_CONTRAST = 20;
const BLURRED = 6;
const SMALL_IMAGE = 300;
const QUALITY_NOTE = "Pixel measurements with fixed thresholds. They flag likely problems and are not a calibrated judgement of the inscription.";

export type GrayImage = { data: Uint8Array; width: number; height: number };

export async function decodeGray(bytes: Buffer, maxEdge = WORKING_EDGE): Promise<GrayImage> {
  const { data, info } = await sharp(bytes).resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const LAPLACIAN = { width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 };

function variance(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length || 1);
}

/** Text lines make brightness swing from row to row more than from column to column. */
function lineOrientation({ data, width, height }: GrayImage): ImageQualityReport["lineOrientation"] {
  const rows = new Array<number>(height).fill(0);
  const columns = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const value = data[y * width + x]!;
    rows[y]! += value / width;
    columns[x]! += value / height;
  }
  const byRow = variance(rows);
  const byColumn = variance(columns);
  if (byRow > byColumn * 1.5) return "horizontal";
  if (byColumn > byRow * 1.5) return "vertical";
  return "unclear";
}

export async function measureQuality(bytes: Buffer): Promise<ImageQualityReport> {
  const gray = await decodeGray(bytes);
  const stats = await sharp(gray.data, { raw: { width: gray.width, height: gray.height, channels: 1 } }).stats();
  // `stats()` reads the input and ignores pipeline operations, so the filtered pixels must be rendered first.
  const edges = await sharp(gray.data, { raw: { width: gray.width, height: gray.height, channels: 1 } }).convolve(LAPLACIAN).raw().toBuffer();
  const meanBrightness = stats.channels[0]!.mean;
  const contrast = stats.channels[0]!.stdev;
  const sharpness = Math.sqrt(variance(Array.from(edges)));
  const flags: ImageQualityReport["flags"] = [];
  if (contrast < LOW_CONTRAST) flags.push("low_contrast");
  if (sharpness < BLURRED) flags.push("blurred");
  if (meanBrightness < 40) flags.push("very_dark");
  if (meanBrightness > 215) flags.push("very_bright");
  if (Math.max(gray.width, gray.height) < SMALL_IMAGE) flags.push("small_image");
  const round = (value: number) => Math.round(value * 10) / 10;
  return { method: "rule_based_measurement", meanBrightness: round(meanBrightness), contrast: round(contrast), sharpness: round(sharpness),
    flags, lineOrientation: lineOrientation(gray), note: QUALITY_NOTE };
}

/** Marks pixels that differ from their local background, keeping whichever of darker or lighter is the rarer. */
async function inkMask(gray: GrayImage): Promise<Uint8Array> {
  const sigma = Math.max(2, Math.max(gray.width, gray.height) / 40);
  const background = await sharp(gray.data, { raw: { width: gray.width, height: gray.height, channels: 1 } }).blur(sigma).raw().toBuffer();
  const darker = new Uint8Array(gray.data.length);
  const lighter = new Uint8Array(gray.data.length);
  let darkCount = 0;
  let lightCount = 0;
  const margin = 18;
  for (let index = 0; index < gray.data.length; index += 1) {
    const difference = gray.data[index]! - background[index]!;
    if (difference < -margin) { darker[index] = 1; darkCount += 1; }
    if (difference > margin) { lighter[index] = 1; lightCount += 1; }
  }
  return darkCount > 0 && (lightCount === 0 || darkCount <= lightCount) ? darker : lighter;
}

type Component = Box & { area: number };

function components(mask: Uint8Array, width: number, height: number): Component[] {
  const found: Component[] = [];
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let minX = width, minY = height, maxX = 0, maxY = 0, area = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;
      area += 1;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
      }
    }
    found.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area });
  }
  return found;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/**
 * Proposes one box per connected mark and groups them into lines. This is a proposal for a person to correct:
 * touching signs merge, and broken signs split, so a proposed box is never a recognised sign.
 */
export async function segmentSigns(bytes: Buffer, original: { width: number; height: number }, rightToLeft: boolean): Promise<SignToken[]> {
  const gray = await decodeGray(bytes);
  const mask = await inkMask(gray);
  const minArea = Math.max(12, gray.width * gray.height * 0.00005);
  let marks = components(mask, gray.width, gray.height).filter((mark) => mark.area >= minArea && mark.height <= gray.height * 0.7
    && mark.width <= gray.width * 0.7 && mark.area / (mark.width * mark.height) >= 0.04);
  if (marks.length > MAX_TOKENS) marks = marks.sort((a, b) => b.area - a.area).slice(0, MAX_TOKENS);
  if (marks.length === 0) return [];
  const typicalHeight = median(marks.map((mark) => mark.height));
  const typicalWidth = median(marks.map((mark) => mark.width));
  const lines: Component[][] = [];
  for (const mark of [...marks].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2))) {
    const centre = mark.y + mark.height / 2;
    const line = lines.find((items) => Math.abs(items.reduce((sum, item) => sum + item.y + item.height / 2, 0) / items.length - centre) < typicalHeight * 0.6);
    if (line) line.push(mark); else lines.push([mark]);
  }
  const scaleX = original.width / gray.width;
  const scaleY = original.height / gray.height;
  const tokens: SignToken[] = [];
  for (const line of lines) {
    line.sort((a, b) => (rightToLeft ? b.x - a.x : a.x - b.x));
    line.forEach((mark, index) => {
      const x = Math.floor(mark.x * scaleX);
      const y = Math.floor(mark.y * scaleY);
      tokens.push({
        id: `t${String(tokens.length + 1).padStart(4, "0")}`,
        box: { x, y, width: Math.max(1, Math.min(original.width - x, Math.ceil(mark.width * scaleX))), height: Math.max(1, Math.min(original.height - y, Math.ceil(mark.height * scaleY))) },
        readings: [], status: "unread", origin: "rule_based", note: null,
        segmentationUncertain: mark.width > typicalWidth * 1.8 || mark.height < typicalHeight * 0.5,
        wordBreakAfter: false, lineBreakAfter: index === line.length - 1,
      });
    });
  }
  // Far more lines than a text would have, or the cap reached, means surface texture was found rather than signs.
  const textured = marks.length >= MAX_TOKENS || (lines.length >= TEXTURE_MIN_LINES && lines.length > tokens.length * TEXTURE_LINE_SHARE);
  return textured ? tokens.map((token) => ({ ...token, segmentationUncertain: true })) : tokens;
}

/** True when the proposal flagged every box, which is how a textured surface is reported. */
export const looksLikeTexture = (tokens: SignToken[]) => tokens.length > 0 && tokens.every((token) => token.segmentationUncertain);

/** Reduces a box to a fixed ink pattern, so two signs of different sizes can be compared. */
export function signFeatures(image: GrayImage, box: Box, original: { width: number; height: number }): Uint8Array {
  const scaleX = image.width / original.width;
  const scaleY = image.height / original.height;
  const left = Math.floor(box.x * scaleX);
  const top = Math.floor(box.y * scaleY);
  const spanX = Math.max(1, Math.ceil(box.width * scaleX));
  const spanY = Math.max(1, Math.ceil(box.height * scaleY));
  const samples = new Uint8Array(FEATURE_SIZE * FEATURE_SIZE);
  let total = 0;
  for (let y = 0; y < FEATURE_SIZE; y += 1) for (let x = 0; x < FEATURE_SIZE; x += 1) {
    const px = Math.min(image.width - 1, left + Math.floor((x + 0.5) * spanX / FEATURE_SIZE));
    const py = Math.min(image.height - 1, top + Math.floor((y + 0.5) * spanY / FEATURE_SIZE));
    const value = image.data[py * image.width + px]!;
    samples[y * FEATURE_SIZE + x] = value;
    total += value;
  }
  const mean = total / samples.length;
  const bits = samples.map((value) => (value < mean ? 1 : 0));
  const ink = bits.reduce((sum, bit) => sum + bit, 0);
  return ink > bits.length / 2 ? bits.map((bit) => 1 - bit) : bits;
}

function thicken(bits: Uint8Array): Uint8Array {
  const wide = new Uint8Array(bits.length);
  for (let y = 0; y < FEATURE_SIZE; y += 1) for (let x = 0; x < FEATURE_SIZE; x += 1) {
    if (!bits[y * FEATURE_SIZE + x]) continue;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < FEATURE_SIZE && ny < FEATURE_SIZE) wide[ny * FEATURE_SIZE + nx] = 1;
    }
  }
  return wide;
}

/** Share of ink in one pattern that lands near ink in the other, both ways. It is a shape overlap, not a probability. */
export function featureSimilarity(first: Uint8Array, second: Uint8Array): number {
  const covered = (a: Uint8Array, b: Uint8Array) => {
    const near = thicken(b);
    const ink = a.reduce((sum, bit) => sum + bit, 0);
    return ink === 0 ? 0 : a.reduce((sum, bit, index) => sum + (bit && near[index] ? 1 : 0), 0) / ink;
  };
  return Math.min(covered(first, second), covered(second, first));
}

export const encodeFeatures = (bits: Uint8Array) => Buffer.from(bits).toString("base64");
export const decodeFeatures = (text: string) => new Uint8Array(Buffer.from(text, "base64"));
export type { Reviewer };
