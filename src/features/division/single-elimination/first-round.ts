import type {
  BracketMatch,
  DivisionEntries,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";
import { buildFromFirstRound, type FirstRoundPair } from "./build";

/** 1 回戦の試合数の上限。2 人 × 64 = 128 はトーナメントのエントリー上限と同じ。 */
export const MAX_FIRST_ROUND_MATCHES = 64;

const firstRoundMatches = (config: MatchingConfig): BracketMatch[] =>
  config.matches
    .filter((match) => match.bracket === "winners" && match.round === 1)
    .sort((left, right) => left.order - right.order);

/** 1 回戦の並び。Json の配列順は当てにできないので order で並べ直す。 */
export const firstRoundPairs = (config: MatchingConfig): FirstRoundPair[] =>
  firstRoundMatches(config).map((match) => [match.slots[0], match.slots[1]]);

/** ある組み合わせの中で最も深いラウンド番号。試合が無ければ 0。 */
const maxRoundOf = (config: MatchingConfig): number =>
  config.matches.reduce((max, match) => Math.max(max, match.round), 0);

/**
 * 2 回戦以降の試合を「決勝からの深さ」と order で引くための鍵。
 * round そのものではなく決勝からの距離を使うのは、1 回戦の試合数が
 * 2 の冪をまたぐと 2 回戦以降の段数（round の総数）自体が伸び縮みし、
 * 同じ試合でも round 番号が変わってしまうため。例えば 3 試合なら
 * 準決勝が round2・決勝が round3 だが、2 試合に減ると決勝は round2
 * になる。「決勝から何段目か」（0 = 決勝）は組み直しても変わらない
 * ので、これを共通の鍵にして previous と next を対応付ける。
 */
const higherRoundKey = (maxRound: number, match: BracketMatch): string =>
  `${maxRound - match.round}:${match.order}`;

/**
 * 組み直した木へ、手で付けた試合名を引き継ぐ。
 *
 * 1 回戦（round === 1）は renamedIds（「旧 id → 新 id」。削除した試合は
 * null、載っていない id はそのまま同じ id）で引き継ぐ。削除で後続の試合が
 * 詰まると id がずれるため、呼び出し側がずれを明示する（id だけで照合すると
 * 名前が隣の試合へ移る）。
 *
 * 2 回戦以降（round >= 2）は id でも renamedIds でもなく、決勝からの深さ +
 * order（higherRoundKey）で previous と next を対応付ける。1 回戦の試合数が
 * 2 の冪をまたぐと 2 回戦以降の段数が変わり、同じ試合でも round 番号（＝id）
 * が変わるため（例: 3 試合の準決勝 m2-0 は 2 試合になると存在しなくなり、
 * 3 試合の決勝 m3-0 は 2 試合の決勝 m2-0 になる）。対応する深さが next に
 * 無ければその名前は消える。1 回戦の名前が 2 回戦以降へ、またはその逆へ
 * 移ることは無い。
 */
export const carryMatchNames = (
  previous: MatchingConfig,
  next: MatchingConfig,
  renamedIds: ReadonlyMap<string, string | null> = new Map(),
): MatchingConfig => {
  const round1Names = new Map<string, string>();
  const higherNames = new Map<string, string>();
  const previousMaxRound = maxRoundOf(previous);
  for (const match of previous.matches) {
    if (match.round === 1) {
      const target = renamedIds.has(match.id)
        ? renamedIds.get(match.id)
        : match.id;
      if (target !== null && target !== undefined) {
        round1Names.set(target, match.matchName);
      }
    } else {
      higherNames.set(higherRoundKey(previousMaxRound, match), match.matchName);
    }
  }

  const nextMaxRound = maxRoundOf(next);
  return {
    ...next,
    matches: next.matches.map((match) => {
      const name =
        match.round === 1
          ? round1Names.get(match.id)
          : higherNames.get(higherRoundKey(nextMaxRound, match));
      return name === undefined ? match : { ...match, matchName: name };
    }),
  };
};

/** 両スロットが空の試合を 1 回戦の末尾に足し、配線し直す。上限の確認は呼び出し側。 */
export const addFirstRoundMatch = (config: MatchingConfig): MatchingConfig =>
  carryMatchNames(
    config,
    buildFromFirstRound([
      ...firstRoundPairs(config),
      [{ kind: "bye" }, { kind: "bye" }],
    ]),
  );

const entryIdsOf = (slots: readonly SlotSource[]): string[] =>
  slots.flatMap((slot) => (slot.kind === "entry" ? [slot.entryId] : []));

/**
 * 1 回戦の試合を消して配線し直す。消えた試合に居た選手の entryId も返す
 * （呼び出し側が entries から除くため）。1 回戦に無い id なら null。
 */
export const removeFirstRoundMatch = (
  config: MatchingConfig,
  matchId: string,
): { config: MatchingConfig; removedEntryIds: string[] } | null => {
  const matches = firstRoundMatches(config);
  const index = matches.findIndex((match) => match.id === matchId);
  if (index === -1) {
    return null;
  }

  const rebuilt = buildFromFirstRound(
    matches
      .filter((_, position) => position !== index)
      .map((match): FirstRoundPair => [match.slots[0], match.slots[1]]),
  );
  const rebuiltFirstRound = firstRoundMatches(rebuilt);

  const renamedIds = new Map<string, string | null>();
  matches.forEach((match, position) => {
    if (position === index) {
      renamedIds.set(match.id, null);
    } else if (position > index) {
      renamedIds.set(match.id, rebuiltFirstRound[position - 1].id);
    }
  });

  return {
    config: carryMatchNames(config, rebuilt, renamedIds),
    removedEntryIds: entryIdsOf(matches[index].slots),
  };
};

/**
 * 1 回戦の 1 スロットを差し替える。木の形は変わらないので組み直さない。
 * 前の中身を返すのは、呼び出し側が押し出された選手のエントリーを消すため。
 */
export const setFirstRoundSlot = (
  config: MatchingConfig,
  matchId: string,
  slotIndex: 0 | 1,
  source: SlotSource,
): { config: MatchingConfig; replaced: SlotSource } | null => {
  const target = firstRoundMatches(config).find(
    (match) => match.id === matchId,
  );
  if (target === undefined) {
    return null;
  }

  const slots: [SlotSource, SlotSource] = [target.slots[0], target.slots[1]];
  slots[slotIndex] = source;

  return {
    config: {
      ...config,
      matches: config.matches.map((match) =>
        match.id === matchId ? { ...match, slots } : match,
      ),
    },
    replaced: target.slots[slotIndex],
  };
};

export const removeEntries = (
  entries: DivisionEntries,
  entryIds: readonly string[],
): DivisionEntries => ({
  ...entries,
  entries: entries.entries.filter((entry) => !entryIds.includes(entry.id)),
});
