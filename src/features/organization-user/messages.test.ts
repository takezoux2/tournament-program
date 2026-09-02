import { describe, expect, it } from "vitest";
import {
  AlreadyMember,
  NotAMember,
  UnexpectedOrganizationUserError,
  UserNotFound,
} from "./errors";
import { organizationUserErrorMessage } from "./messages";

describe("organizationUserErrorMessage", () => {
  it("UserNotFound には見つからない旨を返す", () => {
    expect(
      organizationUserErrorMessage(new UserNotFound({ query: "takezo" })),
    ).toBe("該当するユーザーが見つかりません");
  });

  it("AlreadyMember には所属済みの旨を返す", () => {
    expect(
      organizationUserErrorMessage(new AlreadyMember({ userId: "u1" })),
    ).toBe("このユーザーは既にこの組織に所属しています");
  });

  it("NotAMember には非所属の旨を返す", () => {
    expect(organizationUserErrorMessage(new NotAMember({ userId: "u1" }))).toBe(
      "このユーザーはこの組織に所属していません",
    );
  });

  it("想定外のエラーには内部の詳細を出さない汎用文言を返す", () => {
    expect(
      organizationUserErrorMessage(
        new UnexpectedOrganizationUserError({ reason: new Error("network") }),
      ),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});
