import {
  createSlotLabeler,
  matchCardLabel,
  matchPositionLabel,
} from "@/lib/division/label";
import type {
  ScheduleDivision,
  ScheduleItemRecord,
  ScheduleParticipant,
  ScheduleRowView,
  ScheduleSaveItem,
} from "./types";

/** 試合行を指すキー。ScheduleItem.id ではなく実体の座標で作る。 */
export const matchKey = (divisionId: string, matchId: string): string =>
  `match:${divisionId}:${matchId}`;

/** 区切り行を指すキー。 */
export const dividerKey = (id: string): string => `divider:${id}`;

/**
 * 全部門の試合を、部門の order 昇順 → round 昇順 → order 昇順で並べた行にする。
 * 行を持たない試合を末尾へ足すときの「決定的な順」がこれで、
 * 保存の有無にかかわらず同じ入力からは同じ並びになる。
 */
const buildMatchRows = (
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
): ScheduleRowView[] =>
  [...divisions]
    .sort((left, right) => left.order - right.order)
    .flatMap((division) => {
      const labelSlot = createSlotLabeler(
        division.matchingConfig,
        division.entries,
        participants,
      );

      return [...division.matchingConfig.matches]
        .sort(
          (left, right) => left.round - right.round || left.order - right.order,
        )
        .map(
          (match): ScheduleRowView => ({
            kind: "match",
            key: matchKey(division.id, match.id),
            divisionId: division.id,
            divisionName: division.name,
            matchId: match.id,
            matchNumber: match.matchNumber,
            label: matchPositionLabel(match),
            card: matchCardLabel(match, labelSlot),
          }),
        );
    });

/**
 * 保存された並びと実体をマージして一覧の行を作る。
 *
 * 試合の実体は Division.matchingConfig の中にあり、ScheduleItem は文字列 id で
 * それを指すだけなので、行と実体は必ずずれうる（組み合わせの再生成、部門の削除、
 * 新しい部門の組み合わせ）。ここで吸収して画面が壊れないようにする。
 * DB の掃除はしない。読み出しは副作用を持たず、次の保存で全行を書き直すときに
 * まとめて片付く。
 */
export const buildScheduleView = (
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
  items: ScheduleItemRecord[],
): ScheduleRowView[] => {
  const matchRows = buildMatchRows(divisions, participants);
  const byKey = new Map(matchRows.map((row) => [row.key, row]));
  const placed = new Set<string>();
  const rows: ScheduleRowView[] = [];

  for (const item of items) {
    if (item.kind === "divider") {
      rows.push({
        kind: "divider",
        key: dividerKey(item.id),
        id: item.id,
        label: item.label,
        startsAt: item.startsAt,
      });
      continue;
    }

    const key = matchKey(item.divisionId, item.matchId);
    const row = byKey.get(key);
    // 実体の無い行は落とす。重複した行も 2 度は並べない。
    if (row === undefined || placed.has(key)) {
      continue;
    }
    placed.add(key);
    rows.push(row);
  }

  for (const row of matchRows) {
    if (!placed.has(row.key)) {
      rows.push(row);
    }
  }

  return rows;
};

/** 表示行を保存用の形に落とす。order は保存時に 0..n-1 で振り直すので持たない。 */
export const toSaveItems = (rows: ScheduleRowView[]): ScheduleSaveItem[] =>
  rows.map((row) =>
    row.kind === "divider"
      ? {
          kind: "divider",
          id: row.id,
          label: row.label,
          startsAt: row.startsAt,
        }
      : { kind: "match", divisionId: row.divisionId, matchId: row.matchId },
  );
