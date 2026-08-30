import { describe, expect, it } from "vitest";
import { UnexpectedTournamentError } from "./errors";
import { tournamentErrorMessage } from "./messages";

describe("tournamentErrorMessage", () => {
  it("UnexpectedTournamentError に汎用の文言を返す", () => {
    expect(
      tournamentErrorMessage(
        new UnexpectedTournamentError({ reason: new Error("x") }),
      ),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});
