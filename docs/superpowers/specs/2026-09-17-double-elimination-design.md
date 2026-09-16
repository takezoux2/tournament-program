# ダブルエリミネーション（組み合わせ生成・編集・ブラケット描画） 設計

作成日: 2026-09-17

## 目的

`DOUBLE_ELIMINATION_GRAND_FINAL` / `DOUBLE_ELIMINATION_THIRD_PLACE` 形式の部門を実際の大会で使えるようにする。
現状は enum と `matchingConfig` の型（`loserOf`、`bracket: "winners" | "losers" | "final"`）だけが存在し、
組み合わせを作る手段も描画も無い（部門ページは「ブラケット表示はまだ対応していません」を表示する）。

## スコープ

含む:

* ダブルエリミネーションの組み合わせ自動生成（純粋関数）
* エントリー・組み合わせ編集画面（`setup`）を DE 形式でも使えるようにする
* BYE を含む場合に敗者側ブラケットが進行するよう resolver を修正
* 勝者側・敗者側・決勝をまとめたブラケット描画

含まない:

* 優勝決定戦のブラケットリセット（再戦）。決勝は常に 1 試合
* 敗者側ブラケットの手動編集（常に勝者側 1 回戦から自動導出する）
* `loserOf` の接続線の描画

## 決定事項

| 項目 | 決定 |
| --- | --- |
| 唯一の情報源 | 勝者側 1 回戦の `SlotSource[]`（長さ 2^k）。SE と同じ |
| 敗者側・決勝 | 上記から毎回決定的に生成する |
| 決勝の再戦 | なし（1 試合） |
| `round` 番号 | 全ブラケット通しの番号。検証ルール 6 を変更しない |
| 最小エントリー数 | 3（k ≥ 2） |
| 最大エントリー数 | 64 |
| 編集画面 | SE の `setup` ページ・`DivisionSetup`・各スライスを形式ディスパッチで再利用 |
| 描画 | 1 キャンバスに勝者側（上）、敗者側（下）、決勝（右） |
| 接続線 | `winnerOf` のみ。`loserOf` はスロット表示の「第N試合の敗者」で表す |

## 組み合わせ生成

置き場所: `src/features/division/double-elimination/build.ts`（SE の `single-elimination/` と同じく共有ドメイン、スライスではない）。

```ts
type DoubleEliminationVariant = "grandFinal" | "thirdPlace";
function buildDoubleElimination(slots: SlotSource[], variant: DoubleEliminationVariant): MatchingConfig;
function isDoubleEliminationShape(config: MatchingConfig, variant: DoubleEliminationVariant): boolean;
```

`slots` の扱い（2^k への BYE 詰め、`toSlots` による逆変換）は SE と共通。
エントリー数 2 以下（k < 2）の場合は `matches: []` を返し、生成アクションは「エントリー不足」エラーにする。

### 勝者側（`bracket: "winners"`）

SE の `buildFromSlots` と同じ木。id は `m{round}-{order}`（`buildFromSlots` が振る id をそのまま再利用するため）、`round` は 1..k。

### 敗者側（`bracket: "losers"`）

敗者側ラウンド番号を L（1 始まり）とする。

* **L = 1**: 勝者側 1 回戦の敗者同士を `order` 順に 2 つずつ組む（2^(k-2) 試合）
* 以降、勝者側ラウンド r = 2, 3, … について次の 2 ラウンドを繰り返す
  * **合流ラウンド**: 直前の敗者側ラウンドの勝者（`winnerOf`）と、勝者側 r 回戦の敗者（`loserOf`）の対戦。
    試合数は勝者側 r 回戦と同じ。敗者の並び順は合流ラウンドごとに「逆順 → 正順 → 逆順 …」と交互にし、
    直前に対戦した相手との早期再戦を避ける
  * **内部ラウンド**: 直前の合流ラウンドの勝者同士を 2 つずつ組む（試合数は半分）。
    合流ラウンドの試合数が 1 のときは内部ラウンドを作らない（それが敗者側決勝）
