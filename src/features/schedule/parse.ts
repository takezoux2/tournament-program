import type { ScheduleItemKind } from "@/generated/prisma/enums";
import type { ScheduleItemRecord } from "./types";

/** parseScheduleItem が受け取る DB の行の形。 */
export type ScheduleItemRow = {
  id: string;
  kind: ScheduleItemKind;
  divisionId: string | null;
  matchId: string | null;
  label: string | null;
  startsAt: Date | null;
};

/**
 * DB の行を判別可能ユニオンに直す。kind と列の組み合わせが壊れている行
 * （MATCH なのに matchId が null など）は null を返して落とす。
 *
 * 列を kind で使い分ける以上、整合はコード側の責務になる。落ちた行は
 * 画面に出ないだけで、次の保存（全行の書き直し）のときに消える。
 */
export const parseScheduleItem = (
  row: ScheduleItemRow,
): ScheduleItemRecord | null => {
  if (row.kind === "MATCH") {
    if (row.divisionId === null || row.matchId === null) {
      return null;
    }
    return {
      kind: "match",
      id: row.id,
      divisionId: row.divisionId,
      matchId: row.matchId,
    };
  }

  if (row.label === null) {
    return null;
  }
  return {
    kind: "divider",
    id: row.id,
    label: row.label,
    startsAt: row.startsAt,
  };
};
