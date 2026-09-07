"use client";

import { gaMeasurementId } from "./ga-id";

declare global {
  interface Window {
    /** gtag.js が読む送信キュー。要素は arguments オブジェクト。 */
    dataLayer?: unknown[];
  }
}

/**
 * gtag の呼び出し口。
 *
 * インラインスクリプトで window.gtag を定義する公式の作りは使わない。
 * beforeInteractive のスクリプトは初期 HTML にしか入らず、404 のように
 * シェルが差し替わるページでは出力されない。そこへ window.gtag を呼ぶ
 * effect が走ると "window.gtag is not a function" で落ちる（実測）。
 * 自前の関数なら、どの経路で描画されても必ず存在する。
 *
 * push するのは arguments オブジェクトであって配列ではない。gtag.js は
 * dataLayer の要素を arguments として読むため、素の配列を積んでも
 * 黙って無視される（実測で collect が飛ばないことを確認済み）。
 */
function push(..._args: unknown[]): void {
  window.dataLayer = window.dataLayer ?? [];
  // 配列に置き換えると gtag.js に無視される。上のコメントを参照。
  // biome-ignore lint/complexity/noArguments: gtag.js が arguments を期待する
  window.dataLayer.push(arguments);
}

/**
 * js と config を積んだかどうか。イベントより前に必ず並ばせる必要がある。
 * React は子の effect を親より先に走らせるので、レイアウトの
 * GoogleAnalytics に任せると、ページ側のイベントが config より先に
 * 積まれてしまう。最初に使った側が面倒を見る形にして順序を保証する。
 */
let configured = false;

const ensureConfigured = (gaId: string): void => {
  if (configured) return;
  configured = true;
  push("js", new Date());
  // page_view は自前で送る。既定の config 由来の page_view は
  // クエリ文字列込みの生 URL を載せてしまい、差し替えられない。
  push("config", gaId, { send_page_view: false });
};

/** 測定 ID が無ければ何もしない。dataLayer にも触らない。 */
export const sendGtagEvent = (
  name: string,
  params: Record<string, unknown>,
): void => {
  const gaId = gaMeasurementId();
  if (gaId === null) return;
  ensureConfigured(gaId);
  push("event", name, params);
};

/** テスト用。モジュールをまたいで残る config 済みフラグを戻す。 */
export const resetGtagForTest = (): void => {
  configured = false;
};
