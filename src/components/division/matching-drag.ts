const PREFIX = "slot-";

/** D&D の識別子。サーバへ送る添字と 1 対 1 に対応させる。 */
export const slotDomId = (index: number): string => `${PREFIX}${index}`;

const toIndex = (id: string): number | null => {
  if (!id.startsWith(PREFIX)) {
    return null;
  }
  const index = Number(id.slice(PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

/**
 * ドラッグの結果を入れ替えの添字へ直す。入れ替えにならない場合は null。
 *
 * D&D の実操作は jsdom で再現しにくいので、判断をここへ切り出して
 * 単体でテストできるようにしてある。コンポーネントは呼ぶだけにする。
 */
export const resolveDragSwap = (
  activeId: string,
  overId: string | null,
): [number, number] | null => {
  if (overId === null || activeId === overId) {
    return null;
  }

  const from = toIndex(activeId);
  const to = toIndex(overId);
  if (from === null || to === null) {
    return null;
  }

  return [from, to];
};
