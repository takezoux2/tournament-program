# 試合の実施順の並べ替え 設計

作成日: 2026-09-08

## 目的

部門の中の「どの試合を先にやるか」を運営者が並べ替えられるようにする。
あわせて、リーグ（`ROUND_ROBIN`）から「節」の概念を無くし、1 本の試合一覧にする。

現状、部門の中の試合の並びは組み合わせの生成規則だけで決まり、運営者は動かせない。
リーグは円卓法の節ごとに区切られて表示され、トーナメントは回戦順に並ぶ。
コートの都合や選手の連戦を避ける調整は、大会全体の進行順画面（`ScheduleItem`）まで
上がらないとできない。部門を組んだその場で実施順を決められるようにする。

## スコープ

含む:

* `BracketMatch` への実施順（`sequence`）の新設と、旧データの読み出し時の補完
* 実施順の並べ替え（ドラッグ&ドロップ）。リーグ・トーナメントの両方
* 並べ替えに伴う試合番号の振り直し
* リーグの「節」の廃止（生成・表示・文言）
* 大会の進行順の既定の並びを実施順に合わせる

含まない:

* ブラケット上の位置（`round` / `order`）の変更。トーナメントの対戦表の形は動かさない
* 1 回戦スロットの入れ替え（既存の `swap-slots`）。シード位置の調整であり別物
* 実施順の妥当性の検証（「決勝が 1 番目」を止めるなど）。判断は運営者に委ねる
* 部門をまたいだ並べ替え。大会の進行順画面が既に持っている
* ダブルエリミネーション 2 形式。編集画面自体がまだ無い

## 決定事項

| 論点 | 決定 |
|---|---|
| 実施順の持ち方 | `BracketMatch.sequence`（0 始まりの連番）を新設する |
| `round` / `order` の役割 | 描画・構造専用にする。並べ替えでは変えない |
| リーグの節 | 廃止。生成時に全試合 `round: 1` にする |
| リーグの既定の並び | 円卓法で節を組み、上から連結して 1 本にする（試合の並びは従来と同じ） |
| 並べ替えが変えるもの | `sequence` と `matchNumber` だけ。`id` / `slots` は不変 |
| 試合番号 | 並べ替えのたびに先頭から `1, 2, 3...` を再代入する |
| 勝敗記録後 | 並べ替えを許す（構造も参照も変えないため） |
| 操作方法 | ドラッグ&ドロップ。`ScheduleList` の作りを踏襲する |
| 旧データ | マイグレーション無し。読み出し時に `(round, order)` 順の添字で補う |
| スライスの分け方 | 両形式で 1 つ（`features/division/reorder-matches/`） |

### 実施順を `round` / `order` と分ける理由

トーナメントでは `round` が回戦、`order` が回戦内の上下で、両方がブラケットの
描画座標そのものになっている（`features/bracket/layout-bracket.ts` が
`(round - 1)` を x に、`order` の並びを y に使う）。実施順として動かすと
対戦表の形が崩れ、次の回戦への接続の見た目も壊れる。

リーグには構造上の制約が無いので `order` を実施順に流用できるが、形式ごとに
「並べ替えが何を書き換えるか」が変わるとスライスが二重になる。実施順を独立した
項として持たせれば、並べ替えの規則は「`sequence` と `matchNumber` を書き直す」の
一文で両形式に通る。

### 勝敗記録後も並べ替えを許す理由

`results` は `matchId` で試合を指し、`ScheduleItem` も `(divisionId, matchId)` で指す。
並べ替えは `id` を変えないため、どちらの参照も壊れない。試合番号の編集
（`set-match-number`）が同じ理由で勝敗記録後も許されており、それに揃える。

## 中核となるデータ設計

### `BracketMatch`

```ts
export type BracketMatch = {
  /** 部門内で一意 */
  id: string;
  bracket: BracketSide;
  /** 1 = 1 回戦。ROUND_ROBIN は常に 1（節を持たない） */
  round: number;
  /** ラウンド内の上からの位置。0 始まり */
  order: number;
  /** 部門内での実施順。0 始まりの連番。並べ替えで変わる */
  sequence: number;
  /** 表示用の試合番号。部門内で一意 */
  matchNumber: string;
  slots: [SlotSource, SlotSource];
};
```

`round` / `order` は「ブラケット上のどこにある試合か」、`sequence` は
「何番目にやる試合か」を表す。生成直後は両者が一致するが、並べ替え後はずれる。

