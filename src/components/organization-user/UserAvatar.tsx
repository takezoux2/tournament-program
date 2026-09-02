/**
 * ユーザーのアイコン。image は Google などの外部プロバイダの URL が入るため、
 * next/image の remotePatterns 設定なしで表示できる素の img を使う。
 */
export function UserAvatar({
  name,
  image,
}: {
  name: string;
  image: string | null;
}) {
  if (image !== null) {
    return (
      // biome-ignore lint/performance/noImgElement: 外部プロバイダのアイコン URL を設定なしで表示するため
      <img
        src={image}
        alt=""
        // alt="" だけだと暗黙のロールが presentation になり、
        // テストの getByRole("img") で拾えない。role を明示して上書きする。
        role="img"
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-600"
    >
      {name.slice(0, 1)}
    </span>
  );
}
