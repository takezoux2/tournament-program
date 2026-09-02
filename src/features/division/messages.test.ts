import { describe, expect, it } from "vitest";
import {
  DivisionDataError,
  DivisionDuplicateEntryError,
  DivisionEntryLimitError,
  DivisionMemberNotFoundError,
  DivisionNotEnoughEntriesError,
  DivisionOrderConflictError,
  DivisionResultsRecordedError,
  UnexpectedDivisionError,
} from "./errors";
import { divisionErrorMessage } from "./messages";

describe("divisionErrorMessage", () => {
  it("並び順の衝突は再試行を促す", () => {
    const message = divisionErrorMessage(
      new DivisionOrderConflictError({ tournamentId: "t1" }),
    );

    expect(message).toBe("並び順が競合しました。もう一度お試しください");
  });

  it("予期しない失敗は内部の理由を画面に出さない", () => {
    const message = divisionErrorMessage(
      new UnexpectedDivisionError({
        reason: new Error("connect ECONNREFUSED"),
      }),
    );

    expect(message).toBe("処理に失敗しました。時間をおいて再度お試しください");
    expect(message).not.toContain("ECONNREFUSED");
  });
});

describe("divisionErrorMessage（追加分）", () => {
  it.each([
    ["DivisionResultsRecordedError", new DivisionResultsRecordedError({ divisionId: "d1" })],
    ["DivisionNotEnoughEntriesError", new DivisionNotEnoughEntriesError({ divisionId: "d1" })],
    ["DivisionDataError", new DivisionDataError({ reason: "broken" })],
    ["DivisionEntryLimitError", new DivisionEntryLimitError({ divisionId: "d1" })],
    ["DivisionDuplicateEntryError", new DivisionDuplicateEntryError({ divisionId: "d1" })],
    ["DivisionMemberNotFoundError", new DivisionMemberNotFoundError({ memberId: "m1" })],
  ])("%s に空でない日本語の文言を返す", (_tag, error) => {
    expect(divisionErrorMessage(error).length).toBeGreaterThan(0);
  });
});
