import { describe, expect, it } from "vitest";
import {
  DivisionDataError,
  DivisionDuplicateEntryError,
  DivisionEntryLimitError,
  DivisionMemberNotFoundError,
  DivisionNotEnoughEntriesError,
  DivisionOrderConflictError,
  DivisionResultsRecordedError,
  UnexpectedDivisionError,
} from "./errors";
import { divisionErrorMessage } from "./messages";

describe("divisionErrorMessage", () => {
  it("並び順の衝突は再試行を促す", () => {
    const message = divisionErrorMessage(
      new DivisionOrderConflictError({ tournamentId: "t1" }),
    );

    expect(message).toBe("並び順が競合しました。もう一度お試しください");
  });

  it("予期しない失敗は内部の理由を画面に出さない", () => {
    const message = divisionErrorMessage(
      new UnexpectedDivisionError({
        reason: new Error("connect ECONNREFUSED"),
      }),
    );

    expect(message).toBe("処理に失敗しました。時間をおいて再度お試しください");
    expect(message).not.toContain("ECONNREFUSED");
  });
});

describe("divisionErrorMessage（追加分）", () => {
  // タグごとに固有の文言を返すことを確かめる。長さだけの検証だと、
  // 文言の取り違えや使い回しがあってもテストが通ってしまうため、
  // 期待する文言そのものを1件ずつ突き合わせる。
  it.each([
    [
      "DivisionResultsRecordedError",
      new DivisionResultsRecordedError({ divisionId: "d1" }),
      "勝敗が記録されているため、エントリーと組み合わせは変更できません",
    ],
    [
      "DivisionNotEnoughEntriesError",
      new DivisionNotEnoughEntriesError({ divisionId: "d1" }),
      "組み合わせを作るにはエントリーが2人以上必要です",
    ],
    [
      "DivisionDataError",
      new DivisionDataError({ reason: "broken" }),
      "部門のデータが壊れています。管理者に連絡してください",
    ],
    [
      "DivisionEntryLimitError",
      new DivisionEntryLimitError({ divisionId: "d1", limit: 128 }),
      "エントリーは128人までです",
    ],
    [
      "DivisionDuplicateEntryError",
      new DivisionDuplicateEntryError({ divisionId: "d1" }),
      "その参加者はすでにエントリーしています",
    ],
    [
      "DivisionMemberNotFoundError",
      new DivisionMemberNotFoundError({ memberId: "m1" }),
      "選択したメンバーが見つかりません",
    ],
  ])("%s には固有の文言を返す", (_tag, error, expected) => {
    expect(divisionErrorMessage(error)).toBe(expected);
  });

  it("エントリー上限の文言は形式ごとの上限を出す", () => {
    // 形式で上限が変わるのに文言が固定だと、リーグで 17 人目を弾いたときに
    // 「128人まで」と嘘を表示してしまう。
    expect(
      divisionErrorMessage(
        new DivisionEntryLimitError({ divisionId: "d1", limit: 16 }),
      ),
    ).toBe("エントリーは16人までです");
  });
});
