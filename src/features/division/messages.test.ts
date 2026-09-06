import { describe, expect, it } from "vitest";
import {
  DivisionDataError,
  DivisionDuplicateEntryError,
  DivisionEntryLimitError,
  DivisionMemberNotFoundError,
  DivisionNotEnoughEntriesError,
  DivisionOrderConflictError,
  DivisionResultsRecordedError,
  DivisionRevisionConflictError,
  DivisionSlotNotDecidedError,
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
      new DivisionEntryLimitError({ divisionId: "d1" }),
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

  it("楽観ロックの競合は再読み込みを促す", () => {
    expect(
      divisionErrorMessage(
        new DivisionRevisionConflictError({ divisionId: "d1" }),
      ),
    ).toBe("他の人が更新しました。画面を再読み込みしてください");
  });

  it("未確定の試合への入力はその旨を返す", () => {
    expect(
      divisionErrorMessage(new DivisionSlotNotDecidedError({ matchId: "m1" })),
    ).toBe("対戦相手がまだ決まっていません。画面を再読み込みしてください");
  });
});
