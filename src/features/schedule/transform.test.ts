import { describe, expect, it } from "vitest";
import {
  dividerKey,
  HEAD_ANCHOR_KEY,
  insertDividerAfter,
  removeDividerRow,
  reorderRows,
  updateDividerRow,
} from "./domain";
import type { ScheduleRowView } from "./types";

const match = (divisionId: string, matchId: string): ScheduleRowView => ({
  kind: "match",
  key: `match:${divisionId}:${matchId}`,
  divisionId,
  divisionName: "男子",
  matchId,
  matchNumber: "1",
  label: "1回戦 第1試合",
  card: "山田 vs 佐藤",
});

const divider = (id: string): ScheduleRowView => ({
  kind: "divider",
  key: dividerKey(id),
  id,
  label: "午前の部",
  startsAt: null,
  startsAtInput: "",
});

const rows = [match("dA", "m1-0"), divider("s1"), match("dA", "m1-1")];
const keys = rows.map((row) => row.key);

describe("reorderRows", () => {
  it("送られたキー順に並べ替える", () => {
    const next = reorderRows(rows, [keys[2], keys[0], keys[1]]);
    expect(next?.map((row) => row.key)).toEqual([keys[2], keys[0], keys[1]]);
  });

  it("キーが足りなければ null", () => {
    expect(reorderRows(rows, [keys[0], keys[1]])).toBeNull();
  });

  it("キーが多すぎても null", () => {
    expect(
      reorderRows(rows, [keys[0], keys[1], keys[2], "match:dZ:m9-9"]),
    ).toBeNull();
  });

  it("知らないキーが混じっていれば null", () => {
    expect(reorderRows(rows, [keys[0], keys[1], "match:dZ:m9-9"])).toBeNull();
  });

  it("同じキーが 2 度来たら null", () => {
    expect(reorderRows(rows, [keys[0], keys[0], keys[1]])).toBeNull();
  });
});

describe("insertDividerAfter", () => {
  const fresh = { id: "s9", label: "区切り", startsAt: null };

  it("アンカーの直後に挿す", () => {
    const next = insertDividerAfter(rows, keys[0], fresh);
    expect(next?.map((row) => row.key)).toEqual([
      keys[0],
      dividerKey("s9"),
      keys[1],
      keys[2],
    ]);
  });

  it("空文字のアンカーは先頭に挿す", () => {
    const next = insertDividerAfter(rows, HEAD_ANCHOR_KEY, fresh);
    expect(next?.map((row) => row.key)).toEqual([dividerKey("s9"), ...keys]);
  });

  it("知らないアンカーは null", () => {
    expect(insertDividerAfter(rows, "match:dZ:m9-9", fresh)).toBeNull();
  });

  it("末尾の行をアンカーにすると末尾に挿す", () => {
    const next = insertDividerAfter(rows, keys[2], fresh);
    expect(next?.map((row) => row.key)).toEqual([
      keys[0],
      keys[1],
      keys[2],
      dividerKey("s9"),
    ]);
    // アンカーより前の行は差し替わっていないこと。
    expect(next?.slice(0, 3)).toEqual(rows);
  });
});

describe("updateDividerRow", () => {
  it("ラベルと開始予定時刻を差し替える", () => {
    // ローカル時刻で組み立てる。startsAtInput はローカル時刻の文字列なので、
    // UTC 指定だと実行環境の時刻帯で期待値が変わってしまう。
    const at = new Date(2026, 8, 5, 9, 0);
    const next = updateDividerRow(rows, "s1", "午後の部", at);
    expect(next?.[1]).toEqual({
      kind: "divider",
      key: dividerKey("s1"),
      id: "s1",
      label: "午後の部",
      startsAt: at,
      startsAtInput: "2026-09-05T09:00",
    });
  });

  it("知らない id は null", () => {
    expect(updateDividerRow(rows, "s9", "午後の部", null)).toBeNull();
  });
});

describe("removeDividerRow", () => {
  it("対象の区切りを取り除く", () => {
    const next = removeDividerRow(rows, "s1");
    expect(next?.map((row) => row.key)).toEqual([keys[0], keys[2]]);
  });

  it("知らない id は null", () => {
    expect(removeDividerRow(rows, "s9")).toBeNull();
  });

  it("末尾の区切りも取り除ける", () => {
    const rowsEndingWithDivider = [
      match("dA", "m1-0"),
      match("dA", "m1-1"),
      divider("s2"),
    ];
    const next = removeDividerRow(rowsEndingWithDivider, "s2");
    expect(next?.map((row) => row.key)).toEqual([
      rowsEndingWithDivider[0].key,
      rowsEndingWithDivider[1].key,
    ]);
  });
});
