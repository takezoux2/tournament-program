import { DivisionFormat } from "@/generated/prisma/enums";

/**
 * Record のキーを DivisionFormat に固定しているため、enum に値を足して
 * 文言を書き忘れるとコンパイルエラーになる。TOURNAMENT_STATUS_LABELS と同じ形。
 */
export const DIVISION_FORMAT_LABELS: Record<DivisionFormat, string> = {
  SINGLE_ELIMINATION: "シングルエリミネーション",
  DOUBLE_ELIMINATION_GRAND_FINAL: "ダブルエリミネーション（優勝決定戦あり）",
  DOUBLE_ELIMINATION_THIRD_PLACE: "ダブルエリミネーション（敗者側優勝が3位）",
  ROUND_ROBIN: "リーグ（総当たり）",
};

/**
 * 選択肢の描画順。ラベル側は手書きのオブジェクトで順序が保証されないため、
 * enum 定義そのもの（スキーマの宣言順）から並び順を取る。
 */
export const DIVISION_FORMATS = Object.values(DivisionFormat);
