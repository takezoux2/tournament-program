import { describe, expect, it } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { parseSetupData } from "./parse-setup-data";

const division = (overrides: Partial<DivisionDetail> = {}): DivisionDetail => ({
  id: "d1",
  name: "男子",
  order: 0,
  format: "SINGLE_ELIMINATION",
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
  resultConfig: null,
  createdAt: new Date(),
  ...overrides,
});

describe("parseSetupData", () => {
  it("3 列とも正しければパース結果を返す", () => {
    const parsed = parseSetupData(division());
    expect(parsed).toEqual({
      entries: { version: 1, entries: [] },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
  });

  it("Json が壊れていれば null を返す", () => {
    expect(parseSetupData(division({ entries: "壊れた値" }))).toBeNull();
    expect(parseSetupData(division({ matchingConfig: "壊れた値" }))).toBeNull();
    expect(parseSetupData(division({ results: "壊れた値" }))).toBeNull();
  });
});
