import { DivisionFormat } from "@/generated/prisma/enums";

/**
 * Record のキーを DivisionFormat に固定しているため、enum に値を足して
 * 文言を書き忘れるとコンパイルエラーになる。TOURNAMENT_STATUS_LABELS と同じ形。
 */
export const DIVISION_FORMAT_LABELS: Record<DivisionFormat, string> = {
  SINGLE_ELIMINATION: "シングルエリミネーション",
  ROUND_ROBIN: "リーグ（総当たり）",
};

/**
 * 選択肢の描画順。ラベル側は手書きのオブジェクトで順序が保証されないため、
 * enum 定義そのもの（スキーマの宣言順）から並び順を取る。
 */
export const DIVISION_FORMATS = Object.values(DivisionFormat);

/**
 * 形式ごとに、組み合わせビューアが参加者名を描画に使うか。使わない形式で
 * 詳細ページ・公開ページが毎回参加者一覧のクエリを投げずに済むよう、
 * ページ側がこれを見て読み出しを省く。Record で持つのは、形式を増やした
 * ときに書き忘れがコンパイルエラーになるようにするため
 * （現在の DivisionFormat はどちらも true なので実際には省かれないが、
 * 参加者名を使わない形式が増えたときの安全策として残す）。
 */
const USES_PARTICIPANTS: Record<DivisionFormat, boolean> = {
  SINGLE_ELIMINATION: true,
  ROUND_ROBIN: true,
};

export const needsParticipants = (format: DivisionFormat): boolean =>
  USES_PARTICIPANTS[format];
