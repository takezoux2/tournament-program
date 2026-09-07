"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { AnalyticsEvent } from "@/shared/lib/analytics/events";
import { trackEvent } from "@/shared/lib/analytics/events";

/**
 * 作成系の Server Action は成功時に redirect するため、useActionState の
 * state は更新されず、クライアントは成功を観測できない。そこで
 * リダイレクト先の ?created= を受け取り、遷移後に 1 回だけ発火する。
 */
const CREATED_EVENTS: Record<string, AnalyticsEvent> = {
  organization: "organization_create",
  tournament: "tournament_create",
  division: "division_create",
};

export function TrackCreated({ created }: { created: string | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (created === undefined) return;
    if (hasFiredRef.current) return;
    // URL は誰でも手で打てる。既知の値だけを通し、イベント名が
    // 外部入力で汚れないようにする。
    const event = CREATED_EVENTS[created];
    if (event === undefined) return;

    trackEvent(event);
    // クエリを消す。リロードや URL の共有で二重に計上されるのを防ぐ。
    // replace なので戻るボタンの履歴を汚さない。
    router.replace(pathname);
    hasFiredRef.current = true;
  }, [created, pathname, router]);

  return null;
}
