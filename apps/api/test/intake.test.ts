import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processUpload, sniffFormat } from "../src/services/intake";
import { jpeg, png } from "./helpers";

const LIMITS = { maxBytes: 8_000_000, maxPixels: 1_000_000, maxEdge: 2048 };
const code = (promise: Promise<unknown>) => promise.then(() => "passed", (error) => error.code);

describe("format detection", () => {
  it("uses content, not names", async () => {
    expect(sniffFormat(await png())).toBe("png");
    expect(sniffFormat(await jpeg())).toBe("jpeg");
    expect(sniffFormat(await sharp({ create: { width: 2, height: 2, channels: 3, background: "#000" } }).webp().toBuffer())).toBe("webp");
  });

  it.each([
    ["svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["html", Buffer.from("<html><script>alert(1)</script></html>")],
    ["gif", Buffer.from("GIF89a\x01\x00\x01\x00")],
    ["pdf", Buffer.from("%PDF-1.7")],
    ["short", Buffer.from([0xff])],
  ])("rejects %s", async (_name, data) => {
    expect(sniffFormat(data)).toBeNull();
    expect(await code(processUpload(data, LIMITS))).toBe("unsupported_media_type");
  });
});

describe("processUpload", () => {
  it("rejects an empty file", async () => {
    expect(await code(processUpload(Buffer.alloc(0), LIMITS))).toBe("invalid_request");
  });

  it("rejects an oversized file before decoding", async () => {
    expect(await code(processUpload(Buffer.alloc(11), { ...LIMITS, maxBytes: 10 }))).toBe("file_too_large");
  });

  it("rejects a truncated image", async () => {
    const whole = await jpeg(400, 300);
    expect(await code(processUpload(whole.subarray(0, whole.length / 2), LIMITS))).toBe("undecodable_image");
  });

  it("rejects valid magic bytes with no image", async () => {
    expect(await code(processUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), LIMITS))).toBe("undecodable_image");
  });

  it("rejects too many pixels", async () => {
    expect(await code(processUpload(await png(100, 100), { ...LIMITS, maxPixels: 99 }))).toBe("image_too_large");
  });

  it("rejects animation", async () => {
    const frame = (background: string) => sharp({ create: { width: 4, height: 4, channels: 3, background } }).png().toBuffer();
    const animated = await sharp([await frame("#000"), await frame("#fff")], { join: { animated: true } }).webp().toBuffer();
    expect(await code(processUpload(animated, LIMITS))).toBe("unsupported_media_type");
  });

  it("removes EXIF metadata and applies orientation", async () => {
    const source = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#864" } })
      .withMetadata({ orientation: 6 }).withExifMerge({ IFD0: { Make: "SecretCamera" } }).jpeg().toBuffer();
    expect(source.includes("SecretCamera")).toBe(true);
    const result = await processUpload(source, LIMITS);
    expect(result.bytes.includes("SecretCamera")).toBe(false);
    expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
    expect([result.width, result.height]).toEqual([20, 40]);
  });

  it("drops data appended after the image", async () => {
    const polyglot = Buffer.concat([await jpeg(), Buffer.from("<script>alert(1)</script>")]);
    const result = await processUpload(polyglot, LIMITS);
    expect(result.bytes.includes("<script>")).toBe(false);
  });

  it("limits the longest edge and never enlarges", async () => {
    expect((await processUpload(await png(300, 100), { ...LIMITS, maxEdge: 150 })).width).toBe(150);
    expect((await processUpload(await png(30, 10), LIMITS)).width).toBe(30);
  });

  it("flattens transparency to a known background", async () => {
    const clear = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    expect((await processUpload(clear, LIMITS)).mimeType).toBe("image/jpeg");
  });
});
