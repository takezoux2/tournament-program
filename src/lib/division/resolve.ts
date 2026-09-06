import type {
  DivisionResults,
  MatchingConfig,
  SlotSource,
} from "./types";

/** スロットに誰が立っているか。pending は前の試合の結果待ち。 */
export type ResolvedSlot =
  | { state: "entry"; entryId: string }
  | { state: "pending" }
  | { state: "bye" };

/** 1 試合ぶんの解決結果。winnerEntryId は BYE の自動勝ち上がりを含む。 */
export type ResolvedMatch = {
  slots: [ResolvedSlot, ResolvedSlot];
  winnerEntryId: string | null;
};

/**
 * 記録と BYE から、この試合の勝者を決める。
 *
 * BYE を優先するのは、片側が不戦勝の試合は記録が無くても勝者が決まるため。
 * 記録された勝者がどちらのスロットにも立っていない場合は、例外を投げずに
 * 勝者なしとして読む。読み出しで落とさないのは label.ts が引けない参加者を
 * 「（不明な参加者）」にするのと同じ思想で、壊れたデータ 1 件で一覧全体が
 * 見えなくなる方が困るため。
 */
const decideWinner = (
  slots: [ResolvedSlot, ResolvedSlot],
  recorded: string | null | undefined,
): string | null => {
  const hasBye = slots.some((slot) => slot.state === "bye");
  if (hasBye) {
    const standing = slots.find((slot) => slot.state === "entry");
    return standing !== undefined && standing.state === "entry"
      ? standing.entryId
      : null;
  }

  if (recorded === undefined || recorded === null) {
    return null;
  }
  const stands = slots.some(
    (slot) => slot.state === "entry" && slot.entryId === recorded,
  );
  return stands ? recorded : null;
};

/**
 * 組み合わせと勝敗記録を突き合わせ、各試合のスロットに誰が立っているかを返す。
 *
 * round 昇順 → order 昇順の 1 パスで、解決済みの勝者を次のラウンドへ伝播する。
 * validateMatchingConfig が「参照先の round は自分より小さい」を保証しているので
 * 循環しない。未検証の入力でも止まるよう、参照先が未解決なら pending にする。
 */
export const resolveMatchSlots = (
  config: MatchingConfig,
  results: DivisionResults,
): Map<string, ResolvedMatch> => {
  const recordedWinner = new Map(
    results.matches.map((record) => [record.matchId, record.winnerEntryId]),
  );
  const resolved = new Map<string, ResolvedMatch>();

  const resolveSlot = (source: SlotSource): ResolvedSlot => {
    switch (source.kind) {
      case "bye":
        return { state: "bye" };
      case "entry":
        return { state: "entry", entryId: source.entryId };
      case "winnerOf": {
        const winner = resolved.get(source.matchId)?.winnerEntryId ?? null;
        return winner === null
          ? { state: "pending" }
          : { state: "entry", entryId: winner };
      }
      case "loserOf": {
        const origin = resolved.get(source.matchId);
        if (origin === undefined || origin.winnerEntryId === null) {
          return { state: "pending" };
        }
        // 勝者が決まっていても、敗者側が entry として確定しているとは限らない
        // （BYE 相手の不戦勝など）。その場合は pending のままにする。
        const loser = origin.slots.find(
          (slot) =>
            slot.state === "entry" && slot.entryId !== origin.winnerEntryId,
        );
        return loser !== undefined && loser.state === "entry"
          ? { state: "entry", entryId: loser.entryId }
          : { state: "pending" };
      }
    }
  };

  const ordered = [...config.matches].sort(
    (left, right) => left.round - right.round || left.order - right.order,
  );

  for (const match of ordered) {
    const slots: [ResolvedSlot, ResolvedSlot] = [
      resolveSlot(match.slots[0]),
      resolveSlot(match.slots[1]),
    ];
    resolved.set(match.id, {
      slots,
      winnerEntryId: decideWinner(slots, recordedWinner.get(match.id)),
    });
  }

  return resolved;
};

/**
 * 「どの試合が、どの試合を winnerOf / loserOf で参照しているか」の対応表。
 *
 * downstreamMatchIds を行ごとに呼ぶと、呼ぶたびに全試合を舐めてこの対応表を
 * 作り直すことになり、試合数に対して二乗に近い計算量になる。一覧表示のように
 * 同じ部門で何度も辿る場合は、ここで対応表を部門ごとに 1 度だけ作り、
 * downstreamMatchIdsFromDependents に渡すこと。
 */
export const buildMatchDependents = (
  config: MatchingConfig,
): Map<string, string[]> => {
  const dependents = new Map<string, string[]>();
  for (const match of config.matches) {
    for (const slot of match.slots) {
      if (slot.kind === "winnerOf" || slot.kind === "loserOf") {
        const list = dependents.get(slot.matchId) ?? [];
        list.push(match.id);
        dependents.set(slot.matchId, list);
      }
    }
  }
  return dependents;
};

/**
 * 対応表（buildMatchDependents の戻り値）から、その試合を winnerOf / loserOf で
 * 推移的に参照する試合の id を集める。勝者を変えたときに取り消すべき記録の
 * 範囲がこれで、画面に出す「あとの試合の結果 N 件」もこの集合から数える。
 */
export const downstreamMatchIdsFromDependents = (
  matchId: string,
  dependents: Map<string, string[]>,
): Set<string> => {
  const found = new Set<string>();
  const stack = [matchId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    for (const next of dependents.get(current) ?? []) {
      // 自分自身は含めない。壊れた参照でも訪問済みなら二度と辿らない。
      if (next === matchId || found.has(next)) {
        continue;
      }
      found.add(next);
      stack.push(next);
    }
  }

  return found;
};

/**
 * downstreamMatchIdsFromDependents の薄いラッパ。呼ぶたびに対応表を作り直すため、
 * 同じ部門で何度も呼ぶ場所（行ごとのループなど）では使わないこと。
 * 1 回きりの呼び出し向け。
 */
export const downstreamMatchIds = (
  matchId: string,
  config: MatchingConfig,
): Set<string> =>
  downstreamMatchIdsFromDependents(matchId, buildMatchDependents(config));
