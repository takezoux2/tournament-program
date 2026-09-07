/**
 * GA へ送るページパス。個体を指す ID を :id に伏せる。
 *
 * 伏せる理由は 2 つある。ユーザー ID のように個人を指す値を分析基盤へ
 * 渡さないこと、そして 1 大会につき 1 行になってしまうページ別レポートを
 * 画面ごとに集約して読めるようにすること。
 *
 * 組織 slug は伏せない。どの組織で使われているかは運営上の指標として要る。
 */
const ID_LIKE = /^(?:\d+|[0-9a-f-]{16,}|[a-z0-9]{16,})$/i;

export const sanitizePagePath = (pathname: string): string =>
  pathname
    .split("/")
    .map((segment) => (ID_LIKE.test(segment) ? ":id" : segment))
    .join("/");
