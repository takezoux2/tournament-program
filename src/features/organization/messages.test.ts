import { describe, expect, it } from "vitest";
import type { SlugViolation } from "./domain";
import { SlugTaken, UnexpectedOrganizationError } from "./errors";
import { organizationErrorMessage, slugViolationMessage } from "./messages";

describe("organizationErrorMessage", () => {
  it("SlugTaken に専用の文言を返す", () => {
    expect(organizationErrorMessage(new SlugTaken({ slug: "tennis" }))).toBe(
      "この組織 ID は既に使われています",
    );
  });

  it("UnexpectedOrganizationError に汎用の文言を返す", () => {
    expect(
      organizationErrorMessage(
        new UnexpectedOrganizationError({ reason: new Error("x") }),
      ),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});

describe("slugViolationMessage", () => {
  const violations: SlugViolation[] = [
    "empty",
    "tooShort",
    "tooLong",
    "invalidCharacter",
    "hyphenEdge",
    "consecutiveHyphen",
    "reserved",
  ];

  it("全ての違反に空でない文言を返す", () => {
    for (const violation of violations) {
      expect(slugViolationMessage(violation)).not.toBe("");
    }
  });

  it("違反ごとに異なる文言を返す", () => {
    // 同じ文言を使い回すと、ユーザーはどこを直せばよいか分からない。
    const messages = violations.map(slugViolationMessage);
    expect(new Set(messages).size).toBe(violations.length);
  });
});