* 取り込む勝者側ラウンド
  * `grandFinal`: r = 2..k（勝者側決勝の敗者も落ちてくる）。敗者側ラウンド数は 2k − 2
  * `thirdPlace`: r = 2..k−1（勝者側決勝の敗者は準優勝で確定）。敗者側ラウンド数は 2k − 3。
    k = 2 の場合は L = 1 の 1 試合だけで、これが 3 位決定戦になる

id は `l{L}-{order}`。

### 決勝（`bracket: "final"`）

`grandFinal` のみ 1 試合。id `f`、スロットは `[winnerOf(勝者側決勝), winnerOf(敗者側決勝)]`。
`thirdPlace` は決勝を持たない（敗者側決勝の勝者が 3 位）。

### `round` 番号

`validateMatchingConfig` のルール 6（`winnerOf` / `loserOf` は自分より小さい `round` の試合のみ参照）と、
resolver の「round → order 順の 1 パス解決」をそのまま使うため、`round` は全ブラケット通しの番号にする。

* 勝者側 r 回戦: `round = r`
* 敗者側 L ラウンド: `round = L + 1`
  （L = 1 は勝者側 1 回戦を参照 → 2 > 1。合流ラウンド L = 2(r−1) は勝者側 r 回戦を参照 → 2r − 1 > r）
* 決勝: `round = 2k`（勝者側決勝 k と敗者側決勝 2k − 1 より大きい）

描画や表示でのラウンド名は、ブラケットごとの相対番号（勝者側 r、敗者側 L = round − 1）から求める。

### 試合番号・`sequence`

勝者側 → 敗者側 → 決勝、各ブラケット内は round → order の順に `"1"`, `"2"`, … と `0`, `1`, … を振る。
SE と同じく、再生成すると手動変更した番号・順序はリセットされる。

## BYE の伝播（resolver 修正）

エントリー数が 2^k 未満だと、勝者側 1 回戦に BYE 試合ができる。現状の
`src/lib/division/resolve.ts` は「BYE 試合の敗者」を `pending` のまま据え置くため、敗者側が永久に進行しない。
また敗者側で両スロットとも BYE になる試合も起こりうる（例: 5 人 → 勝者側 1 回戦に BYE 試合 3 つ）。

次の規則で「どのエントリーも到達しえないスロット」を `bye` にする。

1. 片側が BYE の試合の `loserOf` → `bye`
2. 両側が BYE の試合の `winnerOf` / `loserOf` → `bye`

`src/lib/division/resolve.ts` と `src/features/bracket/resolve-bracket.ts` の両方に適用する。
SE でも、入れ替え操作で作られた BYE 対 BYE の試合の先が永久に `pending` だった挙動が改善される。

結果入力画面（`features/schedule/result-rows.ts`）は既存どおり BYE を含む行を `bye` 状態として扱う。

## 編集画面

* `matching-strategy.ts`
  * `EDITABLE_FORMATS` に DE 2 形式を追加、`MAX_ENTRIES` は 64
  * `regenerateMatching`: `buildDoubleElimination(generateSlots(entries), variant)`
  * `applyEntryAdded`: `isDoubleEliminationShape` のとき `placeEntry(toSlots(current))` → 再構築。形が合わなければ何もしない（SE と同じ）
  * `applyEntryReordered`: 何もしない（SE と同じ）
  * `toSlots` は勝者側 1 回戦（`bracket === "winners" && round === 1`）だけを見る
* `swap-slots`: `toSlots` → `swapSlots` → 形式に応じた builder
* `format.ts`: DE 2 形式の `needsParticipants` を `true`
* `DivisionDetail.tsx`: DE 2 形式の `SETUP_LINKS` を `{ segment: "setup", label: "エントリー・組み合わせ" }`
* `setup/page.tsx` と `DivisionSetup.tsx` の形式ガードを SE + DE 2 形式に広げ、
  形状チェック（`mismatched`）と builder を形式でディスパッチする。
  組み合わせ編集（`MatchingSection`）は勝者側 1 回戦だけを対象にする
