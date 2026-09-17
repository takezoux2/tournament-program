import { DEFAULT_MATCH_NAME } from "./match-name";
import type {
  BracketMatch,
  BracketSide,
  DivisionEntries,
  DivisionEntry,
  DivisionResultConfig,
  DivisionResults,
  MatchingConfig,
  MatchResultRecord,
  MatchScoreEntry,
  ScoreAggregation,
  SlotSource,
} from "./types";
import {
  DEFAULT_DIVISION_RESULT_CONFIG,
  MAX_NOTE_LENGTH,
  MAX_SCORE_COUNT,
  MAX_SCORE_VALUE,
  MAX_WIN_REASON_LENGTH,
  MAX_WIN_REASON_OPTIONS,
} from "./types";

/** Json が想定の形をしていないことを表す。呼び出し元は入力エラーとして扱う。 */
export class DivisionJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DivisionJsonError";
  }
}

const fail = (path: string, expected: string): never => {
  throw new DivisionJsonError(
    `${path}: ${expected} を期待しましたが不正な値です`,
  );
};

const asRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "オブジェクト");
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown, path: string): string =>
  typeof value === "string" ? value : fail(path, "文字列");

const asInt = (value: unknown, path: string): number =>
  typeof value === "number" && Number.isInteger(value)
    ? value
    : fail(path, "整数");

const asArray = (value: unknown, path: string): unknown[] =>
  Array.isArray(value) ? value : fail(path, "配列");

const asVersion1 = (value: unknown, path: string): 1 =>
  value === 1 ? 1 : fail(path, "version 1");

const asBoolean = (value: unknown, path: string): boolean =>
  typeof value === "boolean" ? value : fail(path, "真偽値");

/**
 * スコア 1 つぶん。未入力の null は呼び出し側で先に弾く。
 * 範囲をここで見るのは、壊れた値が集計や画面に流れ込むのを入口で止めるため。
 */
const asScoreValue = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, "数値または null");
  }
  if (value < 0 || value > MAX_SCORE_VALUE) {
    return fail(path, `0 以上 ${MAX_SCORE_VALUE} 以下の数値`);
  }
  return value;
};

const asScoreAggregation = (value: unknown, path: string): ScoreAggregation => {
  const raw = asString(value, path);
  return raw === "sum" || raw === "average"
    ? raw
    : fail(path, '"sum" または "average"');
};

/** 勝因ラベル 1 件。選択肢・記録の両方で使う。 */
const asWinReasonLabel = (value: unknown, path: string): string => {
  const raw = asString(value, path);
  if (raw.length > MAX_WIN_REASON_LENGTH) {
    return fail(path, `${MAX_WIN_REASON_LENGTH} 文字以内の文字列`);
  }
  return raw;
};

const asNote = (value: unknown, path: string): string => {
  const raw = asString(value, path);
  if (raw.length > MAX_NOTE_LENGTH) {
    return fail(path, `${MAX_NOTE_LENGTH} 文字以内の文字列`);
  }
  return raw;
};

const parseMatchScoreEntry = (
  value: unknown,
  path: string,
): MatchScoreEntry => {
  const record = asRecord(value, path);
  return {
    entryId: asString(record.entryId, `${path}.entryId`),
    values: asArray(record.values, `${path}.values`).map((item, index) =>
      item === null ? null : asScoreValue(item, `${path}.values[${index}]`),
    ),
  };
};

const parseDivisionEntry = (value: unknown, path: string): DivisionEntry => {
  const record = asRecord(value, path);
  return {
    id: asString(record.id, `${path}.id`),
    participantId: asString(record.participantId, `${path}.participantId`),
    seed: asInt(record.seed, `${path}.seed`),
  };
};

const parseSlotSource = (value: unknown, path: string): SlotSource => {
  const record = asRecord(value, path);
  const kind = asString(record.kind, `${path}.kind`);
  switch (kind) {
    case "entry":
      return { kind, entryId: asString(record.entryId, `${path}.entryId`) };
    case "winnerOf":
      return {
        kind: "winnerOf",
        matchId: asString(record.matchId, `${path}.matchId`),
      };
    case "loserOf":
      return {
        kind: "loserOf",
        matchId: asString(record.matchId, `${path}.matchId`),
      };
    case "bye":
      return { kind };
    default:
      return fail(
        `${path}.kind`,
        "entry / winnerOf / loserOf / bye のいずれか",
      );
  }
};

