import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export function isImageFile(fileName: string, mimeType?: string): boolean {
  if (mimeType && ALLOWED_IMAGE_TYPES.has(mimeType.toLowerCase())) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(fileName);
}

export function normalizeImageMimeType(fileName: string, mimeType?: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const m = (mimeType ?? "").toLowerCase();
  if (ALLOWED_IMAGE_TYPES.has(m)) return m as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  if (/\.gif$/i.test(fileName)) return "image/gif";
  return "image/jpeg";
}

/**
 * Extracts visual aesthetics, subcultures, and audience taste tags from a moodboard
 * or creative asset image using Claude Vision.
 */
export async function extractVisualAesthetics(bytes: Buffer, fileName: string, mimeType?: string): Promise<string> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) {
    return [
      `[Visual Moodboard: ${fileName}]`,
      "No Anthropic API key is configured. Claude Vision could not run.",
      "To extract cultural taste tags from visual assets, configure ANTHROPIC_API_KEY in your environment.",
    ].join("\n\n");
  }

  const client = new Anthropic({ apiKey: e.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  const mediaType = normalizeImageMimeType(fileName, mimeType);
  const base64Data = bytes.toString("base64");

  const prompt = `You are a cultural intelligence and visual brand strategist analyzing a creative asset or moodboard for a brand strategy brief.
Carefully examine this image and provide a structured visual and cultural breakdown:

### Visual Aesthetic & Mood
Identify the aesthetic movements, artistic style, lighting, texture, and visual atmosphere (e.g. 35mm film grain, brutalist typography, warm analog nostalgia, hyper-clean organic minimalism).

### Cultural Codes & Subcultures
What subcultures, creative tribes, or lifestyle movements are signified here (e.g. specialty coffee culture, skate/streetwear, dark academia, indie cinema, techno nightlife, sustainable craft)?

### Audience Taste Profile & Keywords
List specific audience interests, genres, and cultural tags implied by this aesthetic. Format as comma-separated tags under a clear heading:
Interests: [tag 1, tag 2, tag 3, tag 4, tag 5, tag 6, tag 7, tag 8]
(Ensure these are tags suitable for cultural taste graph matching, like "indie rock", "natural wine", "ceramic design", "vintage fashion").

### Color Palette & Textures
Key color harmonies, textures, materials, and typography styling.

### Brand Codes & Visible Copy
Any visible logos, brand references, products, or slogans.

Be concise, sharp, and specific. Do not use generic filler.`;

  try {
    const response = await client.messages.create({
      model: e.LLM_MODEL,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text);

    return textBlocks.join("\n\n").trim();
  } catch (err) {
    console.error("Claude Vision extraction error:", err);
    return `[Visual Moodboard: ${fileName}]\nFailed to extract visual aesthetics via Vision model: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}
