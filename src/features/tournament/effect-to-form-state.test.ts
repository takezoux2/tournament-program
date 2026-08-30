import { Cause } from "effect";
import { describe, expect, it } from "vitest";
import { tournamentErrorFormState } from "./effect-to-form-state";
import { UnexpectedTournamentError } from "./errors";

describe("tournamentErrorFormState", () => {
  it("UnexpectedTournamentError を含む Fail から専用の文言を返す", () => {
    const cause = Cause.fail(
      new UnexpectedTournamentError({ reason: new Error("x") }),
    );

    expect(tournamentErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
    });
  });

  it("Fail ではない Cause（defect）からは汎用の文言を返す", () => {
    // die は defect を表し、Fail のようなエラー型のタグを持たない。
    // ここが Option.none 側の分岐を通ることを確認する。
    const cause = Cause.die(new Error("unexpected defect"));

    expect(tournamentErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
    });
  });
});
