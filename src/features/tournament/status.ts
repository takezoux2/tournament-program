import type { TournamentStatus } from "@/generated/prisma/enums";

/**
 * Record のキーを TournamentStatus に固定しているため、enum に値を足して
 * 文言を書き忘れるとコンパイルエラーになる。
 */
export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  DRAFT: "準備中",
  IN_PROGRESS: "進行中",
  COMPLETED: "完了",
};