const BRACKET_SIDES: readonly string[] = ["winners", "losers", "final"];

const parseBracketSide = (value: unknown, path: string): BracketSide => {
  const side = asString(value, path);
  return BRACKET_SIDES.includes(side)
    ? (side as BracketSide)
    : fail(path, "winners / losers / final のいずれか");
};

/** matchName 補完前の 1 試合。旧データには無い。 */
type ParsedBracketMatch = Omit<BracketMatch, "matchName"> & {
  matchName?: string;
};

const parseBracketMatch = (
  value: unknown,
  path: string,
): ParsedBracketMatch => {
  const record = asRecord(value, path);
  const slots = asArray(record.slots, `${path}.slots`);
  if (slots.length !== 2) {
    return fail(`${path}.slots`, "要素 2 個の配列");
  }
  const parsed: ParsedBracketMatch = {
    id: asString(record.id, `${path}.id`),
    bracket: parseBracketSide(record.bracket, `${path}.bracket`),
    round: asInt(record.round, `${path}.round`),
    order: asInt(record.order, `${path}.order`),
    slots: [
      parseSlotSource(slots[0], `${path}.slots[0]`),
      parseSlotSource(slots[1], `${path}.slots[1]`),
    ],
  };
  if (record.matchName !== undefined) {
    parsed.matchName = asString(record.matchName, `${path}.matchName`);
  }
  // 旧データの sequence（部門内の実施順）は読まずに捨てる。試合の順番は
  // 大会の進行順だけが持つ。型が合わない値でも読まないので弾かない。
  return parsed;
};

/**
 * matchName の無い試合（改名前に保存された旧データ）へ既定のテンプレートを入れる。
 *
 * 旧 matchNumber の値は読み継がない。リテラルの番号を残すと、その部門だけが
 * 進行順の並べ替えに追従しなくなり、新しく作った部門と挙動が分かれるため。
 * データ移行を行わない代わりに、読み出しが必ず完全な形へ正規化する。
 */
const fillMatchNames = (matches: ParsedBracketMatch[]): BracketMatch[] =>
  matches.map((match) =>
    match.matchName === undefined
      ? { ...match, matchName: DEFAULT_MATCH_NAME }
      : (match as BracketMatch),
  );

/** ブラケットの並び。勝者側 → 敗者側 → 決勝。 */
const BRACKET_RANK: Record<BracketMatch["bracket"], number> = {
  winners: 0,
  losers: 1,
  final: 2,
};

/**
 * ブラケット（勝者側 → 敗者側 → 決勝）→ round → order の順に並べる。
 *
 * Json の配列順は当てにできない（旧データは部門内の並べ替えで sequence 順に
 * 並んでいる）ので、読み出しで構造上の順に揃える。下流（試合名の一覧、
 * 進行順に行を持たない試合の末尾追加）は並べ直さずに配列の順を読む。
 *
 * ブラケットを先に見るのはダブルエリミのため。round は全ブラケット通しの
 * 番号（敗者側 L は L + 1）なので、round だけで並べると勝者側と敗者側が
 * 交互に混ざり、通し番号も飛び飛びになる。シングルエリミとリーグは
 * 全試合が winners なので並びは変わらない。
 */
const sortByPosition = (matches: BracketMatch[]): BracketMatch[] =>
  [...matches].sort(
    (left, right) =>
      BRACKET_RANK[left.bracket] - BRACKET_RANK[right.bracket] ||
      left.round - right.round ||
      left.order - right.order,
  );

const parseMatchResultRecord = (
  value: unknown,
  path: string,
): MatchResultRecord => {
  const record = asRecord(value, path);
  if (
    record.winnerEntryId !== null &&
    typeof record.winnerEntryId !== "string"
  ) {
    fail(`${path}.winnerEntryId`, "文字列または null");
  }
  const parsed: MatchResultRecord = {
    matchId: asString(record.matchId, `${path}.matchId`),
    winnerEntryId: record.winnerEntryId as string | null,
  };
  if (record.score !== undefined) {
    parsed.score = asString(record.score, `${path}.score`);
  }
  if (record.finishedAt !== undefined) {
    parsed.finishedAt = asString(record.finishedAt, `${path}.finishedAt`);
  }
  if (record.winReason !== undefined) {
    parsed.winReason = asWinReasonLabel(record.winReason, `${path}.winReason`);
  }
  if (record.scores !== undefined) {
    parsed.scores = asArray(record.scores, `${path}.scores`).map(
      (item, index) => parseMatchScoreEntry(item, `${path}.scores[${index}]`),
    );
  }
  if (record.note !== undefined) {
    parsed.note = asNote(record.note, `${path}.note`);
  }
  return parsed;
};

