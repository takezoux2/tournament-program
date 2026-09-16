/** 参加者マスタ。「誰が出るか」だけを持ち、勝敗は一切持たない。 */
export type Participant = {
  id: string;
  name: string;
  seed: number;
  team?: string;
};

/** 試合スロットが何によって埋まるか。 */
export type SlotSource =
  | { kind: "participant"; participantId: string }
  | { kind: "winnerOf"; matchId: string }
  | { kind: "bye" };

/** ブラケット構造上の 1 試合。「誰と誰がいつ当たるか」。 */
export type Match = {
  id: string;
  /** 1 = 1 回戦 */
  round: number;
  /** ラウンド内の上からの位置。0 始まり */
  order: number;
  /** 表示用の試合名。mock など無い場合は省略可 */
  matchName?: string;
  slots: [SlotSource, SlotSource];
};

export type Bracket = {
  id: string;
  name: string;
  matches: Match[];
};

/** 勝敗データ。Participant / Bracket から完全に独立している。 */
export type MatchResult = {
  matchId: string;
  winnerId: string;
  /** "3-1" などの表示用文字列 */
  score?: string;
  /** 決着のつき方。「一本勝ち」など */
  winReason?: string;
  /**
   * 参加者ごとの表示用スコア。集計（合計か平均か）は呼び出し元が済ませて
   * 文字列にしてから渡す。こうすると features/bracket は部門の設定を知らずに済む。
   */
  scores?: { participantId: string; score: string }[];
  note?: string;
};

export type SlotState = "confirmed" | "pending" | "bye";

export type ResolvedSlot = {
  /** pending / bye のときは null */
  participant: Participant | null;
  state: SlotState;
  isWinner: boolean;
  /** 表示用スコア。無ければ null */
  score: string | null;
};

export type MatchStatus = "done" | "ready" | "waiting" | "bye";

/** 3 つのデータを突き合わせた、描画用の 1 試合。 */
export type ResolvedMatch = {
  id: string;
  round: number;
  order: number;
  /** 表示用の試合名。元データに無ければ null */
  matchName: string | null;
  slots: [ResolvedSlot, ResolvedSlot];
  winnerId: string | null;
  score: string | null;
  /** 決着のつき方。「一本勝ち」など。記録が無ければ null */
  winReason: string | null;
  /** 運営メモ。記録が無ければ null */
  note: string | null;
  status: MatchStatus;
  /** 各スロットの供給元試合 id。エッジ生成とレイアウトに使う */
  sourceMatchIds: [string | null, string | null];
};
