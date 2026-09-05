import { describe, expect, it } from "vitest";
import { parseScheduleItem } from "./parse";

const matchRow = {
  id: "s1",
  kind: "MATCH" as const,
  divisionId: "d1",
  matchId: "m1-0",
  label: null,
  startsAt: null,
};

const dividerRow = {
  id: "s2",
  kind: "DIVIDER" as const,
  divisionId: null,
  matchId: null,
  label: "午前の部",
  startsAt: new Date("2026-09-05T09:00:00Z"),
};

describe("parseScheduleItem", () => {
  it("MATCH 行を判別可能ユニオンに直す", () => {
    expect(parseScheduleItem(matchRow)).toEqual({
      kind: "match",
      id: "s1",
      divisionId: "d1",
      matchId: "m1-0",
    });
  });

  it("DIVIDER 行を判別可能ユニオンに直す", () => {
    expect(parseScheduleItem(dividerRow)).toEqual({
      kind: "divider",
      id: "s2",
      label: "午前の部",
      startsAt: new Date("2026-09-05T09:00:00Z"),
    });
  });

  it("開始予定時刻の無い DIVIDER は null のまま運ぶ", () => {
    expect(parseScheduleItem({ ...dividerRow, startsAt: null })).toEqual({
      kind: "divider",
      id: "s2",
      label: "午前の部",
      startsAt: null,
    });
  });

  it("divisionId の欠けた MATCH 行は落とす", () => {
    expect(parseScheduleItem({ ...matchRow, divisionId: null })).toBeNull();
  });

  it("matchId の欠けた MATCH 行は落とす", () => {
    expect(parseScheduleItem({ ...matchRow, matchId: null })).toBeNull();
  });

  it("label の欠けた DIVIDER 行は落とす", () => {
    expect(parseScheduleItem({ ...dividerRow, label: null })).toBeNull();
  });
});
