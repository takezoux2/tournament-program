import { describe, expect, it } from "vitest";
import type { DivisionEntries, DivisionEntry } from "@/lib/division/types";
import { buildRoundRobin } from "./build";
import { toCrossTableView, toRoundView } from "./view";

const list: DivisionEntry[] = [
  { id: "e1", participantId: "p1", seed: 0 },
  { id: "e2", participantId: "p2", seed: 1 },
  { id: "e3", participantId: "p3", seed: 2 },
  { id: "e4", participantId: "p4", seed: 3 },
];

const entries: DivisionEntries = { version: 1, entries: list };

const participants = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
  { id: "p4", name: "田中" },
];

const config = buildRoundRobin(list);

describe("toRoundView", () => {
  it("節ごとにまとめて、節番号の昇順で返す", () => {
    const rounds = toRoundView(config, entries, participants);
    expect(rounds.map((round) => round.round)).toEqual([1, 2, 3]);
    expect(rounds[0].matches).toHaveLength(2);
  });

  it("位置は節の文言、対戦は名前どうしで表す", () => {
    const rounds = toRoundView(config, entries, participants);
    expect(rounds[0].matches[0].label).toBe("第1節 第1試合");
    expect(rounds[0].matches[0].card).toBe("山田 vs 田中");
    expect(rounds[0].matches[0].matchId).toBe("r1-0");
    expect(rounds[0].matches[0].matchNumber).toBe("1");
  });

  it("偶数人なら休みは居ない", () => {
    for (const round of toRoundView(config, entries, participants)) {
      expect(round.restingLabels).toEqual([]);
    }
  });

  it("奇数人はその節に出ていない人を休みとして返す", () => {
    const odd = list.slice(0, 3);
    const oddEntries: DivisionEntries = { version: 1, entries: odd };
    const rounds = toRoundView(buildRoundRobin(odd), oddEntries, participants);

    expect(rounds).toHaveLength(3);
    for (const round of rounds) {
      expect(round.restingLabels).toHaveLength(1);
    }
    // 3 節を通すと全員が 1 回ずつ休む。
    expect(rounds.flatMap((round) => round.restingLabels).sort()).toEqual(
      ["山田", "佐藤", "鈴木"].sort(),
    );
  });

  it("組み合わせが空なら空を返す", () => {
    expect(
      toRoundView({ version: 1, matches: [] }, entries, participants),
    ).toEqual([]);
  });

  it("名前を引けないエントリーも行を落とさない", () => {
    // 参加者一覧が古いだけで編集不能になるのは困る。
    const rounds = toRoundView(config, entries, []);
    expect(rounds[0].matches[0].card).toBe(
      "（不明な参加者） vs （不明な参加者）",
    );
    expect(rounds[0].restingLabels).toEqual([]);
  });
});

describe("toCrossTableView", () => {
  it("見出しはシード順のエントリー", () => {
    const table = toCrossTableView(config, entries, participants);
    expect(table.headers.map((header) => header.label)).toEqual([
      "山田",
      "佐藤",
      "鈴木",
      "田中",
    ]);
    expect(table.rows.map((row) => row.entryId)).toEqual([
      "e1",
      "e2",
      "e3",
      "e4",
    ]);
  });

  it("対角は self", () => {
    const table = toCrossTableView(config, entries, participants);
    expect(table.rows[0].cells[0]).toEqual({ kind: "self" });
    expect(table.rows[2].cells[2]).toEqual({ kind: "self" });
  });

  it("対戦がある組には試合番号が入り、左右対称になる", () => {
    const table = toCrossTableView(config, entries, participants);
    // e1 vs e4 は第1節第1試合 = 通し番号 1。
    expect(table.rows[0].cells[3]).toEqual({ kind: "match", matchNumber: "1" });
    expect(table.rows[3].cells[0]).toEqual({ kind: "match", matchNumber: "1" });
  });

  it("対戦が無い組は none", () => {
    const table = toCrossTableView(
      { version: 1, matches: [] },
      entries,
      participants,
    );
    expect(table.rows[0].cells[1]).toEqual({ kind: "none" });
  });

  it("エントリーが空なら見出しも行も空", () => {
    const table = toCrossTableView(
      { version: 1, matches: [] },
      { version: 1, entries: [] },
      participants,
    );
    expect(table.headers).toEqual([]);
    expect(table.rows).toEqual([]);
  });
});
