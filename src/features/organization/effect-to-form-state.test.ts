import { Cause } from "effect";
import { describe, expect, it } from "vitest";
import { organizationErrorFormState } from "./effect-to-form-state";
import { SlugTaken, UnexpectedOrganizationError } from "./errors";

describe("organizationErrorFormState", () => {
  it("SlugTaken を含む Fail から専用の文言を返す", () => {
    const cause = Cause.fail(new SlugTaken({ slug: "tennis" }));

    expect(organizationErrorFormState(cause)).toEqual({
      error: "この組織 ID は既に使われています",
    });
  });

  it("UnexpectedOrganizationError を含む Fail から専用の文言を返す", () => {
    const cause = Cause.fail(
      new UnexpectedOrganizationError({ reason: new Error("x") }),
    );

    expect(organizationErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
    });
  });

  it("Fail ではない Cause（defect）からは汎用の文言を返す", () => {
    // die は defect を表し、Fail のようなエラー型のタグを持たない。
    // ここが Option.none 側の分岐を通ることを確認する。
    const cause = Cause.die(new Error("unexpected defect"));

    expect(organizationErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
    });
  });
});
