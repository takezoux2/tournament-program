import { describe, expect, it } from "vitest";
import { formatStartsAt, toDateTimeLocalValue } from "./format";
import { startsAtSchema } from "./schema-parts";

describe("formatStartsAt", () => {
  it("null を「未設定」にする", () => {
    expect(formatStartsAt(null)).toBe("未設定");
  });

  it("日時を年月日を含む文字列にする", () => {
    // 実行環境のタイムゾーンで表記が変わるため、年が含まれることだけを見る。
    expect(formatStartsAt(new Date(2026, 7, 29, 10, 5))).toContain("2026");
  });
});

describe("toDateTimeLocalValue", () => {
  it("null を空文字にする", () => {
    expect(toDateTimeLocalValue(null)).toBe("");
  });

  it("datetime-local が受け付ける形式に直す", () => {
    expect(toDateTimeLocalValue(new Date(2026, 7, 29, 10, 5))).toBe(
      "2026-08-29T10:05",
    );
  });

  it("1 桁の月・日・時・分をゼロ埋めする", () => {
    expect(toDateTimeLocalValue(new Date(2026, 0, 2, 3, 4))).toBe(
      "2026-01-02T03:04",
    );
  });
});

describe("toDateTimeLocalValue と startsAtSchema の往復", () => {
  // 表示（toDateTimeLocalValue）とパース（startsAtSchema）は別ファイルにまたがるため、
  // 双方を単独でテストしても片方だけ壊れる変更を検出できない。
  // 同じ瞬間が往復で保たれることをここで直接確認する。
  const roundTrip = (date: Date): Date | null => {
    const parsed = startsAtSchema.parse(toDateTimeLocalValue(date));
    return parsed;
  };

  it("平日午後の時刻が同じ瞬間で往復する", () => {
    const date = new Date(2026, 7, 29, 15, 30);
    expect(roundTrip(date)?.getTime()).toBe(date.getTime());
  });

  it("月・日・時・分が全て1桁の時刻が同じ瞬間で往復する", () => {
    const date = new Date(2026, 0, 2, 3, 4);
    expect(roundTrip(date)?.getTime()).toBe(date.getTime());
  });

  it("0時0分（真夜中）が時刻情報を失わずに往復する", () => {
    const date = new Date(2026, 7, 29, 0, 0);
    expect(roundTrip(date)?.getTime()).toBe(date.getTime());
  });

  it("秒・ミリ秒を持つ Date は往復で切り捨てられ、別の瞬間になる", () => {
    // toDateTimeLocalValue は分までしか出力しないため、秒・ミリ秒は往復で失われる。
    // ただしアプリ内の startsAt は常にこの分単位のパースを経由して生成されるので、
    // 秒を持つ値がこのループに入力されること自体が実際には起こり得ない。
    // したがってこの切り捨ては許容される仕様であり、その境界をここで明示する。
    const date = new Date(2026, 7, 29, 15, 30, 45, 500);
    const truncated = new Date(2026, 7, 29, 15, 30, 0, 0);
    const result = roundTrip(date);
    expect(result?.getTime()).not.toBe(date.getTime());
    expect(result?.getTime()).toBe(truncated.getTime());
  });
});
