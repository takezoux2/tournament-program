import { describe, expect, it } from "vitest";
import type { Position } from "./layout-bracket";
import { toFlowElements } from "./to-flow-elements";
import type { MatchStatus, ResolvedMatch, ResolvedSlot } from "./types";

const emptySlot: ResolvedSlot = {
  participant: null,
  state: "pending",
  isWinner: false,
  score: null,
};

const match = (
  id: string,
  round: number,
  order: number,
  sourceMatchIds: [string | null, string | null],
  status: MatchStatus,
  winnerId: string | null,
): ResolvedMatch => ({
  id,
  round,
  order,
  matchName: null,
  slots: [emptySlot, emptySlot],
  winnerId,
  score: null,
  winReason: null,
  note: null,
  status,
  sourceMatchIds,
});

const matches: ResolvedMatch[] = [
  match("m1", 1, 0, [null, null], "done", "p1"),
  match("m2", 1, 1, [null, null], "ready", null),
  match("m3", 2, 0, ["m1", "m2"], "waiting", null),
];

const positions = new Map<string, Position>([
  ["m1", { x: 0, y: 0 }],
  ["m2", { x: 0, y: 100 }],
  ["m3", { x: 300, y: 50 }],
]);

describe("toFlowElements", () => {
  it("試合数と同じ数のノードを作る", () => {
    expect(toFlowElements(matches, positions).nodes).toHaveLength(3);
  });

  it("ノードに type と座標と ResolvedMatch を載せる", () => {
    const node = toFlowElements(matches, positions).nodes[2];
    expect(node.id).toBe("m3");
    expect(node.type).toBe("match");
    expect(node.position).toEqual({ x: 300, y: 50 });
    expect(node.data.match.id).toBe("m3");
  });

  it("ノードはドラッグ不可にする", () => {
    const { nodes } = toFlowElements(matches, positions);
    expect(nodes.every((node) => node.draggable === false)).toBe(true);
  });

  it("winnerOf 参照 1 件につきエッジを 1 本作る", () => {
    const { edges } = toFlowElements(matches, positions);
    expect(edges).toHaveLength(2);
    expect(edges.map((edge) => edge.id)).toEqual(["m1->m3", "m2->m3"]);
    expect(edges[0].source).toBe("m1");
    expect(edges[0].target).toBe("m3");
  });

  it("決着済みの供給元から伸びるエッジを濃く、未決着を淡くする", () => {
    const { edges } = toFlowElements(matches, positions);
    const fromDecided = edges.find((edge) => edge.source === "m1");
    const fromUndecided = edges.find((edge) => edge.source === "m2");
    expect(fromDecided?.style?.stroke).toBeDefined();
    expect(fromDecided?.style?.stroke).not.toBe(fromUndecided?.style?.stroke);
  });

  it("座標が無い試合があれば例外を投げる", () => {
    expect(() => toFlowElements(matches, new Map())).toThrow(/m1/);
  });
});
