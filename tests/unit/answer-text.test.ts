import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerText } from "@/components/copilot/answer-text";

const html = (t: string) => renderToStaticMarkup(createElement(AnswerText, { text: t }));

describe("copilot answer text", () => {
  it("renders paragraphs, bold, lists and Qloo refs", () => {
    const out = html("**What I ran:** two checks.\n\n- On Purpose (0.99) [Q1]\n- Others [Q12–Q17]\n\n1. First\n2. Second");
    expect(out).toContain("<strong");
    expect(out).toContain("What I ran:</strong> two checks.");
    expect(out).toMatch(/<ul[^>]*><li>On Purpose \(0\.99\) <span[^>]*>Q1<\/span><\/li><li>Others <span[^>]*>Q12–Q17<\/span><\/li><\/ul>/);
    expect(out).toMatch(/<ol[^>]*><li>First<\/li><li>Second<\/li><\/ol>/);
    expect(out).not.toContain("**");
  });
  it("treats a bold line on its own as a heading, not the start of the next sentence", () => {
    expect(html("**How they differ**\nOnly one is shared.")).toBe('<div class="space-y-2"><p class="font-semibold">How they differ</p><p>Only one is shared.</p></div>');
  });
  it("never turns model text into markup", () => {
    const out = html("<img src=x onerror=alert(1)> **<b>hi</b>**");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
});
