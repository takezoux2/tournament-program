"use client";

import { gaMeasurementId } from "./ga-id";
import { sanitizedPageLocation, sanitizePagePath } from "./sanitize-url";

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
 * js と config を積んだかどうか。
 *
 * イベントより前に config を並ばせる必要がある。レイアウトの
 * GoogleAnalytics と、ページ側の TrackCreated は兄弟で、React は
 * 先に置かれた children 側の effect を先に流す。つまりページ側の
 * イベントがレイアウトの初期化より先に来る。最初に使った側が
 * 面倒を見る形にして、順序をどちらから来ても保証する。
 */
let configured = false;

/**
 * すべてのヒットに載せる既定パラメータ。
 *
 * page_location をイベントごとの引数として渡すだけでは足りない。
 * gtag は指定の無いヒットで document.location.href を自分で載せるため、
 * page_view 以外（login・record_result など）が素のクエリ付き URL を
 * 送ってしまう（実測で ?token=... がそのまま飛ぶのを確認済み）。
 * config と set の既定値として入れておき、どのヒットにも効かせる。
 *
 * page_title も同じ理由で伏せる。/t/** は participants の本名や大会名を
 * 出すため noindex にしてあるのに、document.title をそのまま送ると
 * 同じ名前を GA に渡すことになる。パスと揃えておけばレポートは
 * 画面単位で読め、名前は出ない。
 */
const defaultParams = (): Record<string, string> => {
  const location = sanitizedPageLocation();
  return {
    page_location: location,
    page_title: sanitizePagePath(window.location.pathname),
  };
};

const ensureConfigured = (gaId: string): void => {
  if (configured) return;
  configured = true;
  push("js", new Date());
  // page_view は自前で送る。既定の config 由来の page_view は
  // クエリ文字列込みの生 URL を載せてしまい、差し替えられない。
  push("config", gaId, { send_page_view: false, ...defaultParams() });
};

/**
 * 現在地を既定パラメータとして流し込む。クライアント遷移のたびに呼ぶ。
 * config は 1 回きりなので、遷移後のヒットに古い URL が載らないよう
 * ここで上書きする。
 */
export const setGtagPageContext = (): void => {
  if (gaMeasurementId() === null) return;
  push("set", defaultParams());
};

/** 測定 ID が無ければ何もしない。dataLayer にも触らない。 */
export const sendGtagEvent = (
  name: string,
  params: Record<string, unknown> = {},
): void => {
  const gaId = gaMeasurementId();
  if (gaId === null) return;
  ensureConfigured(gaId);
  // 明示的に載せる。set / config の既定値だけに頼ると、
  // 遷移直後の順序次第で古い値が載りうる。
  push("event", name, { ...defaultParams(), ...params });
};

/** テスト用。モジュールをまたいで残る config 済みフラグを戻す。 */
export const resetGtagForTest = (): void => {
  configured = false;
};
