import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processImage } from "@/lib/boards/media";

/** A JPEG carrying EXIF with GPS coordinates and a 90° orientation flag, like a phone photo. */
async function phonePhoto() {
  return sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 128, g: 100, b: 245 } } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Make: "TestPhone", Model: "X1" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "19/1 4/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "72/1 52/1 0/1" } } })
    .toBuffer();
}

describe("processImage", () => {
  it("removes EXIF and GPS metadata and applies the orientation", async () => {
    const input = await phonePhoto();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();
    const out = await processImage(input);
    const after = await sharp(out.full).metadata();
    expect(after.format).toBe("webp");
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.orientation ?? 1).toBe(1);
    // Orientation 6 (rotate 90°) turns 400×200 into 200×400.
    expect([out.width, out.height]).toEqual([200, 400]);
    expect((await sharp(out.thumb).metadata()).exif).toBeUndefined();
  });

  it("caps the stored size and makes a smaller thumbnail", async () => {
    const big = await sharp({ create: { width: 5000, height: 2500, channels: 3, background: "#ffc7b1" } }).png().toBuffer();
    const out = await processImage(big);
    expect(Math.max(out.width, out.height)).toBe(2400);
    const thumb = await sharp(out.thumb).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(640);
  });

  it("rejects files that are not images", async () => {
    await expect(processImage(Buffer.from("not an image"))).rejects.toThrow();
  });
});
