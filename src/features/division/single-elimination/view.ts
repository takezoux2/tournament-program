import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
import { toSlots } from "./build";

/** label が null なら bye、または名前を引けなかったスロット。 */
export type SetupSlotView = {
  /** 1 回戦のスロット配列における通し番号。swap-slots に渡す添字と同じ。 */
  index: number;
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
      return {
        index,
        label:
          slot.kind === "entry"
            ? (nameByEntryId.get(slot.entryId) ?? null)
            : null,
      };
    };

    matches.push({
      matchId: `m1-${order}`,
      slots: [toView(order * 2), toView(order * 2 + 1)],
    });
  }

  return matches;
};
