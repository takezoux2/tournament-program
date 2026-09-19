import { describe, expect, it } from "vitest";
import {
  ParticipantEnteredError,
  ParticipantNotFoundError,
  toParticipantError,
  UnexpectedParticipantError,
} from "./errors";

describe("toParticipantError", () => {
  it("ドメインのエラーはそのまま通す", () => {
    const error = new ParticipantNotFoundError({ participantId: "p1" });

    expect(toParticipantError(error)).toBe(error);
  });

  it("配列の詳細を持つエラーもそのまま通す", () => {
    const error = new ParticipantEnteredError({ divisionNames: ["男子の部"] });

    expect(toParticipantError(error)).toBe(error);
  });

  it("それ以外は UnexpectedParticipantError に写す", () => {
    const reason = new Error("connect ECONNREFUSED");

    const result = toParticipantError(reason);

    expect(result).toBeInstanceOf(UnexpectedParticipantError);
    expect(result._tag).toBe("UnexpectedParticipantError");
  });

  it("_tag がプロトタイプ由来の値でもドメインのエラーと誤認しない", () => {
    // `in` でタグ表を引くと "toString" などが通ってしまい、messages.ts の
    // Match.exhaustive が文言を返せず実行時に落ちる。
    const result = toParticipantError({ _tag: "toString" });

    expect(result).toBeInstanceOf(UnexpectedParticipantError);
  });
});
