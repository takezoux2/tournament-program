import { createSlotLabeler } from "@/lib/division/label";
import {
  buildMatchDependents,
  downstreamMatchIdsFromDependents,
  type ResolvedMatch,
  resolveMatchSlots,
} from "@/lib/division/resolve";
import type {
  DivisionResultConfig,
  MatchResultRecord,
  MatchScoreEntry,
} from "@/lib/division/types";
import type {
  ScheduleDivision,
  ScheduleParticipant,
  ScheduleRowView,
} from "./types";

/** ボタン 1 つぶんの表示。entryId が入っているスロットだけが押せる。 */
export type ResultSlotView = {
  /** 確定なら参加者名、未確定なら「第3試合の勝者」、BYE なら "BYE" */
  label: string;
  entryId: string | null;
};

export type ResultRowState = "ready" | "recorded" | "waiting" | "bye";

/**
 * 結果入力の 1 行。区切りは見出しとしてラベルだけを運ぶ。
 * 開始予定時刻を載せないのは、日時の文字列化がサーバ側の仕事で、
 * features/schedule からは同列の features/tournament の書式化関数を
 * 参照できないため。結果の入力に時刻は要らない。
 */
export type ResultRowView =
  | {
      kind: "divider";
      key: string;
      label: string;
      /**
       * 区切りの開始予定時刻。書式化は画面側の仕事なので Date のまま運ぶ
       * （features/schedule からは同列の features/tournament を参照できない）。
       * 公開の試合一覧がこの型を使うため、結果入力には要らないが載せている。
       */
      startsAt: Date | null;
    }
  | {
      kind: "match";
      key: string;
      divisionId: string;
      divisionName: string;
      matchId: string;
      matchName: string;
      /** 「1回戦 (1)」。リーグは位置を持たないので空文字 */
      label: string;
      slots: [ResultSlotView, ResultSlotView];
      /** BYE の自動勝ち上がりを含む。決まっていなければ null */
      winnerEntryId: string | null;
      state: ResultRowState;
      /** 上書き・取り消しで消える下流の記録の件数。0 なら確認を出さない */
      downstreamRecordedCount: number;
      /** この試合が属する部門の結果入力の設定 */
      resultConfig: DivisionResultConfig;
      /** 記録済みの勝因。未設定は null */
      winReason: string | null;
      /** 記録済みの採点。未設定は空配列 */
      scores: MatchScoreEntry[];
      /** 記録済みのメモ。未設定は null */
      note: string | null;
    };

/**
 * BYE を先に見るのは、片側が不戦勝の試合は記録の有無にかかわらず
 * 入力させないため（勝者は自動で決まる）。
 */
const rowState = (
  resolved: ResolvedMatch,
  isRecorded: boolean,
): ResultRowState => {
  if (resolved.slots.some((slot) => slot.state === "bye")) {
    return "bye";
  }
  if (isRecorded) {
    return "recorded";
  }
  if (resolved.slots.some((slot) => slot.state === "pending")) {
    return "waiting";
  }
  return "ready";
};

/**
 * 進行順の行（buildScheduleView の出力）に、いま誰が立っているかと
 * 記録の状態を足す。並びには手を入れない。
 *
 * 解決とラベル付けは部門ごとに 1 度だけ作る。行ごとに作り直すと
 * 試合数に対して二乗に近い計算量になる。
 */
export const buildResultRows = (
  rows: ScheduleRowView[],
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
): ResultRowView[] => {
  // 展開済みの試合名は進行順の行（buildScheduleView の出力）が既に持っている。
  // 行は大会の全試合を含むので、部門ごとの「試合 id → 表示名」に組み直して
  // スロットの文言（「第3試合の勝者」）もそれで作る。通し番号をここで
  // 計算し直すと、進行順の一覧と結果入力で規則が 2 本になるため。
  const namesByDivision = new Map<string, Map<string, string>>();
  for (const row of rows) {
    if (row.kind !== "match") {
      continue;
    }
    const names = namesByDivision.get(row.divisionId) ?? new Map();
    names.set(row.matchId, row.matchName);
    namesByDivision.set(row.divisionId, names);
  }

  const context = new Map(
    divisions.map((division) => [
      division.id,
      {
        division,
        resolved: resolveMatchSlots(division.matchingConfig, division.results),
        labelSlot: createSlotLabeler(
          namesByDivision.get(division.id) ?? new Map<string, string>(),
          division.entries,
          participants,
        ),
        // 記録の有無だけでなく中身も要るので、id から記録を引く表にする。
        recordById: new Map<string, MatchResultRecord>(
          division.results.matches.map((record) => [record.matchId, record]),
        ),
        // id から試合を引く表。行ごとに matches を線形探索しないための Map。
        matchById: new Map(
          division.matchingConfig.matches.map((match) => [match.id, match]),
        ),
        // winnerOf / loserOf の対応表。downstreamMatchIds は呼ぶたびにこれを
        // 作り直すため、行ごとのループでは部門ごとに 1 度だけ作って使い回す。
        dependents: buildMatchDependents(division.matchingConfig),
      },
    ]),
  );

  return rows.flatMap((row): ResultRowView[] => {
    if (row.kind === "divider") {
      return [
        {
          kind: "divider",
          key: row.key,
          label: row.label,
          startsAt: row.startsAt,
        },
      ];
    }

    const current = context.get(row.divisionId);
    if (current === undefined) {
      return [];
    }
    const match = current.matchById.get(row.matchId);
    const resolved = current.resolved.get(row.matchId);
    if (match === undefined || resolved === undefined) {
      return [];
    }

    // 確定しているスロットは参加者名で呼ぶ。未確定は組み合わせ上の表記
    // （「第3試合の勝者」）を使う。BYE は、元のスロット定義が loserOf 等でも
    // （BYE の伝播で空き枠になった場合を含め）実際に立っているのは BYE なので、
    // "BYE" 固定で表示する。
    const slotView = (index: 0 | 1): ResultSlotView => {
      const slot = resolved.slots[index];
      if (slot.state === "entry") {
        return {
          label: current.labelSlot({ kind: "entry", entryId: slot.entryId }),
          entryId: slot.entryId,
        };
      }
      if (slot.state === "bye") {
        return { label: current.labelSlot({ kind: "bye" }), entryId: null };
      }
      return { label: current.labelSlot(match.slots[index]), entryId: null };
    };

    const downstream = downstreamMatchIdsFromDependents(
      row.matchId,
      current.dependents,
    );

    const record = current.recordById.get(row.matchId);

    return [
      {
        kind: "match",
        key: row.key,
        divisionId: row.divisionId,
        divisionName: row.divisionName,
        matchId: row.matchId,
        matchName: row.matchName,
        label: row.label,
        slots: [slotView(0), slotView(1)],
        winnerEntryId: resolved.winnerEntryId,
        state: rowState(resolved, record !== undefined),
        downstreamRecordedCount: [...downstream].filter((id) =>
          current.recordById.has(id),
        ).length,
        resultConfig: current.division.resultConfig,
        winReason: record?.winReason ?? null,
        scores: record?.scores ?? [],
        note: record?.note ?? null,
      },
    ];
  });
};
