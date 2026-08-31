import { describe, expect, it } from "vitest";
import { DivisionFormat } from "@/generated/prisma/enums";
import { DIVISION_FORMAT_LABELS, DIVISION_FORMATS } from "./format";

describe("DIVISION_FORMAT_LABELS", () => {
  it("DivisionFormat のすべての値に日本語ラベルを持つ", () => {
    for (const format of Object.values(DivisionFormat)) {
      expect(DIVISION_FORMAT_LABELS[format]).toBeTruthy();
    }
  });

  it("DIVISION_FORMATS はスキーマの enum と同じ集合を返す", () => {
    expect([...DIVISION_FORMATS].sort()).toEqual(
      Object.values(DivisionFormat).sort(),
    );
  });
});
