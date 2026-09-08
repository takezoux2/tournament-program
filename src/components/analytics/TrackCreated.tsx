"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  CREATED_EVENTS,
  type CreatedKind,
} from "@/shared/lib/analytics/created";
import type { AnalyticsEvent } from "@/shared/lib/analytics/events";
import { trackEvent } from "@/shared/lib/analytics/events";

/**
 * 作成系の Server Action は成功時に redirect するため、useActionState の
 * state は更新されず、クライアントは成功を観測できない。そこで
 * リダイレクト先の ?created= を受け取り、遷移後に 1 回だけ発火する。
 */
const eventFor = (created: string): AnalyticsEvent | undefined =>
  Object.hasOwn(CREATED_EVENTS, created)
    ? CREATED_EVENTS[created as CreatedKind]
    : undefined;

export function TrackCreated({ created }: { created: string | undefined }) {
  const pathname = usePathname();
  // StrictMode は開発時に effect を setup → cleanup → setup と 2 回走らせる。
  // クエリを消すのは history の書き換えだけでサーバー側は再描画されないため、
  // created は 2 回目も同じ値のまま届き、イベントが二重に飛ぶ。
  // ref は StrictMode の再実行をまたいで保持されるので、これで 1 回に落ちる。
  const fired = useRef(false);

  useEffect(() => {
    if (created === undefined) return;
    if (fired.current) return;
    // URL は誰でも手で打てる。既知の値だけを通し、イベント名が
    // 外部入力で汚れないようにする。
    const event = eventFor(created);
    if (event === undefined) return;

    fired.current = true;
    trackEvent(event);
    // created だけを消す。リロードや URL の共有で二重に計上されるのを防ぐ。
    // router.replace だとサーバーコンポーネントが直前に走らせたのと同じ
    // DB クエリを即座に再実行してしまうため、履歴だけを書き換える
    // ネイティブの History API を使う。
    // クエリ全体を捨てないのは、この先どれかのページにタブや絞り込みの
    // パラメータが増えたとき、作成直後だけ黙って消えるのを避けるため。
    const params = new URLSearchParams(window.location.search);
    params.delete("created");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      rest === "" ? pathname : `${pathname}?${rest}`,
    );
  }, [created, pathname]);

  return null;
}
