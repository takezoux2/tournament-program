import { describe, expect, it } from "vitest";
import { optionalDateTimeLocalSchema, toDateTimeLocalValue } from "./local";

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

describe("optionalDateTimeLocalSchema", () => {
  const schema = optionalDateTimeLocalSchema("形式が正しくありません");

  it("空文字を null にする", () => {
    expect(schema.parse("")).toBeNull();
  });

  it("前後の空白を落としてから判定する", () => {
    expect(schema.parse("  2026-08-29T10:05  ")?.getTime()).toBe(
      new Date(2026, 7, 29, 10, 5).getTime(),
    );
  });

  it("datetime-local が出さない形式は受け付けない", () => {
    // Date.parse は日付のみやタイムゾーン付きも通してしまうため、
    // 正規表現で入力欄が実際に出力する形に絞れていることを確かめる。
    expect(() => schema.parse("2026-08-29")).toThrow();
    expect(() => schema.parse("2026-08-29T10:05:00Z")).toThrow();
    expect(() => schema.parse("2026-13-40T99:99")).toThrow();
  });

  it("渡した文言をエラーに使う", () => {
    const result = schema.safeParse("2026-08-29");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("形式が正しくありません");
  });
});

describe("toDateTimeLocalValue とパースの往復", () => {
  // 表示（toDateTimeLocalValue）とパース（optionalDateTimeLocalSchema）は
  // 別の関数なので、双方を単独でテストしても片方だけ壊れる変更を検出できない。
  // 同じ瞬間が往復で保たれることをここで直接確認する。
  const schema = optionalDateTimeLocalSchema("形式が正しくありません");
  const roundTrip = (date: Date): Date | null =>
    schema.parse(toDateTimeLocalValue(date));

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
