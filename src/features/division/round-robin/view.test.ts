import { describe, expect, it } from "vitest";
import type { DivisionEntries, DivisionEntry } from "@/lib/division/types";
import { buildRoundRobin } from "./build";
import { toCrossTableView } from "./view";

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

  it("対戦がある組には試合名が入り、左右対称になる", () => {
    const table = toCrossTableView(config, entries, participants);
    // e1 vs e4 は第1試合 = 通し番号 1。
    expect(table.rows[0].cells[3]).toEqual({ kind: "match", matchName: "1" });
    expect(table.rows[3].cells[0]).toEqual({ kind: "match", matchName: "1" });
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
