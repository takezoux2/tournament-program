"use client";

import { gaMeasurementId } from "./ga-id";

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
  | "record_result";

/**
 * GA4 へカスタムイベントを送る。
 * 測定 ID が無い環境では window.dataLayer に一切触らない。
 */
export const trackEvent = (
  name: AnalyticsEvent,
  params?: Record<string, string>,
): void => {
  if (gaMeasurementId() === null) return;
  window.gtag("event", name, params ?? {});
};
