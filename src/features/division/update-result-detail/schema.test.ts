import { describe, expect, it } from "vitest";
import { MAX_NOTE_LENGTH, MAX_SCORE_VALUE } from "@/lib/division/types";
import { updateResultDetailSchema } from "./schema";

const base = {
  matchId: "m1",
  winReason: "",
  scores: [{ entryId: "e1", values: [7] }],
  note: "",
};

const withValues = (values: (number | null)[]) => ({
  ...base,
  scores: [{ entryId: "e1", values }],
});

/** 画面には issues[0].message を出すので、その文言まで確かめる。 */
const firstMessage = (value: unknown) => {
  const parsed = updateResultDetailSchema.safeParse(value);
  expect(parsed.success).toBe(false);
  return parsed.success ? null : parsed.error.issues[0].message;
};

describe("updateResultDetailSchema", () => {
  it("妥当な入力を受け付ける", () => {
    expect(updateResultDetailSchema.safeParse(base).success).toBe(true);
  });

  it("範囲外のスコアを弾く", () => {
    const message = `スコアは0以上${MAX_SCORE_VALUE}以下で入力してください`;
    expect(firstMessage(withValues([-0.01]))).toBe(message);
    expect(firstMessage(withValues([MAX_SCORE_VALUE + 0.01]))).toBe(message);
  });

  it("上限ちょうどのスコアは受け付ける", () => {
    expect(
      updateResultDetailSchema.safeParse(withValues([0, MAX_SCORE_VALUE]))
        .success,
    ).toBe(true);
  });

  it("小数第 3 位以下のあるスコアを弾く", () => {
    expect(firstMessage(withValues([6.125]))).toBe(
      "スコアは小数第2位まで入力できます",
    );
  });

  // handler は数値でない入力を Number() で NaN にして渡してくる。
  it("数値でないスコア（NaN）を弾き、数値で入力するよう促す", () => {
    expect(firstMessage(withValues([Number("abc")]))).toBe(
      "スコアは数値で入力してください",
    );
  });

  it("未入力のスコア（null）は受け付けて null のまま返す", () => {
    const parsed = updateResultDetailSchema.safeParse(withValues([null, 7]));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scores[0].values).toEqual([null, 7]);
    }
  });

  it("上限文字数を超えるメモを弾く", () => {
    expect(
      firstMessage({ ...base, note: "あ".repeat(MAX_NOTE_LENGTH + 1) }),
    ).toBe(`メモは${MAX_NOTE_LENGTH}文字以内で入力してください`);
  });

  it("上限文字数ちょうどのメモは受け付ける", () => {
    expect(
      updateResultDetailSchema.safeParse({
        ...base,
        note: "あ".repeat(MAX_NOTE_LENGTH),
      }).success,
    ).toBe(true);
  });
});
