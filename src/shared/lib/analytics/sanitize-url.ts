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

/**
 * 見た目が明らかに ID のもの。位置の表に載っていないルートが
 * 増えたときの保険。位置だけで判定すると、後から
 * /invite/<token> のようなパスが足されたときに、誰かが
 * ID_PARENTS へ足すまで素通りしてしまう（fail-open）。
 * 形が厳密なので、組織 slug（[a-z0-9-] の 3〜50 文字）とは衝突しない。
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUID = /^c[a-z0-9]{24}$/;

export const sanitizePagePath = (pathname: string): string => {
  const segments = pathname.split("/");
  return segments
    .map((segment, index) => {
      if (segment === "") return segment;
      const parent = segments[index - 1];
      if (parent === undefined) return segment;
      if (ID_PARENTS.has(parent)) {
        return NOT_IDS.has(segment) ? segment : ":id";
      }
      // 組織 slug は形が ID に似ることがあり得ないので、ここだけ素通しにする。
      if (parent === "orgs") return segment;
      return UUID.test(segment) || CUID.test(segment) ? ":id" : segment;
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

/**
 * GA へ送る page_referrer。
 *
 * gtag は指定が無ければ document.referrer をそのまま載せる。ブラウザの
 * 既定（strict-origin-when-cross-origin）では同一オリジンの遷移で
 * クエリ込みの完全 URL が入るため、/reset-password?token=... から
 * ページを移動しただけで、次のヒットの参照元としてトークンが飛ぶ。
 * page_location を塞いだだけでは同じ漏れが 1 つ隣の項目から起きる。
 *
 * 外部からの流入は流入元の分析に要るので、そのまま通す。伏せるのは
 * 自サイト内の URL だけでよい。
 */
export const sanitizedReferrer = (): string | undefined => {
  const referrer = document.referrer;
  if (referrer === "") return undefined;
  try {
    const url = new URL(referrer);
    if (url.origin !== window.location.origin) return referrer;
    return url.origin + sanitizePagePath(url.pathname);
  } catch {
    // 解釈できない参照元は捨てる。中身が読めない以上、安全側に倒す。
    return undefined;
  }
};
