import { describe, expect, it } from "vitest";
import {
  GAP_X,
  GAP_Y,
  type LayoutInput,
  layoutBracket,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position,
} from "./layout-bracket";

const round1 = (id: string, order: number): LayoutInput => ({
  id,
  round: 1,
  order,
  sourceMatchIds: [null, null],
});

const feeder = (
  id: string,
  round: number,
  order: number,
  sources: [string, string],
): LayoutInput => ({ id, round, order, sourceMatchIds: sources });

/** 4 試合 → 2 試合 → 1 試合の 3 ラウンド構成 */
const matches: LayoutInput[] = [
  round1("m1", 0),
  round1("m2", 1),
  round1("m3", 2),
  round1("m4", 3),
  feeder("m5", 2, 0, ["m1", "m2"]),
  feeder("m6", 2, 1, ["m3", "m4"]),
  feeder("m7", 3, 0, ["m5", "m6"]),
];

const at = (positions: Map<string, Position>, id: string): Position => {
  const position = positions.get(id);
  if (!position) throw new Error(`no position for ${id}`);
  return position;
};

describe("layoutBracket", () => {
  it("全試合の座標を返す", () => {
    expect(layoutBracket(matches).size).toBe(7);
  });

  it("1 回戦の y が order の等間隔になる", () => {
    const positions = layoutBracket(matches);
    const step = NODE_HEIGHT + GAP_Y;
    expect(at(positions, "m1").y).toBe(0);
    expect(at(positions, "m2").y).toBe(step);
    expect(at(positions, "m3").y).toBe(step * 2);
    expect(at(positions, "m4").y).toBe(step * 3);
  });

  it("x がラウンドごとに等間隔になる", () => {
    const positions = layoutBracket(matches);
    const step = NODE_WIDTH + GAP_X;
    expect(at(positions, "m1").x).toBe(0);
    expect(at(positions, "m5").x).toBe(step);
    expect(at(positions, "m7").x).toBe(step * 2);
  });

  it("2 回戦以降の y が供給元 2 試合の中点になる", () => {
    const positions = layoutBracket(matches);
    const step = NODE_HEIGHT + GAP_Y;
    expect(at(positions, "m5").y).toBe(step * 0.5);
    expect(at(positions, "m6").y).toBe(step * 2.5);
    expect(at(positions, "m7").y).toBe(step * 1.5);
  });

  it("供給元が 1 つだけならその y をそのまま使う", () => {
    const positions = layoutBracket([
      round1("a", 0),
      round1("b", 1),
      { id: "c", round: 2, order: 0, sourceMatchIds: ["b", null] },
    ]);
    expect(at(positions, "c").y).toBe(at(positions, "b").y);
  });

  it("入力の順序が崩れていてもラウンド順に解決できる", () => {
    // m5（2 回戦）を、供給元の m1 / m2 より前に置いた並び
    const shuffled = [matches[4], matches[1], matches[0]];
    const positions = layoutBracket(shuffled);
    expect(at(positions, "m5").y).toBe((NODE_HEIGHT + GAP_Y) * 0.5);
  });

  it("供給元の座標が決まらない参照があれば例外を投げる", () => {
    expect(() =>
      layoutBracket([
        { id: "z", round: 2, order: 0, sourceMatchIds: ["ghost", null] },
      ]),
    ).toThrow(/ghost/);
  });
});
