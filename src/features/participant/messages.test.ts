import { describe, expect, it } from "vitest";
import {
  ParticipantDataError,
  ParticipantDuplicateError,
  ParticipantEnteredError,
  type ParticipantError,
  ParticipantMemberNotFoundError,
  ParticipantNotFoundError,
  UnexpectedParticipantError,
} from "./errors";
import { participantErrorMessage } from "./messages";

describe("participantErrorMessage", () => {
  // タグごとに固有の文言を返すことを確かめる。長さだけの検証だと、
  // 文言の取り違えや使い回しがあってもテストが通ってしまう。
  it.each<[string, ParticipantError, string]>([
    [
      "ParticipantNotFoundError",
      new ParticipantNotFoundError({ participantId: "p1" }),
      "対象の参加者が見つかりません。画面を再読み込みしてください",
    ],
    [
      "ParticipantDuplicateError",
      new ParticipantDuplicateError({ memberId: "m1" }),
      "その人はすでにこの大会の参加者です",
    ],
    [
      "ParticipantMemberNotFoundError",
      new ParticipantMemberNotFoundError({ memberId: "m1" }),
      "選択したメンバーが見つかりません",
    ],
    [
      "ParticipantDataError",
      new ParticipantDataError({ divisionId: "d1" }),
      "部門のデータが壊れているため削除できません",
    ],
  ])("%s の文言", (_tag, error, expected) => {
    expect(participantErrorMessage(error)).toBe(expected);
  });

  it("エントリー済みは部門名を並べて案内する", () => {
    const message = participantErrorMessage(
      new ParticipantEnteredError({ divisionNames: ["男子の部", "女子の部"] }),
    );

    expect(message).toBe(
      "男子の部、女子の部 にエントリー中です。先に部門の編集画面から外してください",
    );
  });

  it("予期しない失敗は内部の理由を画面に出さない", () => {
    const message = participantErrorMessage(
      new UnexpectedParticipantError({
        reason: new Error("connect ECONNREFUSED"),
      }),
    );

    expect(message).toBe("処理に失敗しました。時間をおいて再度お試しください");
    expect(message).not.toContain("ECONNREFUSED");
  });
});