* ロック（結果が 1 件でもあれば構造編集を拒否、番号・順序は編集可）は既存どおり
* エントリー不足エラーは形式ごとの最小人数（`minEntries`。DE 2 形式は 3）を文言に出す。
  「組み合わせを作るにはエントリーが{minimum}人以上必要です」（`DivisionNotEnoughEntriesError`、生成時）。
  エントリー削除で残数が `minEntries` を下回り組み合わせが空になったときも、同じ `minimum` を使った
  通知文言を返す（`remove-entry/repository.ts` の `matching: "cleared"`）
* 位置ラベル（`matchPositionLabel`）: `勝者側N回戦 第M試合` / `敗者側L回戦 第M試合` / `決勝`。
  `round` は全ブラケット通しの番号なので、敗者側の表示上のラウンド番号は `round − 1`

## ブラケット描画

### データ変換

* 描画用型（`src/features/bracket/types.ts`）
  * `SlotSource` に `{ kind: "loserOf"; matchId }` を追加
  * `Match` / `ResolvedMatch` に `bracket: "winners" | "losers" | "final"` を追加
  * `ResolvedMatch.sourceMatchIds` は `winnerOf` の参照元のみ（接続線とレイアウト用）
* `from-division.ts`: SE と DE 2 形式を受け付ける。
  SE では従来どおり `winners` 以外や `loserOf` を含むと `null`
* `resolve-bracket.ts`: `loserOf` スロットを、参照試合の勝者が決まり、かつ敗者がエントリーとして確定したら
  `confirmed`、BYE 規則に該当すれば `bye`、それ以外は `pending` にする

### レイアウト（`layout-bracket.ts`）

* 勝者側: 現行と同じ（列 = r − 1、y は参照元の平均、参照元が無ければ order から）
* 敗者側: 勝者側の最下端 + 区切り余白（`SECTION_GAP` = 72px。ラベルが収まる高さ）から開始。
  列 = L − 1、y は同じブラケット内の `winnerOf` 参照元の平均。
  合流ラウンドの `loserOf` 側は y 計算に使わない。参照元が無い（L = 1）試合は order から
* 決勝: 列 = 勝者側・敗者側の最終列の大きい方 + 1。y は勝者側決勝と敗者側決勝の中点
* 各エリアの左上に「勝者側」「敗者側」「決勝」のラベルノード（`SectionNode`、`layoutBracket` の
  `sectionLabels()` が返す）を置く。勝者側しか無い（SE）ときは出さない
* SE のレイアウト結果は変えない

### 表示

* `DivisionMatchingView.tsx`: DE 2 形式の「未対応」表示を削除し、`DivisionBracket` を表示する
* `loserOf` の未確定スロットは `ResolvedSlot.pendingLabel`（`第N試合の敗者`、`createSlotLabeler` が生成）で表示する。
  参照試合の勝者が決まり、かつ敗者がエントリーとして確定した時点で `confirmed` に切り替わる
* 勝者・敗者のスタイル（`MatchCard`）は既存のまま

## テスト

* `double-elimination/build.test.ts`
  * エントリー 3, 4, 5, 8, 16 × 2 バリアントで試合数（BYE 試合を含む）:
    勝者側 2^k − 1、敗者側 `grandFinal` 2^k − 2 / `thirdPlace` 2^k − 3、決勝 `grandFinal` 1 / `thirdPlace` 0
  * エントリー 2 以下では `matches: []`
  * 生成結果が `validateMatchingConfig` を通る
  * 各試合（勝者側決勝・敗者側決勝以外）の勝者・敗者がちょうど 1 回だけ参照される
  * 合流ラウンドの敗者の並びが交互に反転している
  * `isDoubleEliminationShape` / `toSlots` の往復
* resolver（`lib/division/resolve.test.ts`, `features/bracket/resolve-bracket.test.ts`）: BYE の伝播 2 規則
* `layout-bracket.test.ts`: 敗者側が勝者側より下、決勝が両決勝より右で y が中点、SE の結果が不変
* `from-division.test.ts` / `DivisionMatchingView.test.tsx` / `matching-strategy` 関連テストの更新
* 手動確認: ローカル（`BYPASS_AUTH=1`、Cookie `USER_ID=1`）で DE 部門を作成し、生成・入れ替え・結果入力・描画を確認
