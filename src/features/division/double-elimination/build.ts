import type {
  BracketMatch,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";
import { buildFromSlots, toSlots } from "../single-elimination/build";

/**
 * grandFinal: 勝者側優勝と敗者側優勝が決勝を戦う（再戦なし）。
 * thirdPlace: 決勝を持たず、敗者側優勝が 3 位。
 */
export type DoubleEliminationVariant = "grandFinal" | "thirdPlace";

/** 勝者側の id。buildFromSlots と同じ規則。 */
const winnersId = (round: number, order: number): string =>
  `m${round}-${order}`;
/** 敗者側の id。L は敗者側内でのラウンド番号（1 始まり）。 */
const losersId = (losersRound: number, order: number): string =>
  `l${losersRound}-${order}`;
const FINAL_ID = "f";

const winnerOf = (matchId: string): SlotSource => ({
  kind: "winnerOf",
  matchId,
});
const loserOf = (matchId: string): SlotSource => ({ kind: "loserOf", matchId });

/**
 * 勝者側 1 回戦のスロット割当からダブルエリミネーションの組み合わせを作る。
 *
 * 勝者側は buildFromSlots そのもの。敗者側は、
 *   L1: 勝者側 1 回戦の敗者どうし
 *   以降: 合流ラウンド（敗者側の勝者 vs 勝者側 r 回戦の敗者）と
 *         内部ラウンド（敗者側の勝者どうし）の繰り返し
 * で組む。合流する敗者の並びは 逆順 → 正順 … と交互にして、
 * 直前に当たった相手との早期再戦を避ける。
 *
 * round は全ブラケット通しの番号にする（敗者側 L は L + 1、決勝は 2k）。
 * validateMatchingConfig の「参照先の round は自分より小さい」と、
 * resolver の round 順 1 パス解決をそのまま使うため。
 *
 * 枠が 4 未満（エントリー 2 人以下）では敗者側が作れないので空を返す。
 */
export const buildDoubleElimination = (
  slots: SlotSource[],
  variant: DoubleEliminationVariant,
): MatchingConfig => {
  const winners = buildFromSlots(slots).matches;
  const firstRoundCount = winners.filter((match) => match.round === 1).length;
  if (firstRoundCount < 2) {
    return { version: 1, matches: [] };
  }
  const winnersRounds = Math.log2(firstRoundCount * 2);

  const matches: BracketMatch[] = [...winners];
  const push = (
    id: string,
    bracket: BracketMatch["bracket"],
    round: number,
    order: number,
    matchSlots: [SlotSource, SlotSource],
  ): string => {
    matches.push({
      id,
      bracket,
      round,
      order,
      sequence: matches.length,
      matchNumber: String(matches.length + 1),
      slots: matchSlots,
    });
    return id;
  };

  let losersRound = 1;
  let previous: string[] = [];
  for (let order = 0; order < firstRoundCount / 2; order += 1) {
    previous.push(
      push(losersId(losersRound, order), "losers", losersRound + 1, order, [
        loserOf(winnersId(1, order * 2)),
        loserOf(winnersId(1, order * 2 + 1)),
      ]),
    );
  }

  // grandFinal は勝者側決勝の敗者も落ちてくる。thirdPlace は準優勝で確定。
  const lastDropRound =
    variant === "grandFinal" ? winnersRounds : winnersRounds - 1;

  for (let winnersRound = 2; winnersRound <= lastDropRound; winnersRound += 1) {
    const reversed = winnersRound % 2 === 0;
    const count = previous.length;

    losersRound += 1;
    const dropped: string[] = [];
    for (let order = 0; order < count; order += 1) {
      const dropOrder = reversed ? count - 1 - order : order;
      dropped.push(
        push(losersId(losersRound, order), "losers", losersRound + 1, order, [
          winnerOf(previous[order]),
          loserOf(winnersId(winnersRound, dropOrder)),
        ]),
      );
    }
    previous = dropped;

    // 合流ラウンドが 1 試合ならそれが敗者側決勝。
    if (count === 1) {
      break;
    }

    losersRound += 1;
    const internal: string[] = [];
    for (let order = 0; order < count / 2; order += 1) {
      internal.push(
        push(losersId(losersRound, order), "losers", losersRound + 1, order, [
          winnerOf(previous[order * 2]),
          winnerOf(previous[order * 2 + 1]),
        ]),
      );
    }
    previous = internal;
  }

  if (variant === "grandFinal") {
    push(FINAL_ID, "final", winnersRounds * 2, 0, [
      winnerOf(winnersId(winnersRounds, 0)),
      winnerOf(previous[0]),
    ]);
  }

  return { version: 1, matches };
};

const slotKey = (slot: SlotSource): string => {
  switch (slot.kind) {
    case "entry":
      return `entry:${slot.entryId}`;
    case "winnerOf":
    case "loserOf":
      return `${slot.kind}:${slot.matchId}`;
    case "bye":
      return "bye";
  }
};

/** 構造だけの署名。試合番号と実施順は編集できるので比較に含めない。 */
const structureSignature = (config: MatchingConfig): string =>
  config.matches
    .map((match) =>
      [
        match.id,
        match.bracket,
        match.round,
        match.order,
        slotKey(match.slots[0]),
        slotKey(match.slots[1]),
      ].join("|"),
    )
    .sort()
    .join("\n");

/**
 * 保存されている組み合わせがこのバリアントのダブルエリミネーションの形か。
 *
 * /edit は format を無条件に書き換えられるため、別形式の組み合わせを
 * 持ったまま DE になった部門が存在しうる。勝者側 1 回戦から作り直した
 * ものと構造が一致するかで判定する（敗者側は常に自動導出なので、
 * 一致しない＝この画面が扱えない形）。空は「まだ作っていない」なので true。
 */
export const isDoubleEliminationShape = (
  config: MatchingConfig,
  variant: DoubleEliminationVariant,
): boolean => {
  if (config.matches.length === 0) {
    return true;
  }
  return (
    structureSignature(config) ===
    structureSignature(buildDoubleElimination(toSlots(config), variant))
  );
};