### 読み出し（`lib/division/parse.ts`）

`sequence` を持たない `matchingConfig` が既に保存されている。読み出しで補う。

* 全試合に `sequence` があればその昇順に並べて返す
* 1 つでも欠けていれば、`(round, order)` 昇順に並べた添字を `sequence` として振る

補完の規則を「今の表示順」に合わせてあるので、既存のトーナメントは回戦順、
既存のリーグは節の順に連結された順が、そのまま初期の実施順になる。
運営者から見て並びは変わらない。

`parseMatchingConfig` が常に `sequence` 昇順・0 始まりの連番で返すため、
下流は配列の順をそのまま実施順として読める。ブラケットの描画側
（`layout-bracket.ts` / `resolve-bracket.ts`）は従来どおり自分で
`round → order` に並べ直すので、この変更の影響を受けない。

### 検証（`lib/division/validate.ts`）

`validateMatchingConfig` に次を足す。

* `sequence` が `0..n-1` の連番であること（重複・欠番・範囲外を弾く）

`parse` が補完するため読み出し経路では常に満たされる。書き込み側（生成・並べ替え）の
不具合を、`setup-store` の保存直前の検証で捕まえるためのもの。

### リーグの生成（`features/division/round-robin/build.ts`）

円卓法で節ごとの組を作るところまでは変えない（連戦が起きにくい並びが
そのまま得られる）。保存する形だけを変える。

* 節を上から連結して 1 本の配列にする
* 全試合 `round: 1`、`order` = `sequence` = 通し番号（0 始まり）
* 試合 id は `r1-{通し番号}`
* `matchNumber` は `1` から順の連番（従来と同じ）

`circleRounds` は節ごとの組を返す純粋関数のまま残す。節はここで消費されて、
保存されるデータには現れない。

### 並べ替え（`features/division/reorder-matches/`）

垂直スライスの構成に合わせて `schema.ts` / `domain.ts` / `usecase.ts` /
`repository.ts` / `handler.ts` を置く。

* 入力: 並べ替え後の `matchId` の配列（画面から丸ごと送る）
* `domain.ts`: 純粋関数。配列が現在の組み合わせの id 集合とちょうど一致しない
  （欠け・重複・未知の id）場合は `null` を返し、呼び出し側が「不正な並び順」として扱う。
  一致していれば、その順に `sequence` を `0` から、`matchNumber` を `"1"` から振り直した
  `MatchingConfig` を返す。`id` / `round` / `order` / `slots` / `bracket` は写すだけ。
* `repository.ts`: `set-match-number` と同じく `runDivisionSetup` を使わず専用の
  トランザクションを書く（`runDivisionSetup` は `results` があると拒否するため）。
  所有権を `where` に入れて読み、`isEditableFormat` でない形式は「無い」に倒し、
  書く直前に `validateMatchingConfig` を通す。
* `handler.ts`: 既存のスライスと同じ形。`requireOrganization` → `safeParse` →
  `Effect.runPromiseExit` → `revalidateDivisionSetup`。

### 手で決めた実施順が失われる場面

組み合わせを作り直すと `sequence` は生成規則の順に戻る。リーグはエントリーの
追加・削除・並べ替えのすべてで作り直すため（`matching-strategy.ts` の既存の規則）、
実施順を決めるのは出場者が固まってからになる。

トーナメントで戻るのは 2 つの場面。「生成」を押したときと、1 回戦の組み合わせを
入れ替えたとき（`swap-slots`）。後者は木の形を変えないため見落としやすいが、
`buildFromSlots` で丸ごと組み立て直す実装なので `sequence` も `matchNumber` も
既定に戻る。手で振った試合番号が同じ理由で失われるのは、この機能を入れる前からの
挙動で、今回はそれに実施順が加わった形になる。

作り直したことは既に通知で伝えている（「並べ替えに合わせて対戦表を作り直しました」など）。
通知の文言は変えず、「作り直すと試合番号と実施順は既定に戻る」ことを一覧の説明文に書く
（1 回戦の入れ替えもその一つとして含める）。

## 画面

### リーグ（`/orgs/[slug]/tournaments/[id]/divisions/[id]/league`）

「節ごとの試合」の区画を「試合」の区画に置き換える。節の見出しは無くなり、
全試合が 1 本のリストに並ぶ。各行は左端に掴むハンドル、中央に位置文言と対戦カード、
右に試合番号の編集フォームを持つ。

