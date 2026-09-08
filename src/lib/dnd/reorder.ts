/**
 * ドラッグの結果を並べ替え後のキー配列に直す。並べ替えにならない場合は null。
 *
 * D&D の実操作は jsdom で再現しにくいので、判断をここへ切り出して
 * 単体でテストできるようにしてある。コンポーネントは呼ぶだけにする。
 *
 * 大会の進行順（components/schedule）と部門の試合の実施順
 * （components/division）が同じ判断を必要とするため、どちらからも
 * 参照できる下位共通層に置く。lib は features / components を
 * 参照できない層なので、この関数がライブラリにも画面にも依存しない
 * 純粋関数であることが構造的に保たれる。
 *
 * @dnd-kit/sortable の arrayMove を使わないのは、この関数を
 * ライブラリに依存しない純粋関数に保ってテストを軽くするため。
 */
export const resolveDragReorder = (
  keys: string[],
  activeId: string,
  overId: string | null,
): string[] | null => {
  if (overId === null || activeId === overId) {
    return null;
  }

  const from = keys.indexOf(activeId);
  const to = keys.indexOf(overId);
  if (from === -1 || to === -1) {
    return null;
  }

  const next = [...keys];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
