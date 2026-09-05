import { describe, expect, it } from "vitest";
import { resolveDragReorder } from "./schedule-drag";

const keys = ["a", "b", "c", "d"];

describe("resolveDragReorder", () => {
  it("下へ動かすと落とした位置に入る", () => {
    expect(resolveDragReorder(keys, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("上へ動かすと落とした位置に入る", () => {
    expect(resolveDragReorder(keys, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("落とし先が無ければ null", () => {
    expect(resolveDragReorder(keys, "a", null)).toBeNull();
  });

  it("同じ行に落としたら null", () => {
    expect(resolveDragReorder(keys, "a", "a")).toBeNull();
  });

  it("知らないキーなら null", () => {
    expect(resolveDragReorder(keys, "z", "a")).toBeNull();
    expect(resolveDragReorder(keys, "a", "z")).toBeNull();
  });

  it("元の配列を書き換えない", () => {
    const original = [...keys];
    resolveDragReorder(keys, "a", "c");
    expect(keys).toEqual(original);
  });
});
