/** Division.entries の 1 要素。「誰がこの部門に何番シードで出るか」。 */
export type DivisionEntry = {
  /** 部門内で一意。matchingConfig / results はこの id で参照する */
  id: string;
  /** Participant.id */
  participantId: string;
  /** 部門内でのシード順。0 始まり */
  seed: number;
};

/** Division.entries の全体。 */
export type DivisionEntries = {
  version: 1;
  entries: DivisionEntry[];
};

/** 試合スロットが何によって埋まるか。 */
export type SlotSource =
  | { kind: "entry"; entryId: string }
  | { kind: "winnerOf"; matchId: string }
  | { kind: "loserOf"; matchId: string }
  | { kind: "bye" };

/** 試合がどのブラケットに属するか。シングルエリミネーションとリーグは "winners" 固定。 */
export type BracketSide = "winners" | "losers" | "final";

/** 組み合わせの中の 1 試合。 */
export type BracketMatch = {
  /** 部門内で一意 */
  id: string;
  bracket: BracketSide;
  /** 1 = 1 回戦。ROUND_ROBIN は節を持たないので常に 1 */
  round: number;
  /**
   * ラウンド内の上からの位置。0 始まり。
   *
   * round/order は「ブラケット上のどこにある試合か」を表し、描画座標に
   * そのまま使われる（features/bracket/layout-bracket.ts）。部門の中の
   * 実施順は持たない。試合の順番は大会の進行順（ScheduleItem）だけが決める。
   */
  order: number;
  /**
   * 表示用の試合名のテンプレート。{{OverallSeq}}（大会の進行順の通し番号）を使える。
   * 部門内で重複してよい（既定値は全試合で同じ文字列になる）
   */
  matchName: string;
  slots: [SlotSource, SlotSource];
};

/** Division.matchingConfig の全体。展開済みの組み合わせ。 */
export type MatchingConfig = {
  version: 1;
  matches: BracketMatch[];
};

/** スコア欄の数の上限。1 以上この値以下。 */
export const MAX_SCORE_COUNT = 8;
/** 勝因の選択肢の件数の上限。 */
export const MAX_WIN_REASON_OPTIONS = 20;
/** 勝因ラベル 1 件の文字数の上限。 */
export const MAX_WIN_REASON_LENGTH = 30;
/** メモの文字数の上限。 */
export const MAX_NOTE_LENGTH = 1000;
/** スコアの値の上限。下限は 0。 */
export const MAX_SCORE_VALUE = 999.99;

/** 集計方法。スコアを 1 つの数にまとめる方法。 */
export type ScoreAggregation = "sum" | "average";

/**
 * Division.resultConfig の全体。結果入力で何を記録できるかの設定。
 *
 * ここは「表示と入力のフィルタ」でしかない。enabled を false にしても
 * results に入っている記録は消さないし、書き換えもしない。大会の最中に
 * 設定を足したり誤って外したりしても入力済みの値が失われないようにするため。
 */
export type DivisionResultConfig = {
  version: 1;
  winReason: { enabled: boolean; options: string[] };
  /** count は 1〜MAX_SCORE_COUNT。片方あたりのスコア欄の数 */
  score: { enabled: boolean; count: number; aggregation: ScoreAggregation };
  note: { enabled: boolean };
};

/** 1 人ぶんの採点。 */
export type MatchScoreEntry = {
  /**
   * DivisionEntry.id。スロット番号（0/1）で持たないのは、swap-slots で
   * スロットを入れ替えたときに採点が別人に付け替わってしまうため。
   */
  entryId: string;
  /** 未入力は null。長さは保存時の resultConfig.score.count */
  values: (number | null)[];
};

/** Division.results の 1 要素。 */
export type MatchResultRecord = {
  /** BracketMatch.id */
  matchId: string;
  /** DivisionEntry.id。null = 引き分け（ROUND_ROBIN でのみ許可） */
  winnerEntryId: string | null;
  /**
   * 旧・表示用スコア文字列（"3-1" など）。どこからも書き込まれていない。
   * 構造化した scores を足したので今後も書かない。既存データのために読むだけ。
   */
  score?: string;
  /** ISO 8601 */
  finishedAt?: string;
  /** 勝因。現在の resultConfig.winReason.options に無い値も保持する */
  winReason?: string;
  /** 両者ぶんの採点。片方だけの記録も許す */
  scores?: MatchScoreEntry[];
  note?: string;
};

/** Division.results の全体。 */
export type DivisionResults = {
  version: 1;
  matches: MatchResultRecord[];
};

// 空配列リテラルは `never[]` に推論され `Object.freeze([]) as X[]` は型エラーになるため、
// 一度 readonly X[] に型付けしてから X[] へキャストする。
const EMPTY_ENTRY_LIST: readonly DivisionEntry[] = Object.freeze([]);
const EMPTY_BRACKET_MATCH_LIST: readonly BracketMatch[] = Object.freeze([]);
const EMPTY_MATCH_RESULT_LIST: readonly MatchResultRecord[] = Object.freeze([]);

export const EMPTY_DIVISION_ENTRIES: DivisionEntries = Object.freeze({
  version: 1,
  entries: EMPTY_ENTRY_LIST as DivisionEntry[],
});

export const EMPTY_MATCHING_CONFIG: MatchingConfig = Object.freeze({
  version: 1,
  matches: EMPTY_BRACKET_MATCH_LIST as BracketMatch[],
});

export const EMPTY_DIVISION_RESULTS: DivisionResults = Object.freeze({
  version: 1,
  matches: EMPTY_MATCH_RESULT_LIST as MatchResultRecord[],
});

// 空配列リテラルと同じ理由で、一度 readonly に型付けしてからキャストする。
const DEFAULT_WIN_REASON_OPTIONS: readonly string[] = Object.freeze([
  "一本勝ち",
  "判定勝ち",
  "反則負け",
  "棄権",
]);

/**
 * Division.resultConfig の既定値。列の @default と同じ内容を持つ。
 *
 * 3 項目とも無効にしてあるので、既存の部門の見え方と操作は何も変わらない。
 * 一方 options には語を入れてあるので、チェックを 1 つ入れるだけで使い始められる。
 */
export const DEFAULT_DIVISION_RESULT_CONFIG: DivisionResultConfig =
  Object.freeze({
    version: 1,
    winReason: Object.freeze({
      enabled: false,
      options: DEFAULT_WIN_REASON_OPTIONS as string[],
    }),
    score: Object.freeze({
      enabled: false,
      count: 3,
      aggregation: "sum" as ScoreAggregation,
    }),
    note: Object.freeze({ enabled: false }),
  });
