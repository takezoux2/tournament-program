import { describe, expect, it } from "vitest";
import { bracketViewBox, connectorPath } from "./svg-geometry";

describe("bracketViewBox", () => {
  it("カードの外接矩形に、試合名の高さと余白を足す", () => {
    // 右端 300 + 220 = 520、下端 100 + 76 = 176、上端は試合名ぶん 0 - 12 = -12
    expect(
      bracketViewBox([
        { x: 0, y: 0 },
        { x: 300, y: 100 },
      ]),
    ).toEqual({ x: -16, y: -28, width: 552, height: 220 });
  });

  it("セクション見出しが上にあれば含める", () => {
    expect(
      bracketViewBox(
        [
          { x: 0, y: 0 },
          { x: 300, y: 100 },
        ],
        [
          {
            id: "section-winners",
            label: "勝者側",
            position: { x: 0, y: -28 },
          },
        ],
      ),
    ).toEqual({ x: -16, y: -44, width: 552, height: 236 });
  });

  it("カードが無ければ大きさ 0 を返す", () => {
    expect(bracketViewBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("connectorPath", () => {
  it("供給元の右端中央から、次の試合の該当スロットの左端へ直角に結ぶ", () => {
    // 始点 (220, 38)、折れ位置は次の試合の左 40、終点の y は上側スロットの中央 50 + 19
    expect(connectorPath({ x: 0, y: 0 }, { x: 300, y: 50 }, 0)).toBe(
      "M 220 38 H 260 V 69 H 300",
    );
  });

  it("下側スロットへは下半分の中央に着ける", () => {
    expect(connectorPath({ x: 0, y: 0 }, { x: 300, y: 50 }, 1)).toBe(
      "M 220 38 H 260 V 107 H 300",
    );
  });
});
