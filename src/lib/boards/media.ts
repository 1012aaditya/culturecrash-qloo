import "server-only";
import sharp from "sharp";
import { assertPublicUrl } from "@/lib/research/deep/url";

/** Longest edge of the stored full image and of the card thumbnail, in pixels. */
const FULL_EDGE = 2400;
const THUMB_EDGE = 640;
/** Rejects decompression bombs before decoding (about 64 megapixels). */
const MAX_INPUT_PIXELS = 64_000_000;

export type ProcessedImage = { full: Buffer; thumb: Buffer; width: number; height: number };

/**
 * Re-encodes an upload as WebP: applies EXIF orientation, then drops all metadata (EXIF, GPS, XMP, ICC
 * except sRGB conversion) because sharp writes none unless asked. Animated GIFs stay animated.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const animated = { animated: true, limitInputPixels: MAX_INPUT_PIXELS } as const;
  const meta = await sharp(input, animated).metadata();
  if (!meta.width || !meta.height) throw new Error("Not a readable image");
  const pipeline = (edge: number, quality: number) =>
    sharp(input, animated).rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true }).webp({ quality, effort: 4 });
  const [full, thumb] = await Promise.all([pipeline(FULL_EDGE, 86).toBuffer({ resolveWithObject: true }), pipeline(THUMB_EDGE, 78).toBuffer()]);
  const pageHeight = meta.pageHeight ?? full.info.height;
  return { full: full.data, thumb, width: full.info.width, height: Math.min(full.info.height, pageHeight || full.info.height) };
}

const UA = "CultureCrashBot/1.0 (+link preview)";
const MAX_HTML = 512 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;

/** GET with every redirect hop re-checked against private and internal addresses. */
async function guardedFetch(url: string, accept: string): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u.toString(), { headers: { "User-Agent": UA, Accept: accept }, redirect: "manual", signal: AbortSignal.timeout(7000), cache: "no-store" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel();
      current = new URL(loc, u).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function meta(html: string, keys: string[]): string | null {
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content?.trim()) return decode(content.trim());
  }
  return null;
}
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export type LinkPreview = { title: string | null; siteName: string | null; description: string | null; image: ProcessedImage | null };

/**
 * Title, site name, description and preview image of a public page. The preview image is downloaded
 * server-side and re-encoded, so viewers never load third-party image URLs from the board.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const res = await guardedFetch(url, "text/html,application/xhtml+xml");
  if (!res.ok || !/text\/html|xhtml/i.test(res.headers.get("content-type") ?? "")) {
    await res.body?.cancel();
    return { title: null, siteName: null, description: null, image: null };
  }
  const html = (await readCapped(res, MAX_HTML))?.toString("utf8") ?? "";
  const title = meta(html, ["og:title", "twitter:title"]) ?? (html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)![1].trim()) : null);
  const imageUrl = meta(html, ["og:image", "og:image:url", "twitter:image"]);
  let image: ProcessedImage | null = null;
  if (imageUrl) {
    try {
      const abs = new URL(imageUrl, url).toString();
      const imgRes = await guardedFetch(abs, "image/*");
      if (imgRes.ok && /^image\//i.test(imgRes.headers.get("content-type") ?? "")) {
        const buf = await readCapped(imgRes, MAX_IMAGE);
        if (buf) image = await processImage(buf);
      } else {
        await imgRes.body?.cancel();
      }
    } catch {
      image = null;
    }
  }
  return {
    title: title?.slice(0, 200) ?? null,
    siteName: meta(html, ["og:site_name", "application-name"])?.slice(0, 120) ?? null,
    description: meta(html, ["og:description", "description", "twitter:description"])?.slice(0, 600) ?? null,
    image,
  };
}
