/**
 * 次の選手番号。10 進整数として読める番号の最大値 + 1。
 * 手入力の "A-1" のような番号は序数を持たないので最大値の計算から外す。
 *
 * 部門のエントリー追加（features/division/add-entry）と大会への直接追加
 * （features/participant/add）の 2 経路が同じ規則で番号を振る必要があるが、
 * features どうしは依存できないため、下位共通層に純粋関数として置く。
 */
export const nextPlayerNumber = (existing: readonly string[]): string => {
  const max = existing.reduce(
    (acc, value) => (/^\d+$/.test(value) ? Math.max(acc, Number(value)) : acc),
    0,
  );
  return String(max + 1);
};
