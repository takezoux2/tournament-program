"use client";

import { sendGtagEvent } from "./gtag";

/**
 * 送信してよいイベント名。GA4 は未知の名前も黙って受け付けてしまい、
 * タイポに送信後は気づけないため、ここで型として閉じている。
 */
export type AnalyticsEvent =
  | "sign_up"
  | "login"
  | "create_organization"
  | "create_tournament"
  | "create_division"
  | "record_result"
  /** GA4 の標準イベント。GoogleAnalytics が自前で送る。 */
  | "page_view";

/**
 * GA4 へカスタムイベントを送る。
 * 測定 ID が無い環境では window.dataLayer に一切触らない（sendGtagEvent 側で判定）。
 */
export const trackEvent = (
  name: AnalyticsEvent,
  params?: Record<string, string>,
): void => {
  sendGtagEvent(name, params ?? {});
};
