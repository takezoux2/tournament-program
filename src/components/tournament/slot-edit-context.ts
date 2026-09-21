"use client";

import { createContext, useContext } from "react";

/**
 * ブラケットを編集画面として使うときだけ与える。React Flow のノードには
 * 関数を data として渡すより context で届けるほうが、ノードの再生成と
 * 無関係に済む。null（既定）のときは閲覧専用で、鉛筆を出さない。
 */
export type SlotEditContextValue = {
  locked: boolean;
  onEditSlot: (matchId: string, slotIndex: 0 | 1) => void;
};

export const SlotEditContext = createContext<SlotEditContextValue | null>(null);

export const useSlotEdit = (): SlotEditContextValue | null =>
  useContext(SlotEditContext);
