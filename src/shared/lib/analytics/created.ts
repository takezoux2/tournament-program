import type { AnalyticsEvent } from "./events";

/**
 * 作成完了を遷移先へ伝えるクエリの値と、それが表す GA イベント名。
 * ハンドラー（?created= を吐く側）と TrackCreated（読む側）が
 * 同じ定義を共有することで、どちらかを直したときにもう一方の
 * 直し忘れが型エラーとして出る。
 */
export const CREATED_EVENTS = {
  organization: "create_organization",
  tournament: "create_tournament",
  division: "create_division",
} as const satisfies Record<string, AnalyticsEvent>;

export type CreatedKind = keyof typeof CREATED_EVENTS;

/** リダイレクト先の URL に付けるクエリ。 */
export const createdQuery = (kind: CreatedKind): string => `?created=${kind}`;
