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

/**
 * 公開ページ（/t/**）に出してよい状態かどうか。TOURNAMENT_STATUS_LABELS と
 * 同じ理由で Record のキーを TournamentStatus に固定してあり、enum に値を
 * 足したときに公開可否を書き忘れるとコンパイルエラーになる。
 * 許可リストにしておけば、書き忘れは「公開されない」側に倒れる
 * （除外リストだと、新しい状態は書き忘れたまま世界に公開されてしまう）。
 */
const TOURNAMENT_STATUS_IS_PUBLIC: Record<TournamentStatus, boolean> = {
  DRAFT: false,
  IN_PROGRESS: true,
  COMPLETED: true,
};

export const PUBLIC_TOURNAMENT_STATUSES: TournamentStatus[] = (
  Object.keys(TOURNAMENT_STATUS_IS_PUBLIC) as TournamentStatus[]
).filter((status) => TOURNAMENT_STATUS_IS_PUBLIC[status]);
