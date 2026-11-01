import sharp from "sharp";
import { AppError } from "../errors";

export const ACCEPTED_FORMATS = ["jpeg", "png", "webp"] as const;

export type ProcessedImage = {
  bytes: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  sourceFormat: string;
};

type Limits = { maxBytes: number; maxPixels: number; maxEdge: number };

/** Identifies the format from file content. The filename and declared type are never trusted. */
export function sniffFormat(data: Uint8Array): (typeof ACCEPTED_FORMATS)[number] | null {
  const starts = (bytes: number[], offset = 0) => bytes.every((byte, index) => data[offset + index] === byte);
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

/**
 * Validates and re-encodes an upload in memory. No temporary file is written. Decoding every pixel
 * catches truncated files, and re-encoding drops EXIF data, including GPS, and any appended payload.
 */
export async function processUpload(data: Buffer, limits: Limits): Promise<ProcessedImage> {
  if (data.length === 0) throw new AppError("invalid_request", "The uploaded file is empty.");
  if (data.length > limits.maxBytes) throw new AppError("file_too_large", "The uploaded file is too large.");
  const sourceFormat = sniffFormat(data);
  if (!sourceFormat) throw new AppError("unsupported_media_type", "Upload a JPEG, PNG, or WebP image.");

  const pipeline = () => sharp(data, { limitInputPixels: limits.maxPixels, failOn: "error", animated: false });
  try {
    const metadata = await pipeline().metadata();
    if ((metadata.pages ?? 1) > 1) {
      throw new AppError("unsupported_media_type", "Animated or multi-page images are not supported.");
    }
    const { data: bytes, info } = await pipeline()
      .rotate()
      .resize({ width: limits.maxEdge, height: limits.maxEdge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    return { bytes, mimeType: "image/jpeg", width: info.width, height: info.height, sourceFormat };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/pixel limit/i.test(message)) throw new AppError("image_too_large", "The image has too many pixels.");
    throw new AppError("undecodable_image", "The file could not be decoded as an image.");
  }
}
