import { Cause } from "effect";
import { describe, expect, it } from "vitest";
import { InvalidPassword } from "@/shared/errors/auth-error";
import { profileErrorFormState } from "./effect-to-form-state";

describe("profileErrorFormState", () => {
  it("失敗の中身を文言にして error に入れ、notice は空にする", () => {
    const cause = Cause.fail(
      new InvalidPassword({ code: "INVALID_PASSWORD" }),
    );
    expect(profileErrorFormState(cause)).toEqual({
      error: "現在のパスワードが正しくありません",
      notice: null,
    });
  });

  it("Fail 以外（Die など）は一般的な文言に畳む", () => {
    const cause = Cause.die(new Error("boom"));
    expect(profileErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
      notice: null,
    });
  });
});
