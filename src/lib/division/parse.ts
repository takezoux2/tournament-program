import type {
  BracketMatch,
  BracketSide,
  DivisionEntries,
  DivisionEntry,
  DivisionResults,
  MatchingConfig,
  MatchResultRecord,
  SlotSource,
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

const parseBracketMatch = (value: unknown, path: string): BracketMatch => {
  const record = asRecord(value, path);
  const slots = asArray(record.slots, `${path}.slots`);
  if (slots.length !== 2) {
    fail(`${path}.slots`, "要素 2 個の配列");
  }
  return {
    id: asString(record.id, `${path}.id`),
    bracket: parseBracketSide(record.bracket, `${path}.bracket`),
    round: asInt(record.round, `${path}.round`),
    order: asInt(record.order, `${path}.order`),
    slots: [
      parseSlotSource(slots[0], `${path}.slots[0]`),
      parseSlotSource(slots[1], `${path}.slots[1]`),
    ],
  };
};

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
    matches: asArray(record.matches, "matchingConfig.matches").map(
      (item, index) =>
        parseBracketMatch(item, `matchingConfig.matches[${index}]`),
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
