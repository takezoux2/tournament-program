import { Cause } from "effect";
import { describe, expect, it } from "vitest";
import { memberErrorFormState } from "./effect-to-form-state";
import { MemberNotFound } from "./errors";

describe("memberErrorFormState", () => {
  it("失敗は文言に写す", () => {
    const cause = Cause.fail(new MemberNotFound({ memberId: "m1" }));

    expect(memberErrorFormState(cause)).toEqual({
      error: "該当するメンバーが見つかりません",
    });
  });

  it("die などの失敗以外はフォールバック文言にする", () => {
    const cause = Cause.die(new Error("boom"));

    expect(memberErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
    });
  });
});
