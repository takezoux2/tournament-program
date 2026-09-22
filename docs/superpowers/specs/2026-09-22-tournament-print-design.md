# 大会の印刷用 PDF

## 目的

大会当日の掲示・配布用に、1 つの大会を紙（または PDF）へ出力できるようにする。
内容は次の 3 つ。

1. 大会概要
2. 選手一覧
3. 部門ごとのトーナメント表・リーグ表

## 方針

- **サーバーで PDF を生成しない。** 印刷専用のページを作り、ブラウザの印刷
  （「PDF に保存」）で出力する。追加の依存も日本語フォントの同梱も要らない。
- **トーナメント表は React Flow を使わず静的 SVG で描く。** 既存のパイプライン
  （`fromDivision` → `resolveBracket` → `layoutBracket`）の座標をそのまま使い、
  サーバーコンポーネントで `<svg viewBox>` を出す。React Flow は transform・
  表示範囲外ノードの省略・`fitView` のタイミングが印刷と相性が悪い。
  viewBox なら用紙に合わせて縮小するだけで済む。

## ルートと導線

- 新規ページ `/t/[tournamentId]/print`（`src/app/t/[tournamentId]/print/page.tsx`）。
- 閲覧可否は既存の `findPublicTournament(tournamentId, userId)` に従う。公開中の
  大会は誰でも、準備中の大会は組織メンバーだけが開ける。対象外は `notFound()`。
- `src/proxy.ts` の matcher は `t/` 配下を既に除外しているので、変更は要らない。
- 導線:
  - 公開の大会トップ（`/t/[tournamentId]`）に「印刷用 PDF」リンク
  - 管理画面の大会詳細（`/orgs/[slug]/tournaments/[tournamentId]`）に同じ
    公開ルートへのリンク（`target="_blank"`）
- `robots: noindex` は `/t` のレイアウトから引き継がれる。

## 印刷設定

クエリパラメータで受け取り、サーバーで描き分ける。

| パラメータ | 値 | 既定 | 不正値 |
| --- | --- | --- | --- |
| `paper` | `a4` / `a3` | `a4` | 既定に戻す |
| `results` | `1`（結果あり） / `0`（空欄） | `1` | 既定に戻す |

- パースは純粋関数 `parsePrintOptions(searchParams)` にまとめる
  （`src/features/print/options.ts`）。
- 画面上部にツールバー（クライアントコンポーネント `PrintToolbar`）を置く。
  - 用紙サイズ（A4 / A3）と結果表示（あり / 空欄）の切替。切替はクエリを書き換えた
    リンク（`<Link>`）で行い、ページはサーバーで描き直す。
  - 「印刷 / PDF に保存」ボタン（`window.print()`）。
  - ツールバーは `print:hidden` で紙に出さない。
- 用紙サイズはページ内の `<style>` で `@page` を出す。
  - `@page { size: A4 portrait; margin: 12mm; }`（A3 なら A3）
  - `@page division { size: A4 landscape; }` — 部門のページだけ横向き
    （CSS の名前付きページ。部門セクションに `page: division` を付ける）

## ページ構成

各セクションは改ページで始める（`break-before: page`、先頭を除く）。

### 1. 大会概要（縦）

- 組織名、大会名、開始日時、ステータス、概要（`TournamentDescriptionMarkdown`）。
- 概要が空（`""`）なら概要欄を出さない（`PublicTournamentSummary` と同じ扱い）。
- 部門の一覧（部門名と形式）を添える。

### 2. 選手一覧（縦）

- データは `listParticipantsWithDivisions`（選手番号の自然順）。
- 表の列: 選手番号 / 氏名 / 所属 / 出場部門（カンマ区切り）。
- `<thead>` を `display: table-header-group` にして、ページをまたいでも見出し行を
  繰り返す。行の途中で改ページしない（`break-inside: avoid`）。
- 参加者が 0 人なら「まだ参加者がいません」。

### 3. 部門（1 部門 1 ページ、横）

- 部門の `order` 順。見出しに部門名と形式（`DIVISION_FORMAT_LABELS`）。
- エリミネーション形式 → `PrintBracket`（下記）。
- リーグ形式 → `LeagueResultTable` を印刷向けに使う（横スクロールの箱を外し、
  ページ幅に収める。`variant="print"` のような prop を足すか、印刷用の薄い
  ラッパーで上書きする。実装計画で決める）。
- 表は 1 ページに収まるよう縮小する。トーナメント表は SVG の
  `width: 100%; height: 100%` + `preserveAspectRatio="xMidYMin meet"` で、
  部門ページの本文領域いっぱいに収める。

### PrintBracket（新規）

`src/components/print/PrintBracket.tsx`。サーバーコンポーネント。

- 入力は `resolveBracket` の結果、`layoutBracket` の座標、`sectionLabels`。
- 出力は `<svg viewBox="…">`。viewBox は全ノードの外接矩形＋余白から求める
  （純粋関数 `bracketViewBox(positions)`、テスト対象）。
- 描くもの:
  - 試合カード（`NODE_WIDTH × NODE_HEIGHT` の枠）: 試合名、2 つのスロット
    （選手番号と氏名、未確定は「—」、不戦は「不戦」）、結果ありなら勝者を太字にし
    スコアを添える
  - 供給元試合から次の試合への連結線（直角の折れ線）
  - ダブルイリミネーションのセクション見出し（勝者側 / 敗者側 / 決勝）
- 線と文字は黒系の単色にする（モノクロ印刷で読めること）。
- 既存の `DivisionBracket` と同じく、パース失敗・組み合わせ未作成・
  `fromDivision` が `null`・`resolveBracket` の例外は、その部門の区画に
  1 行の案内（`Notice`）を出して終える。PDF 全体は落とさない。
  この「パースして描ける形にする」前半は `DivisionBracket` と共通化できるなら
  共通化する（実装計画で判断）。

## 空欄モード（`results=0`）

- トーナメント: 結果を空配列として `fromDivision` / `resolveBracket` に渡す。
  不戦勝（BYE）の勝ち上がりは構造なので残る。勝者・スコアは出ない。
- リーグ: 結果を空配列として `toLeagueTableView` に渡す。○●△ は出ず、試合名だけが
  残る。順位・勝敗などの集計列は空欄にする（全員 0 の表は誤解を招くため）。

## エラー処理

- 大会が見えない → `notFound()`。
- 部門単位の失敗は上記のとおり区画内の案内に留める。
- 部門が 0 件なら部門セクションの代わりに「部門がありません」を 1 行出す。

## テスト

- `parsePrintOptions`: 既定値、正常値、不正値のフォールバック。
- `bracketViewBox`: 外接矩形と余白。
- `PrintBracket`: カード数・連結線数、勝者の太字とスコア、空欄モードで勝者が
  出ないこと、BYE の表示。
- 印刷ページ: 概要・選手一覧・各部門のセクションが揃うこと、リーグとトーナメント
  の描き分け、壊れた部門で他の部門が描けること。
- 最後に Chrome の印刷プレビューで A4 / A3、結果あり / 空欄を目視確認する。

## 対象外

- 部門を選んで印刷する機能
- 試合一覧（スケジュール）の印刷
- サーバー側での PDF ファイル生成
- 巨大な表の複数ページ分割