/** Division.entries の Json を検証して返す。不正なら DivisionJsonError。 */
export const parseDivisionEntries = (value: unknown): DivisionEntries => {
  const record = asRecord(value, "entries");
  return {
    version: asVersion1(record.version, "entries.version"),
    entries: asArray(record.entries, "entries.entries").map((item, index) =>
      parseDivisionEntry(item, `entries.entries[${index}]`),
    ),
  };
};

/** Division.matchingConfig の Json を検証して返す。不正なら DivisionJsonError。 */
export const parseMatchingConfig = (value: unknown): MatchingConfig => {
  const record = asRecord(value, "matchingConfig");
  return {
    version: asVersion1(record.version, "matchingConfig.version"),
    matches: sortByPosition(
      fillMatchNames(
        asArray(record.matches, "matchingConfig.matches").map((item, index) =>
          parseBracketMatch(item, `matchingConfig.matches[${index}]`),
        ),
      ),
    ),
  };
};

/** Division.results の Json を検証して返す。不正なら DivisionJsonError。 */
export const parseDivisionResults = (value: unknown): DivisionResults => {
  const record = asRecord(value, "results");
  return {
    version: asVersion1(record.version, "results.version"),
    matches: asArray(record.matches, "results.matches").map((item, index) =>
      parseMatchResultRecord(item, `results.matches[${index}]`),
    ),
  };
};

/** Division.resultConfig の Json を検証して返す。不正なら DivisionJsonError。 */
export const parseDivisionResultConfig = (
  value: unknown,
): DivisionResultConfig => {
  const record = asRecord(value, "resultConfig");
  const winReason = asRecord(record.winReason, "resultConfig.winReason");
  const score = asRecord(record.score, "resultConfig.score");
  const note = asRecord(record.note, "resultConfig.note");

  const count = asInt(score.count, "resultConfig.score.count");
  if (count < 1 || count > MAX_SCORE_COUNT) {
    fail("resultConfig.score.count", `1 以上 ${MAX_SCORE_COUNT} 以下の整数`);
  }

  const winReasonOptions = asArray(
    winReason.options,
    "resultConfig.winReason.options",
  );
  if (winReasonOptions.length > MAX_WIN_REASON_OPTIONS) {
    fail(
      "resultConfig.winReason.options",
      `${MAX_WIN_REASON_OPTIONS} 件以内の配列`,
    );
  }

  return {
    version: asVersion1(record.version, "resultConfig.version"),
    winReason: {
      enabled: asBoolean(winReason.enabled, "resultConfig.winReason.enabled"),
      options: winReasonOptions.map((item, index) =>
        asWinReasonLabel(item, `resultConfig.winReason.options[${index}]`),
      ),
    },
    score: {
      enabled: asBoolean(score.enabled, "resultConfig.score.enabled"),
      count,
      aggregation: asScoreAggregation(
        score.aggregation,
        "resultConfig.score.aggregation",
      ),
    },
    note: { enabled: asBoolean(note.enabled, "resultConfig.note.enabled") },
  };
};

/**
 * Division.resultConfig を読み、形が壊れていれば既定値に落とす。
 *
 * resultConfig は表示と入力欄の出し分けにしか使わないので、壊れていても
 * 画面（公開の試合一覧・ブラケット・編集画面）まで落とす理由が無い。
 * 既定値は 3 項目とも無効なので、設定が無かったころの見え方に戻るだけで済む。
 * 保存の経路では使わないこと（壊れた設定のまま書き込むのを見逃すため）。
 * DivisionJsonError 以外の例外は不具合なので、握りつぶさずにそのまま投げる。
 */
export const parseDivisionResultConfigOrDefault = (
  value: unknown,
): DivisionResultConfig => {
  try {
    return parseDivisionResultConfig(value);
  } catch (error) {
    if (error instanceof DivisionJsonError) {
      return DEFAULT_DIVISION_RESULT_CONFIG;
    }
    throw error;
  }
};
