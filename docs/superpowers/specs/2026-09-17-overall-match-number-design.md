# 試合番号を大会全体の通し番号に一本化する 設計

作成日: 2026-09-17

前提: [試合名のテンプレート化 設計](2026-09-09-match-name-template-design.md)。
本書はその改訂で、記載の無い事項は元の設計に従う。矛盾する箇所は本書を優先する。

## 目的

* 試合番号は大会全体の通し番号（`OverallSeq`）だけにする。部門ごとの試合番号は無くす
* 大会の進行順を並べ替えたら、試合番号は振り直される

## 進め方

1. `feat/match-name-template` に `main` を取り込み、衝突を解消する
   （主にリーグの結果表 `round-robin/standings.ts` / `LeagueResultTable` が
   `matchNumber` を使っている箇所を、展開済みの試合名に置き換える）
2. 本書の変更を入れ、元の計画の残り（Task 6〜9）を本書に合わせて仕上げる
3. `main` へマージする

## 決定事項（元の設計からの変更）

| 論点 | 元の設計 | 本書 |
|---|---|---|
| 使える変数 | `{{OverallSeq}}` / `{{DivisionSeq}}` | `{{OverallSeq}}` のみ |
| 既定値 | `"第{{DivisionSeq}}試合"` | `"第{{OverallSeq}}試合"` |
| 部門内の実施順 `BracketMatch.sequence` | 保持し、並べ替えで変わる | 削除する |
| 部門内の並べ替え（`reorder-matches`） | 試合名を書き換えない | スライスごと削除する |
| 行を持たない試合の末尾追加順 | 部門 `order` → `sequence` | 部門 `order` → 生成順（`matches` 配列の順 = round → order） |

## 通し番号

* `OverallSeq` は `/matches` の進行順（`ScheduleItem`）から `buildOverallSeq` で毎回算出する。
  保存しない。区切り行は数えない。1 始まり
* 進行順の並べ替え・区切りの挿入・削除のたびに、表示される番号は自動で振り直される。
  試合名（テンプレート）は書き換えないので、書き戻しの処理は要らない
* 進行順に行を持たない試合は、部門 `order` 昇順 → 部門内の `matches` 配列の順で末尾に付く

## 部門内の実施順の撤去

* `BracketMatch.sequence` を型から削除する
* `parse` は保存済み JSON の `sequence` を読まずに捨てる。`fillSequences` と、
  それによる配列の並べ替えを削除する。`matches` は `round` → `order` の順に整列して返す
* `validate` の「`sequence` が `0..n-1` の連番」の検査を削除する
* 生成（`single-elimination/build.ts` / `round-robin/build.ts`）は `sequence` を入れない
* `features/division/reorder-matches/` を削除する（handler / schema / usecase /
  repository / domain とテスト）
* 部門画面の `MatchOrderList` からドラッグでの並べ替えを外し、試合名の編集一覧にする。
  並べ替えに触れる説明文は削除する

## `{{DivisionSeq}}` の扱い

* `renderMatchName` の変数から外す。書かれていれば mustache の既定どおり空文字に展開する
* 旧データの移行はしない（元の設計どおり）。`matchName` が欠けていれば新しい既定値を入れる

## 構造上の位置の文言（`matchPositionLabel`）

「第 N 試合」は試合番号と紛らわしいので使わない。

* トーナメント: `N回戦 第M試合` → `N回戦 (M)`（M = `order + 1`）
* リーグ: 位置の文言を出さない（対戦カードのみ）。`matchPositionLabel` は空文字を返し、
  表示側は空文字なら描画しない
* リーグの星取表（`LeagueCrossTable`）の「第N試合」は展開済みの試合名に置き換える

スロットの文言は元の設計どおり「{展開済みの試合名}の勝者／敗者」。

## 画面

試合名を出す全画面（ブラケット・管理と公開の進行順・結果入力・リーグの星取表と
結果表・部門の編集画面）で `OverallSeq` による展開済みの名前を表示する。
部門単位の番号はどこにも出さない。

## テスト

* `lib/division/overall-order.test.ts`: 保存済みの進行順を並べ替えると番号が変わること、
  区切りを数えないこと、行を持たない試合が部門 `order` → 配列順で末尾に付くこと
* `lib/division/match-name.test.ts`: 既定値 `第{{OverallSeq}}試合` の展開、
  `{{DivisionSeq}}` が空文字になること
* `lib/division/parse.test.ts`: 旧 `sequence` / `matchNumber` を無視すること、
  `matches` が round → order で並ぶこと
* `lib/division/validate.test.ts`: `sequence` の検査が無いこと
* `lib/division/label.test.ts`: `N回戦 (M)`、リーグで空文字
* 生成のテスト: 全試合に新しい既定値が入り、`sequence` を持たないこと
* `reorder-matches` のテストは削除
* 試合名を出す各コンポーネント・ページのテストで展開済みの名前を確認
* 最後に `pnpm test`・型検査・lint を通す
