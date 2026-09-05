import { describe, expect, it } from "vitest";
import {
  ScheduleDataError,
  ScheduleItemNotFoundError,
  ScheduleOrderConflictError,
  ScheduleStaleError,
  UnexpectedScheduleError,
} from "./errors";
import { scheduleErrorMessage } from "./messages";

describe("scheduleErrorMessage", () => {
  it("並びのずれは再読み込みを促す", () => {
    expect(
      scheduleErrorMessage(new ScheduleStaleError({ tournamentId: "t1" })),
    ).toBe("一覧が更新されています。画面を再読み込みしてください");
  });

  it("区切りが無い場合も再読み込みを促す", () => {
    expect(
      scheduleErrorMessage(new ScheduleItemNotFoundError({ itemId: "s1" })),
    ).toBe("対象の区切りが見つかりません。画面を再読み込みしてください");
  });

  it("データ破損は管理者への連絡を促す", () => {
    expect(scheduleErrorMessage(new ScheduleDataError({ reason: "x" }))).toBe(
      "試合一覧のデータが壊れています。管理者に連絡してください",
    );
  });

  it("順序の競合は再試行を促す", () => {
    expect(
      scheduleErrorMessage(
        new ScheduleOrderConflictError({ tournamentId: "t1" }),
      ),
    ).toBe("並び順が競合しました。もう一度お試しください");
  });

  it("想定外は汎用の文言にする", () => {
    expect(
      scheduleErrorMessage(new UnexpectedScheduleError({ reason: "x" })),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});
