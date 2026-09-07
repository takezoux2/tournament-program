/**
 * 孤児化ガードに引っかかったときの案内。
 *
 * 組織名を挙げるのは、どこを直せばよいか分からないと詰むため。
 * 自分が所属している組織の名前なので、これを見せても何も漏れない。
 */
export const soleGranterMessage = (
  organizations: { name: string }[],
): string => {
  const names = organizations
    .map((organization) => organization.name)
    .join("、");
  return `${names} では、権限を配れるのがあなただけです。他の人に「権限の付与」を渡してから、再度お試しください`;
};