`LeagueRoundList` を `LeagueMatchList` に置き換える（`round-robin/view.ts` の
`toRoundView` も `toLeagueMatchView` に置き換える）。

**失われる表示**: 「休み: 山田」（奇数人のとき、その節に出ない人）。節が無くなると
算出できないため削除する。全ペアは 1 本のリストに並ぶので、対戦の抜けは起きない。

### トーナメント（`/orgs/[slug]/tournaments/[id]/divisions/[id]/setup`）

既存の「試合番号」一覧（`MatchNumberList`）を、実施順の並べ替えを兼ねる一覧にする。
並びは `sequence` 昇順。1 回戦スロットの D&D（`MatchingEditor`）はシード位置の
調整であり別物なので、そのまま残す。

### 共通部品

* `MatchNumberRow` は `<li>` を返すのをやめ、行の中身だけを返す。`<li>` と掴む場所は
  一覧側が持つ（`ScheduleList` が `ScheduleMatchRow` を包むのと同じ形）
* ドラッグの判断は純粋関数に切り出す。`components/schedule/schedule-drag.ts` の
  `resolveDragReorder` と同じ関数が要るため、下位共通層の `lib/dnd/reorder.ts` へ移し、
  スケジュール側もそこから読む。`lib/` は `features` / `components` を参照できない層なので、
  この関数の「ライブラリにも画面にも依存しない純粋関数」という性格がそのまま保たれる
  （`components/division/matching-drag.ts` の `resolveDragSwap` は入れ替え専用の別物なので触らない）
* 送信は行ごとの hidden input ではなく、`DragEnd` で `FormData` を組み立てて
  並べ替え後の id 配列を丸ごと送る。保存中はハンドルを無効にする
  （古い並びから計算した保存が後の保存を打ち消すのを防ぐ）

## 文言と進行順への波及

* `lib/division/label.ts` の `matchPositionLabel`:
  リーグは `第{sequence + 1}試合`（節を出さない）、トーナメントは
  `{round}回戦 第{order + 1}試合` のまま
* `features/schedule/domain.ts` の既定の並び:
  `部門 order → round → order` から `部門 order → sequence` へ。
  部門側で組んだ実施順が、進行順画面の初期の並びになる
* `features/division/single-elimination/view.ts` の試合番号一覧の並び:
  `round → order` から `sequence` へ

## エラーと表示

| 状況 | 扱い |
|---|---|
| 送られた id 配列が現在の組み合わせと一致しない | 「並び順が不正です」を一覧の上に出す。保存しない |
| 対象の部門が無い / 編集対象外の形式 | `notFound()`（既存スライスと同じ） |
| 保存直前の検証に失敗 | `DivisionDataError`。既存の文言変換に乗せる |
| 組み合わせがリーグの形をしていない（`/edit` で形式だけ変えた部門） | 一覧を出さず「作り直してください」のまま。並べ替えの入口も出ない |

## テスト

* `reorder-matches/domain.test.ts`: 並べ替え・試合番号の振り直し・`id` と `round` /
  `order` / `slots` の不変性・欠け / 重複 / 未知の id の拒否・元の配列を壊さないこと
* `reorder-matches/repository.test.ts`, `handler.test.ts`: 既存スライスと同じ観点
  （所有権・形式・検証・`revalidate` の呼び出し）
* `lib/division/parse.test.ts`: `sequence` の補完（欠落時に `(round, order)` 順で振る、
  一部だけ持つ場合も全件振り直す、揃っていればその順で返す）
* `lib/division/validate.test.ts`: `sequence` の連番チェック（重複・欠番・範囲外）
* `round-robin/build.test.ts`: 節を持たない形で返すこと（`round` が全て 1、
  `sequence` が 0 からの連番、試合の並びが従来と同じ）
* `round-robin/view.test.ts`: フラットな一覧になること
* `lib/division/label.test.ts`, `features/schedule/domain.test.ts`: 文言と並びの更新
* `components/division/LeagueMatchList.test.tsx`, `MatchNumberList.test.tsx`:
  並びの描画とハンドルの有無。D&D の実操作は純粋関数側で担保する
* 既存テストの `BracketMatch` を組み立てている箇所は `sequence` の追加で型エラーになる。
  機械的な追記だが件数が多いので、実装の作業量に見込んでおく
