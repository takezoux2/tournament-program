import type { DivisionFormat } from "@/generated/prisma/enums";
import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";

/**
 * ScheduleItem の 1 行を判別可能ユニオンに直した形。
 * DB では kind に依存して使う列が変わる（行の多相化）ため、
 * 列の組み合わせが壊れている行は parse.ts で落として、この型より先へ運ばない。
 */
export type ScheduleItemRecord =
  | { kind: "match"; id: string; divisionId: string; matchId: string }
  | { kind: "divider"; id: string; label: string; startsAt: Date | null };

/** マージの材料になる部門。Json は検証済みの形で受け取る。 */
export type ScheduleDivision = {
  id: string;
  name: string;
  /** 大会内での表示順。行の無い試合を末尾へ足すときの並び順に使う。 */
  order: number;
  /** 試合の位置の文言（回戦か節か）を決めるのに使う。 */
  format: DivisionFormat;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
  /** 勝敗記録。進行順のマージ（buildScheduleView）では使わず、結果入力の行だけが使う。 */
  results: DivisionResults;
};

/** 表示名の解決に使う参加者。 */
export type ScheduleParticipant = { id: string; name: string };

/**
 * 一覧の 1 行。key が画面とサーバの間で行を指す唯一の識別子で、
 * ScheduleItem.id ではない（行がまだ DB に無い試合もあるため）。
 */
export type ScheduleRowView =
  | {
      kind: "match";
      /** `match:{divisionId}:{matchId}` */
      key: string;
      divisionId: string;
      divisionName: string;
      matchId: string;
      matchNumber: string;
      /** 「1回戦 第1試合」 */
      label: string;
      /** 「山田 vs 第3試合の勝者」 */
      card: string;
    }
  | {
      kind: "divider";
      /** `divider:{id}` */
      key: string;
      /** ScheduleItem.id。更新・削除はこの id を送る。 */
      id: string;
      label: string;
      startsAt: Date | null;
      /**
       * startsAt を <input type="datetime-local"> の value 形式にしたもの。
       * 画面側で組み立てないのは、行を描くのがクライアントコンポーネントで、
       * 組み立てるとブラウザの時刻帯、受け取って new Date するのはサーバの
       * 時刻帯になり、時差のぶん保存値がずれるため。サーバで作って運ぶ。
       */
      startsAtInput: string;
    };

/** 書き戻す 1 行。order は保存時に 0..n-1 で振り直すので持たない。 */
export type ScheduleSaveItem =
  | { kind: "match"; divisionId: string; matchId: string }
  | { kind: "divider"; id: string; label: string; startsAt: Date | null };
