import { describe, expect, it } from "vitest";
import { align, describe as label, distribute, History, hydrate, mergeBoards, nodeKey, nodesKey, serialise, type BoardNode } from "@/components/boards/board-logic";

const n = (id: string, data: Record<string, unknown> = {}, extra: Partial<BoardNode> = {}): BoardNode =>
  ({ id, type: "note", position: { x: 0, y: 0 }, data: { text: id, tone: "paper", ...data }, ...extra }) as BoardNode;
const baseOf = (nodes: BoardNode[]) => new Map(nodes.map((x) => [x.id, nodeKey(x)]));

describe("serialise", () => {
  it("never stores signed URLs or React Flow state", () => {
    const img = { id: "i", type: "image", position: { x: 1.4, y: 2.6 }, selected: true, measured: { width: 9, height: 9 },
      data: { path: "p", thumbPath: "t", url: "https://signed/1", thumbUrl: "https://signed/2", title: "", alt: "", sourceUrl: null, palette: [] } } as unknown as BoardNode;
    const out = serialise([img], { x: 1.234, y: 5.678, zoom: 1.23456 });
    expect(out.nodes[0]).toEqual({ id: "i", type: "image", position: { x: 1, y: 3 }, data: { path: "p", thumbPath: "t", title: "", alt: "", sourceUrl: null, palette: [] } });
    expect(out.viewport).toEqual({ x: 1, y: 6, zoom: 1.235 });
  });
  it("keeps a link card's own url and drops only its signed preview URL", () => {
    // Regression: a type-blind strip of `url` blanked every link card's address on save.
    const link = { id: "l", type: "link", position: { x: 0, y: 0 }, data: { url: "https://github.com/xyflow/xyflow", title: "", note: "", siteName: "GitHub", imagePath: "p", previewUrl: "https://signed/3" } } as BoardNode;
    expect(serialise([link], null).nodes[0].data).toEqual({ url: "https://github.com/xyflow/xyflow", title: "", note: "", siteName: "GitHub", imagePath: "p" });
  });
});

describe("mergeBoards", () => {
  const a = n("a"), b = n("b"), c = n("c");
  const base = baseOf([a, b, c]);

  it("keeps both sides' edits to different cards", () => {
    const local = [n("a", { text: "mine" }), b, c];
    const server = [a, n("b", { text: "theirs" }), c];
    const out = mergeBoards(base, local, server);
    expect(out.map((x) => x.data.text)).toEqual(["mine", "theirs", "c"]);
  });

  it("keeps the local version when both changed the same card", () => {
    expect(mergeBoards(base, [n("a", { text: "mine" }), b, c], [n("a", { text: "theirs" }), b, c])[0].data.text).toBe("mine");
  });

  it("keeps cards added on either side", () => {
    const out = mergeBoards(base, [a, b, c, n("local-new")], [a, b, c, n("server-new")]);
    expect(out.map((x) => x.id).sort()).toEqual(["a", "b", "c", "local-new", "server-new"]);
  });

  it("applies a deletion only to an unchanged card", () => {
    // Teammate deleted b (unchanged here) and c (which I edited): b goes, c stays.
    expect(mergeBoards(base, [a, b, n("c", { text: "edited" })], [a]).map((x) => x.id)).toEqual(["a", "c"]);
    // I deleted a; the teammate left it unchanged: it stays deleted.
    expect(mergeBoards(base, [b, c], [a, b, c]).map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("puts groups first and detaches cards whose group was deleted", () => {
    const g = { id: "g", type: "group", position: { x: 0, y: 0 }, data: { label: "G" } } as BoardNode;
    const child = n("child", {}, { parentId: "g" });
    const base2 = baseOf([g, child]);
    const out = mergeBoards(base2, [n("child", { text: "edited" }, { parentId: "g" })], [child]);
    expect(out.find((x) => x.id === "child")?.parentId).toBeUndefined();
    const kept = mergeBoards(base2, [g, child, n("x")], [g, child]);
    expect(kept[0].id).toBe("g");
  });
});

describe("align and distribute", () => {
  const boxes = [{ id: "a", x: 0, y: 0, w: 100, h: 50 }, { id: "b", x: 300, y: 40, w: 50, h: 100 }, { id: "c", x: 120, y: 200, w: 60, h: 60 }];
  it("aligns edges and centres", () => {
    expect(align(boxes, "left").get("b")).toEqual({ x: 0, y: 40 });
    expect(align(boxes, "right").get("a")).toEqual({ x: 250, y: 0 });
    expect(align(boxes, "top").get("c")).toEqual({ x: 120, y: 0 });
    expect(align(boxes, "middle").get("a")).toEqual({ x: 0, y: 105 });
    expect(align([boxes[0]], "left").size).toBe(0);
  });
  it("spaces boxes evenly between the outermost two", () => {
    const out = distribute(boxes, "x");
    // span 0..350, widths 210 → gap 70: a at 0, c at 170, b at 300
    expect(out.get("a")!.x).toBe(0);
    expect(out.get("c")!.x).toBe(170);
    expect(out.get("b")!.x).toBe(300);
    expect(distribute(boxes.slice(0, 2), "x").size).toBe(0);
  });
});

describe("History", () => {
  it("undoes and redoes, and a new change drops the redo branch", () => {
    const h = new History(10);
    h.push([n("a")]);
    h.push([n("a"), n("b")]);
    expect(h.push([n("a"), n("b")])).toBe(false); // unchanged
    expect(nodesKey(h.undo()!)).toBe(nodesKey([n("a")]));
    expect(h.canRedo).toBe(true);
    expect(nodesKey(h.redo()!)).toBe(nodesKey([n("a"), n("b")]));
    h.undo();
    h.push([n("z")]);
    expect(h.canRedo).toBe(false);
    expect(h.undo()?.map((x) => x.id)).toEqual(["a"]);
    expect(h.undo()).toBeNull();
  });
  it("keeps at most the limit", () => {
    const h = new History(3);
    for (let i = 0; i < 6; i++) h.push([n(`n${i}`)]);
    expect(h.undo()?.[0].id).toBe("n4");
    expect(h.undo()?.[0].id).toBe("n3");
    expect(h.undo()).toBeNull();
  });
});

describe("hydrate", () => {
  it("makes locked cards undraggable and undeletable, with a screen-reader label", () => {
    const locked = hydrate(n("a", { locked: true, text: "Brief tone" }));
    expect(locked).toMatchObject({ draggable: false, deletable: false });
    expect(locked.ariaLabel).toBe("Note: Brief tone, locked");
    const img = { id: "i", type: "image", position: { x: 0, y: 0 }, data: { title: "Swatch", alt: "", sourceUrl: "https://www.unsplash.com/x" } } as BoardNode;
    expect(label(img)).toBe("Image: Swatch, source unsplash.com");
  });
});
