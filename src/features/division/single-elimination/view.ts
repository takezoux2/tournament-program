import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
import { toSlots } from "./build";

/**
 * スロット 1 つの表示内容。
 *
 * bye（不戦勝の空き）と「参加者名を引けなかった entry」は画面では別物なので
 * 型でも分ける。まとめて label: null にすると、名前が引けないだけのスロットが
 * 「不戦勝」と表示され、ブラケットについて事実でないことを言ってしまう。
 * index はどちらの場合も swap-slots に渡す添字として意味を持つ。
 */
export type SetupSlotView =
  | {
      /** 1 回戦のスロット配列における通し番号。swap-slots に渡す添字と同じ。 */
      index: number;
      kind: "bye";
    }
  | {
      index: number;
      kind: "entry";
      /** null は「参加者を引けなかった」。エントリー自体は居る。 */
      label: string | null;
    };

export type SetupMatchView = {
  matchId: string;
  slots: [SetupSlotView, SetupSlotView];
};

/**
 * 保存済みの木を 1 回戦のカード一覧へ変換する。
 * 添字は toSlots と同じ並べ方で振るため、画面から送った添字が
 * そのままサーバ側の配列添字として通じる。
 *
 * 名前を引けなかったスロットは null にして画面を落とさない。
 * 参加者一覧が古いなど、突き合わせに失敗しても編集は続けられる方がよい。
 */
export const toSetupView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): SetupMatchView[] => {
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const nameByEntryId = new Map(
    entries.entries.map((entry) => [
      entry.id,
      participantById.get(entry.participantId) ?? null,
    ]),
  );

  const slots = toSlots(config);
  const matches: SetupMatchView[] = [];

  for (let order = 0; order * 2 + 1 < slots.length; order += 1) {
    const toView = (index: number): SetupSlotView => {
      const slot = slots[index];
      // 1 回戦に entry 以外が入るのは bye だけ。winnerOf / loserOf が来るのは
      // 壊れたデータで、そのときも空きとして描いて画面は落とさない。
      return slot.kind === "entry"
        ? {
            index,
            kind: "entry",
            label: nameByEntryId.get(slot.entryId) ?? null,
          }
        : { index, kind: "bye" };
    };

    matches.push({
      matchId: `m1-${order}`,
      slots: [toView(order * 2), toView(order * 2 + 1)],
    });
  }

  return matches;
};
