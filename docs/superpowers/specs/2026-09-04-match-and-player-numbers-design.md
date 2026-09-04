# 試合番号・選手番号 設計

2026-09-04

## 目的

- 各試合に文字列の「試合番号」を持たせ、運営が任意の番号に変更できるようにする。
- 各参加者（Participant）に文字列の「選手番号」を持たせ、運営が任意の番号に変更できるようにする。
- どちらもデフォルトは連番の自動採番とする。

## データモデル

### 試合番号 — `BracketMatch.matchNumber: string`（必須）

- `src/lib/division/types.ts` の `BracketMatch` に `matchNumber: string` を追加する。
- `buildFromSlots`（`src/features/division/single-elimination/build.ts`）が生成時に
  round 昇順 → order 昇順で `"1", "2", ...` を採番する。bye を含む全試合に振る。
- エントリー追加・削除・並べ替え・スロット入替でブラケットが再生成されるたびに
  連番で振り直す。手動編集した番号はそのタイミングで初期化される（承認済みの仕様）。
- `parseMatchingConfig`（`src/lib/division/parse.ts`）は既存データに `matchNumber` が
  無くても失敗させず、round 昇順 → order 昇順の連番を補完する。既存 JSON の
  データ移行は行わない。
- `validateMatchingConfig`（`src/lib/division/validate.ts`）に
  「matchNumber が空でないこと」「部門内で重複しないこと」のルールを追加する。

### 選手番号 — `Participant.playerNumber: String`（必須）

- `prisma/schema.prisma` の `Participant` に `playerNumber String` を追加する。
  一意制約は付けない（承認済みの仕様）。
- マイグレーションで列を追加し、既存 Participant には大会ごとに createdAt 昇順で
  `"1", "2", ...` をバックフィルする。
- 新規作成時（`src/features/division/add-entry/repository.ts` の
  `resolveParticipantId`）は、同じ大会の Participant のうち playerNumber を
  10 進整数として解釈できるものの最大値 + 1 を採番する。該当が無ければ `"1"`。
  非数値の番号（例: `"A-1"`）は最大値の計算から除外する。

## 試合番号の編集 UI

- 部門セットアップ画面（`DivisionSetup`）の「組み合わせ」セクションの下に
  「試合番号」一覧を追加する。全試合を round 昇順 → order 昇順で並べ、
  各行に対戦カードのラベル（例: 「1 回戦 第 1 試合」と両スロットの表示名）と
  番号の入力欄・保存ボタンを置く。
- 新アクション `set-match-number` を `src/features/division/set-match-number/`
  （schema / repository / handler）として、swap-slots など既存アクションの
  パターンに倣って追加する。指定 matchId の matchNumber だけを書き換え、
  ブラケット構造は変更しない。
- 番号の変更は結果の参照を壊さないため、勝敗記録後（locked）でも編集可能とする。
- バリデーション: trim 後に空文字なら拒否。部門内で他の試合と重複する番号は
  エラーとして拒否する。
- ブラケット描画にも試合番号を通す: `src/features/bracket/types.ts` の `Match` と
  `ResolvedMatch` に `matchNumber` を追加し、`from-division.ts` → `resolve-bracket.ts`
  → `MatchCard` で表示する。

## 選手番号の編集 UI

- `EntryList`（`src/components/division/EntryList.tsx`）の各行に選手番号を表示し、
  入力欄と保存ボタンでインライン編集できるようにする。
- 新アクション `set-player-number` を `src/features/division/set-player-number/`
  として追加する。対象 Participant が大会に属することを検証してから更新する。
- バリデーション: trim 後に空文字なら拒否。
- 重複時の確認フロー: 同じ大会内に同じ playerNumber の別 Participant がいる場合、
  1 回目の送信では更新せず「同じ番号の選手がいます。もう一度保存すると確定します」
  という状態を返す。フォームが confirmed フラグ付きで再送信したら更新を確定する。
- Participant は大会単位のマスタなので、同じ人が他部門にも出ている場合は
  そちらの表示にも反映される旨を画面に注記する。

## エラー処理

- set-match-number: 部門・試合が見つからない、空文字、部門内重複をそれぞれ
  既存の DivisionError パターンのエラー型で返す。
- set-player-number: 参加者が大会に見つからない、空文字をエラーで返す。
  重複は上記の確認フローで扱い、エラーにはしない。

## テスト

- `build.test.ts`: buildFromSlots が round/order 順に "1" 始まりの連番を振ること。
- `parse.test.ts`: matchNumber あり／なしの両方をパースでき、無い場合は
  round/order 順の連番が補完されること。
- `validate.test.ts`: matchNumber の空・重複がエラーになること。
- `add-entry/repository.test.ts`: 新規 Participant の採番（max+1、非数値の無視、
  1 始まり、既存 Participant 再利用時は採番しない）。
- `set-match-number` / `set-player-number`: repository・handler のユニットテスト
  （正常系、検証エラー、重複確認フロー）。
- コンポーネント: EntryList の番号表示・編集、試合番号一覧、MatchCard の
  試合番号表示。

## スコープ外

- 大会直下の参加者一覧ページ（今回はエントリー一覧からの編集のみ）。
- ROUND_ROBIN やダブルエリミネーションのセットアップ UI（既存どおり未対応）。
- 選手番号の一意制約・自動リナンバリング。
