import { describe, expect, it } from "vitest";
import { readDivisionIds, slotTargetSchema } from "./first-round-schema";

describe("slotTargetSchema", () => {
  it('slotIndex の "0" / "1" を数値にする', () => {
    expect(slotTargetSchema.parse({ matchId: "m1-0", slotIndex: "1" })).toEqual({
      matchId: "m1-0",
      slotIndex: 1,
    });
  });

  it("0/1 以外や空の matchId は弾く", () => {
    expect(slotTargetSchema.safeParse({ matchId: "m1-0", slotIndex: "2" }).success).toBe(false);
    expect(slotTargetSchema.safeParse({ matchId: "m1-0", slotIndex: "" }).success).toBe(false);
    expect(slotTargetSchema.safeParse({ matchId: "", slotIndex: "0" }).success).toBe(false);
  });
});

describe("readDivisionIds", () => {
  it("FormData から 3 つの id を読み、無ければ空文字", () => {
    const data = new FormData();
    data.set("slug", "acme");
    data.set("tournamentId", "t1");
    expect(readDivisionIds(data)).toEqual({ slug: "acme", tournamentId: "t1", divisionId: "" });
  });
});
