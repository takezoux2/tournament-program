import { describe, expect, it } from "vitest";
import {
  MemberHasParticipants,
  MemberNotFound,
  UnexpectedMemberError,
} from "./errors";
import { memberErrorMessage } from "./messages";

describe("memberErrorMessage", () => {
  it("メンバー不在の文言", () => {
    expect(memberErrorMessage(new MemberNotFound({ memberId: "m1" }))).toBe(
      "該当するメンバーが見つかりません",
    );
  });

  it("参加記録ありの文言", () => {
    expect(
      memberErrorMessage(new MemberHasParticipants({ memberId: "m1" })),
    ).toBe("大会への参加記録があるため削除できません");
  });

  it("想定外の文言", () => {
    expect(
      memberErrorMessage(new UnexpectedMemberError({ reason: "boom" })),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});
