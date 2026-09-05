import { describe, expect, it } from "vitest";
import { updateDividerSchema } from "./schema";

const input = (label: string, startsAt: string) => ({
  itemId: "s1",
  label,
  startsAt,
});

describe("updateDividerSchema", () => {
  it("ラベルをトリムして通す", () => {
    expect(updateDividerSchema.parse(input("  午前の部  ", ""))).toEqual({
      itemId: "s1",
      label: "午前の部",
      startsAt: null,
    });
  });

  it("datetime-local の値をローカル時刻の Date にする", () => {
    const parsed = updateDividerSchema.parse(
      input("午前の部", "2026-09-05T09:00"),
    );
    // new Date("2026-09-05T09:00") で期待値を作ると実装と同じ変換をなぞる
    // だけになり何も検証できない（トートロジー）ため、ローカルのカレンダー
    // フィールドを個別に確認して「ローカル時刻として解釈されている」こと
    // 自体をピン留めする。
    const startsAt = parsed.startsAt;
    expect(startsAt).not.toBeNull();
    expect(startsAt?.getFullYear()).toBe(2026);
    expect(startsAt?.getMonth()).toBe(8); // 0始まりなので9月
    expect(startsAt?.getDate()).toBe(5);
    expect(startsAt?.getHours()).toBe(9);
    expect(startsAt?.getMinutes()).toBe(0);
  });

  it("空のラベルは拒否する", () => {
    const result = updateDividerSchema.safeParse(input("   ", ""));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("見出しを入力してください");
    }
  });

  it("100 文字を超えるラベルは拒否する", () => {
    const result = updateDividerSchema.safeParse(input("あ".repeat(101), ""));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "見出しは100文字以内で入力してください",
      );
    }
  });

  it("datetime-local 以外の日時形式は拒否する", () => {
    const result = updateDividerSchema.safeParse(
      input("午前の部", "2026-09-05"),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "開始予定時刻の形式が正しくありません",
      );
    }
  });
});
