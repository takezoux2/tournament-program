/** 印刷ページの設定。クエリ文字列で受け取り、サーバーで描き分ける。 */
export type PaperSize = "a4" | "a3";

export type PrintOptions = {
  paper: PaperSize;
  /** false なら結果を載せない（当日に手書きする運用向けの空欄の表） */
  results: boolean;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * クエリから印刷設定を読む。URL は手で書き換えられるので、知らない値は
 * エラーにせず既定（A4・結果あり）へ倒す。
 */
export const parsePrintOptions = (params: SearchParams): PrintOptions => ({
  paper: first(params.paper) === "a3" ? "a3" : "a4",
  results: first(params.results) !== "0",
});

export const printHref = (
  tournamentId: string,
  options: PrintOptions,
): string =>
  `/t/${tournamentId}/print?paper=${options.paper}&results=${options.results ? "1" : "0"}`;

/** 用紙の短辺・長辺（mm） */
const PAPER_MM: Record<PaperSize, { short: number; long: number }> = {
  a4: { short: 210, long: 297 },
  a3: { short: 297, long: 420 },
};

const PAGE_MARGIN_MM = 12;
/** 部門ページの見出し（部門名と形式）に取っておく高さ */
const DIVISION_HEADING_MM = 14;

/**
 * 部門ページ（横向き）で表に使える高さ。SVG は親の高さに合わせて縮むので、
 * 印刷時はこの値で本文の箱の高さを固定し、1 部門を 1 ページに収める。
 */
export const divisionBodyHeightMm = (paper: PaperSize): number =>
  PAPER_MM[paper].short - PAGE_MARGIN_MM * 2 - DIVISION_HEADING_MM;

/**
 * 印刷用の CSS。用紙サイズは実行時に決まるので Tailwind のクラスでは書けず、
 * ページに <style> として埋め込む。部門ページは名前付きページ（page: division）
 * で横向きにする。
 */
export const printPageCss = (paper: PaperSize): string => {
  const size = paper.toUpperCase();
  return [
    `@page { size: ${size} portrait; margin: ${PAGE_MARGIN_MM}mm; }`,
    `@page division { size: ${size} landscape; }`,
    `@media print { .print-division-body { height: ${divisionBodyHeightMm(paper)}mm; } }`,
  ].join("\n");
};
