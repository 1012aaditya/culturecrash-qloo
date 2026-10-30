import { describe, expect, it } from "vitest";
import { boardPalette, MAX_NODES, parseBoardContent, safeUrl } from "@/lib/boards/schema";

const PREFIX = "ws/project/board/";
const node = (id: string, type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id, type, position: { x: 0, y: 0 }, data, ...extra });

describe("safeUrl", () => {
  it("keeps only http(s) links", () => {
    expect(safeUrl("https://vogue.in/beauty")).toBe("https://vogue.in/beauty");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<script>")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });
});

describe("parseBoardContent", () => {
  it("drops unsafe links, foreign storage paths, unknown fields and transient signed URLs", () => {
    const out = parseBoardContent({
      nodes: [
        node("i1", "image", { path: "other-ws/project/board/x.png", url: "https://signed", title: "A", sourceUrl: "javascript:alert(1)", palette: ["#ffffff", "red"], evil: 1 }),
        node("i2", "image", { path: `${PREFIX}ok.png`, title: "B", sourceUrl: "https://unsplash.com/p", palette: [] }),
        node("i3", "image", { path: `${PREFIX}../escape.png`, title: "C", palette: [] }),
        node("l1", "link", { url: "javascript:alert(1)", title: "L", note: "" }),
      ],
      viewport: { x: 1, y: 2, zoom: 1 },
    }, PREFIX)!;
    const [i1, i2, i3, l1] = out.nodes;
    expect(i1.data).toEqual({ path: null, title: "A", sourceUrl: null, palette: [] });
    expect(i2.data).toMatchObject({ path: `${PREFIX}ok.png`, sourceUrl: "https://unsplash.com/p" });
    expect(i3.data.path).toBeNull();
    expect(l1.data.url).toBe("");
    expect(out.viewport).toEqual({ x: 1, y: 2, zoom: 1 });
  });

  it("puts groups first and detaches cards whose group is missing", () => {
    const out = parseBoardContent({
      nodes: [
        node("n1", "note", { text: "hi", tone: "lilac" }, { parentId: "g1" }),
        node("n2", "note", { text: "orphan", tone: "nope" }, { parentId: "gone" }),
        node("g1", "group", { label: "Moodboard" }),
      ],
    }, PREFIX)!;
    expect(out.nodes.map((n) => n.id)).toEqual(["g1", "n1", "n2"]);
    expect(out.nodes[1].parentId).toBe("g1");
    expect(out.nodes[2].parentId).toBeUndefined();
    expect(out.nodes[2].data.tone).toBe("paper");
  });

  it("rejects malformed documents and boards over the card limit", () => {
    expect(parseBoardContent({ nodes: [node("x", "script", {})] }, PREFIX)).toBeNull();
    expect(parseBoardContent({ nodes: [{ id: "x", type: "note", position: { x: Infinity, y: 0 }, data: {} }] }, PREFIX)).toBeNull();
    expect(parseBoardContent({ nodes: Array.from({ length: MAX_NODES + 1 }, (_, i) => node(`n${i}`, "note", {})) }, PREFIX)).toBeNull();
    expect(parseBoardContent("nope", PREFIX)).toBeNull();
  });

  it("only keeps https Qloo entity images", () => {
    const out = parseBoardContent({ nodes: [
      node("e1", "entity", { entityId: "a", name: "Shankar Mahadevan", type: "artist", role: "result", affinity: 0.98, imageUrl: "http://insecure/x.jpg" }),
      node("e2", "entity", { entityId: "b", name: "Coshish", type: "artist", role: "result", affinity: "high", imageUrl: "https://images.qloo.com/x.jpg" }),
    ] }, PREFIX)!;
    expect(out.nodes[0].data).toMatchObject({ imageUrl: null, affinity: 0.98 });
    expect(out.nodes[1].data).toMatchObject({ imageUrl: "https://images.qloo.com/x.jpg", affinity: null });
  });
});

describe("boardPalette", () => {
  it("ranks colours by how many images use them, max 8", () => {
    const img = (p: string[]) => ({ type: "image", data: { palette: p } });
    expect(boardPalette([img(["#AA0000", "#00bb00"]), img(["#aa0000"]), { type: "note", data: { palette: ["#123456"] } }])).toEqual(["#aa0000", "#00bb00"]);
    expect(boardPalette(Array.from({ length: 10 }, (_, i) => img([`#00000${i}`])))).toHaveLength(8);
  });
});
