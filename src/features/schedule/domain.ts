import { toDateTimeLocalValue } from "@/lib/datetime/local";
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
 * 区切りの表示行を作る唯一の入り口。3 箇所（マージ・挿入・更新）で組み立てるため
 * 1 つにまとめてある。startsAtInput をここで作るのは、この関数がサーバでしか
 * 動かない（読み出しと Server Action の中だけ）ため。画面側で組み立てると
 * ブラウザの時刻帯で書き、サーバの時刻帯で読むことになり、時差ぶんずれる。
 */
const dividerRow = (divider: {
  id: string;
  label: string;
  startsAt: Date | null;
}): ScheduleRowView => ({
  kind: "divider",
  key: dividerKey(divider.id),
  id: divider.id,
  label: divider.label,
  startsAt: divider.startsAt,
  startsAtInput: toDateTimeLocalValue(divider.startsAt),
});

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
      rows.push(dividerRow(item));
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

/** 「先頭に挿す」を表すアンカー。画面の hidden input が空文字を送ってくる。 */
export const HEAD_ANCHOR_KEY = "";

/**
 * 送られたキー順に並べ替える。キーの集合が現在の一覧と完全に一致しない場合は
 * null を返す。この一致確認が同時編集に対する防波堤で、別の誰かが組み合わせを
 * 作り直したり区切りを増やしたりしていれば、その並びは受け付けない。
 */
export const reorderRows = (
  rows: ScheduleRowView[],
  keys: string[],
): ScheduleRowView[] | null => {
  if (keys.length !== rows.length) {
    return null;
  }

  const byKey = new Map(rows.map((row) => [row.key, row]));
  const next: ScheduleRowView[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    const row = byKey.get(key);
    // 知らないキーと、同じキーの二重指定を弾く。長さが同じでも
    // 集合として一致するとは限らないため、両方を見る必要がある。
    if (row === undefined || seen.has(key)) {
      return null;
    }
    seen.add(key);
    next.push(row);
  }

  return next;
};

/**
 * anchorKey の行の直後に区切りを挿す。HEAD_ANCHOR_KEY なら先頭。
 * id は呼び出し側（repository）が採番して渡す。ここを純粋に保つため。
 */
export const insertDividerAfter = (
  rows: ScheduleRowView[],
  anchorKey: string,
  divider: { id: string; label: string; startsAt: Date | null },
): ScheduleRowView[] | null => {
  const row = dividerRow(divider);

  if (anchorKey === HEAD_ANCHOR_KEY) {
    return [row, ...rows];
  }

  const index = rows.findIndex((current) => current.key === anchorKey);
  if (index === -1) {
    return null;
  }

  return [...rows.slice(0, index + 1), row, ...rows.slice(index + 1)];
};

/** 区切りのラベルと開始予定時刻を差し替える。対象が無ければ null。 */
export const updateDividerRow = (
  rows: ScheduleRowView[],
  id: string,
  label: string,
  startsAt: Date | null,
): ScheduleRowView[] | null => {
  const index = rows.findIndex(
    (row) => row.kind === "divider" && row.id === id,
  );
  if (index === -1) {
    return null;
  }

  const next = [...rows];
  next[index] = dividerRow({ id, label, startsAt });
  return next;
};

/** 区切りを取り除く。対象が無ければ null。 */
export const removeDividerRow = (
  rows: ScheduleRowView[],
  id: string,
): ScheduleRowView[] | null => {
  const index = rows.findIndex(
    (row) => row.kind === "divider" && row.id === id,
  );
  if (index === -1) {
    return null;
  }

  return [...rows.slice(0, index), ...rows.slice(index + 1)];
};
