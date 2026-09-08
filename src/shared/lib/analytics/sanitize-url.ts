/**
 * GA へ送るページパス。個体を指す ID を :id に伏せる。
 *
 * 伏せる理由は 2 つある。ユーザー ID のように個人を指す値を分析基盤へ
 * 渡さないこと、そして 1 大会につき 1 行になってしまうページ別レポートを
 * 画面ごとに集約して読めるようにすること。
 *
 * 判定は「値の見た目」ではなく「パスの位置」で行う。見た目で判定すると、
 * 16 文字以上の英数字だけの組織 slug や、数字だけの組織 slug（どちらも
 * validateSlug が許す）まで巻き込んで伏せてしまう。組織 slug は
 * 伏せない。どの組織で使われているかは運営上の指標として要るからである。
 */

/** 直後のセグメントが ID になる親。/orgs だけは slug なので入れない。 */
const ID_PARENTS = new Set(["tournaments", "divisions", "users", "t"]);

/** ID の位置に来るが ID ではない画面名。伏せると作成画面が消える。 */
const NOT_IDS = new Set(["new", "edit"]);

export const sanitizePagePath = (pathname: string): string => {
  const segments = pathname.split("/");
  return segments
    .map((segment, index) => {
      const parent = segments[index - 1];
      if (parent === undefined || !ID_PARENTS.has(parent)) return segment;
      if (segment === "" || NOT_IDS.has(segment)) return segment;
      return ":id";
    })
    .join("/");
};

/**
 * GA へ送る page_location。クエリ文字列は落とす。
 *
 * /reset-password?token=... のように一度きりの秘密をクエリに載せる
 * ページがあり、GA4 は既定では任意のクエリを除去しないため、
 * ここで確実に落とす。
 */
export const sanitizedPageLocation = (): string =>
  window.location.origin + sanitizePagePath(window.location.pathname);
