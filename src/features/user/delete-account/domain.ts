/**
 * 孤児化ガードに引っかかったときの案内。
 *
 * 組織名を挙げるのは、どこを直せばよいか分からないと詰むため。
 * 自分が所属している組織の名前なので、これを見せても何も漏れない。
 *
 * 組織を作成すると、創設者がすべての権限を持ち、唯一のメンバーになる。
 * その場合、「権限の付与」を他の人に渡す人がいないため、
 * 組織の削除がそこから抜ける唯一の方法である。
 */
export const soleGranterMessage = (
  organizations: { name: string }[],
): string => {
  const names = organizations
    .map((organization) => organization.name)
    .join("、");
  return `${names} では、権限を配れるのがあなただけです。他の人に「権限の付与」を渡すか、その組織を削除してから、再度お試しください`;
};
