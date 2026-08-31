import { describe, expect, it } from "vitest";
import { DivisionOrderConflictError, UnexpectedDivisionError } from "./errors";
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
