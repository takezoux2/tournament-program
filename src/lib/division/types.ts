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
  /** 1 = 1 回戦。ROUND_ROBIN では節番号 */
  round: number;
  /** ラウンド内の上からの位置。0 始まり */
  order: number;
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

export const EMPTY_DIVISION_ENTRIES: DivisionEntries = {
  version: 1,
  entries: [],
};

export const EMPTY_MATCHING_CONFIG: MatchingConfig = {
  version: 1,
  matches: [],
};

export const EMPTY_DIVISION_RESULTS: DivisionResults = {
  version: 1,
  matches: [],
};
