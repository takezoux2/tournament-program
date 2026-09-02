import { Cause } from "effect";
import { describe, expect, it } from "vitest";
import {
  organizationUserErrorFormState,
  organizationUserErrorSearchState,
} from "./effect-to-form-state";
import { AlreadyMember } from "./errors";

describe("organizationUserErrorFormState", () => {
  it("Fail のときはエラーに対応する文言を返す", () => {
    const cause = Cause.fail(new AlreadyMember({ userId: "u1" }));

    expect(organizationUserErrorFormState(cause)).toEqual({
      error: "このユーザーは既にこの組織に所属しています",
    });
  });

  it("Die など Fail 以外のときは汎用文言を返す", () => {
    const cause = Cause.die(new Error("boom"));

    expect(organizationUserErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
    });
  });
});

describe("organizationUserErrorSearchState", () => {
  it("検索結果は null にしたうえで文言を返す", () => {
    const cause = Cause.fail(new AlreadyMember({ userId: "u1" }));

    expect(organizationUserErrorSearchState(cause)).toEqual({
      error: "このユーザーは既にこの組織に所属しています",
      user: null,
    });
  });
});
