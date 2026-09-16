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

/** Division.results の 1 要素。 */
export type MatchResultRecord = {
  /** BracketMatch.id */
  matchId: string;
  /** DivisionEntry.id。null = 引き分け（ROUND_ROBIN でのみ許可） */
  winnerEntryId: string | null;
  /** "3-1" などの表示用文字列 */
  score?: string;
  /** ISO 8601 */
  finishedAt?: string;
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
