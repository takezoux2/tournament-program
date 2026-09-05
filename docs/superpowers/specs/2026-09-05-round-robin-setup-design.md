# リーグ（総当たり）編集画面 設計

作成日: 2026-09-05

## 目的

`DivisionFormat.ROUND_ROBIN` の部門について、`entries`（誰が出るか）と
`matchingConfig`（対戦表）を編集する画面を作る。

現状、編集経路は `SINGLE_ELIMINATION` にしか無い。`setup-store.ts` の読み出しが
他の形式を「その部門は無い」に倒しているため、リーグの部門は作れても中身を
一切埋められない。部門詳細のブラケットは常に「組み合わせが未作成です」を表示する。

## スコープ

含む:

* エントリーの追加・削除・並べ替え（既存スライスの再利用）
* 総当たり対戦表の自動生成（円卓法で節に分ける）
* 試合番号の編集
* 星取表グリッドと節ごとの試合一覧の表示
* 大会の試合一覧（進行順）の位置文言を節に対応させる
* 部門詳細ページの「エントリー・組み合わせ」ボタンを format で振り分ける

含まない:

* `results`（勝敗）の入力と順位表。既存の `results` がある部門は編集を拒否する
* 部門詳細ページ（`DivisionBracket`）でのリーグ表示。「まだ対応していません」のまま
* ダブルエリミネーション 2 形式
* 2 回総当たり（ホーム&アウェイ）。1 回総当たりのみ
* 対戦カードの手動編集。リーグは全員が全員と当たるため入れ替えに意味が無い

## 決定事項

| 論点 | 決定 |
|---|---|
| 画面の分け方 | 別 URL を新設する（`/divisions/[divisionId]/league`）。既存の `/setup` は触らない |
| サーバ側の分け方 | 既存スライスを共有し、「組み合わせをどう作り直すか」だけ format で分岐する |
| 組み合わせの作り方 | 円卓法（サークル法）で `n-1` 節（奇数なら `n` 節）に分ける |
| 周回数 | 1 回総当たりのみ |
| 奇数人の休み | 試合として保存しない。画面で「休み: 山田」と算出して出す |
| エントリー変更時 | 追加・削除・並べ替えの**すべて**で対戦表を丸ごと作り直す |
| エントリー上限 | ROUND_ROBIN は 16 人（最大 120 試合）。SINGLE_ELIMINATION は 128 人のまま |
| 対戦表の表示 | 星取表グリッドと節ごとの試合一覧の両方を出す |
| 試合番号の編集 | 節ごとの試合一覧の各行に置く（一覧と番号編集を兼ねる） |
| 同時編集 | 楽観ロックは入れない。後勝ち（既存と同じ） |

### 追加・削除・並べ替えのすべてで再生成する理由

トーナメントには「席を 1 つ埋める」（末尾の `bye` を置換する）という、既存の
対戦カードを壊さない追加操作がある。リーグには対応する操作が無い。1 人増えれば
全員の試合が 1 つずつ増え、円卓法の割り当ても全部ずれる。部分更新の規則を
考えるより、シード順から毎回作り直す方が「常に現在のエントリーの総当たりである」
という不変条件を保てる。

並べ替えも同じ扱いにする。円卓法の出力はシード順から決まるので、並べ替えたのに
対戦表が古いままだと画面の 2 箇所が食い違う。手で変えた試合番号は再生成で
失われるため、その旨を通知に出す。

## 中核となるデータ設計

### 円卓法

`n` 人を固定 1 人と回転 `n-1` 人に分け、回転させながら向かい合う相手と組む。
奇数人のときは架空の 1 人を足して偶数にし、その相手に当たった人がその節の休みになる。

```
4 人（A, B, C, D）
  第1節: A vs D / B vs C
  第2節: A vs C / D vs B
  第3節: A vs B / C vs D

5 人（A, B, C, D, E）… 架空の 1 人 X を足して 6 人として回す
  第1節: B vs E / C vs D   （A は休み = X と当たった）
  第2節: A vs E / B vs C   （D は休み）
  ... 全 5 節
```

固定するのは配列の先頭（シード 1 位）で、架空の 1 人は末尾に置く。この置き方だと
第1節はシード 1 位が休みになる。誰がどの節で休むかは回転から決まるので、
同じエントリーからは必ず同じ割り当てになる。

節数は偶数人で `n-1`、奇数人で `n`。試合数はどちらも `n * (n-1) / 2`。

### `MatchingConfig` への写し方

| フィールド | 値 |
|---|---|
| `id` | `r{節}-{節内の位置}`（`r1-0`, `r3-1`）。決定的なので作り直しても同じ入力からは同じ id |
| `bracket` | `"winners"` 固定 |
| `round` | 節番号（1 始まり） |
| `order` | 節内の位置（0 始まり） |
| `matchNumber` | 全節を通した 1 始まりの連番 |
| `slots` | 両方とも `{ kind: "entry", entryId }` |

id の接頭辞を `single-elimination` の `m{round}-{order}` と変えるのは、形式を
取り違えたデータが混ざったときに見分けられるようにするため。

**奇数人の休みは試合として保存しない。** `山田 vs BYE` を `matchingConfig` に
入れると、`features/schedule` がそれを 1 試合として拾い、大会の進行順画面に
実在しない試合の行が出てしまう。「誰が休みか」は表示のたびに、その節の試合に
出ていないエントリーとして算出する。

### エントリーが 2 人未満のとき

対戦が成立しないので `{ version: 1, matches: [] }` を返す。`generate-matching` は
これを `DivisionNotEnoughEntriesError` に倒す（既存の文言「組み合わせを作るには
エントリーが2人以上必要です」がそのまま通用する）。`remove-entry` は
`matching: "cleared"` として通知する。どちらも既存の判定ロジックがそのまま働く。

## ファイル構成

```
src/features/division/
├── round-robin/                 純粋ドメイン。スライスではない（新設）
│   ├── build.ts                 circleRounds / buildRoundRobin
│   ├── build.test.ts
│   ├── view.ts                  toRoundView / toCrossTableView
│   └── view.test.ts
├── matching-strategy.ts         format による分岐を閉じ込める（新設）
├── matching-strategy.test.ts
├── setup-store.ts               形式チェックを広げ、format を運ぶ
├── add-entry/repository.ts      上限と組み直しを strategy 経由に
├── remove-entry/repository.ts   再生成を strategy 経由に
├── reorder-entry/repository.ts  再生成を strategy 経由に、戻り値を拡張
├── generate-matching/repository.ts  strategy 経由に
├── set-match-number/repository.ts   形式チェックを広げる
├── swap-slots/repository.ts     SINGLE_ELIMINATION 限定を明示
├── errors.ts                    DivisionEntryLimitError に limit を足す
└── messages.ts                  上限の文言を limit から作る

src/components/division/
├── LeagueSetup.tsx              画面全体（server component、新設）
├── LeagueCrossTable.tsx         星取表グリッド（server component、新設）
├── LeagueRoundList.tsx          節ごとの試合一覧＋試合番号編集（client、新設）
└── DivisionDetail.tsx           ボタンの行き先を format で振り分ける

src/lib/division/label.ts        matchPositionLabel を format 対応に

src/features/schedule/
├── types.ts                     ScheduleDivision に format を足す
├── repository.ts                select に format を足す
└── domain.ts                    matchPositionLabel に format を渡す

src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.tsx
```

`round-robin/` は `single-elimination/` と同じく、カテゴリ直下に置く共有ドメインで
あってスライスではない。`handler.ts` / `repository.ts` を持たないことで見分けられる。
この扱いは `docs/code-design/architecture.md` に追記する。

## 形式別の組み直し規則（`matching-strategy.ts`）

format による分岐をこの 1 ファイルに閉じ込める。各スライスの `repository.ts` は
「エントリー配列をどう変えるか」だけを書き、組み合わせの作り直しはここへ委ねる。

```ts
export const EDITABLE_FORMATS = ["SINGLE_ELIMINATION", "ROUND_ROBIN"] as const;
export type EditableFormat = (typeof EDITABLE_FORMATS)[number];
export const isEditableFormat = (format: DivisionFormat) => format is EditableFormat;
```

| 関数 | SINGLE_ELIMINATION | ROUND_ROBIN |
|---|---|---|
| `regenerateMatching(format, entries)` | `buildFromSlots(generateSlots(entries))` | `buildRoundRobin(entries)` |
| `applyEntryAdded(format, current, entries, addedId)` | `buildFromSlots(placeEntry(toSlots(current), addedId))` | `current` が空なら空、そうでなければ再生成 |
| `applyEntryReordered(format, current, entries)` | `current`（触らない） | `current` が空なら空、そうでなければ再生成 |
| `maxEntries(format)` | 128 | 16 |

`switch` は `EditableFormat` に対して網羅的に書く。対応形式を増やしたときに
分岐の書き忘れがコンパイルエラーになる（`format.ts` の `DIVISION_FORMAT_LABELS` や
`errors.ts` の `divisionErrorTags` と同じ考え方）。

`applyEntryAdded` / `applyEntryReordered` が「`current` が空なら空」を保つのは、
組み合わせ未作成の部門にエントリーを足しただけで対戦表が生えないようにするため。
生成は運営者が明示的にボタンを押したときだけ起きる。

## 既存スライスへの変更

### `setup-store.ts`

`load` の形式チェックを `row.format !== "SINGLE_ELIMINATION"` から
`!isEditableFormat(row.format)` に変える。`DivisionSetup` に `format: EditableFormat`
を足し、各スライスが規則を引けるようにする。`save` は `format` を書かない
（`/edit` が持つ責務であり、この経路では変えない）。

`load` に形式の判定を置く理由は変わらない。Server Action はページを経由せず
直接叩けるため、画面の分岐だけでは、例えばダブルエリミネーションの部門へ
`generateMatching` を投げられると、どの画面にも出ない木が書き込まれてしまう。

### `add-entry`

* 上限を `MAX_DIVISION_ENTRIES`（128 固定）から `maxEntries(current.format)` に変える
* 組み直しを `applyEntryAdded` に差し替える
* `DivisionEntryLimitError` に `limit: number` を足し、文言を
  「エントリーは{limit}人までです」にする。形式で上限が変わるのに文言が
  128 固定だと、リーグで 16 人目を弾いたときに嘘を表示する

### `remove-entry`

再生成を `regenerateMatching(current.format, entries)` に差し替える。
`unchanged` / `regenerated` / `cleared` の判定は「再生成の結果が空かどうか」で
書かれており、リーグでもそのまま正しい。

### `reorder-entry`

`applyEntryReordered` を通す。戻り値を `{ moved: boolean }` から
`{ moved: boolean; regenerated: boolean }` に広げ、handler は `regenerated` の
ときだけ「並べ替えに合わせて対戦表を作り直しました」を通知に出す。
トーナメントでは常に `false` になるので、既存画面の見え方は変わらない。

### `generate-matching`

`generateSlots` + `buildFromSlots` の直接呼び出しを
`regenerateMatching(current.format, current.entries)` に差し替える。
結果が空なら `DivisionNotEnoughEntriesError`。この判定は両形式で共通。

### `set-match-number`

`setup-store` を経由せず独自のトランザクションを持つ（勝敗記録後も編集できる
ため）。その中の `row.format !== "SINGLE_ELIMINATION"` を `isEditableFormat` に変える。

### `swap-slots`

1 回戦スロットの入れ替えはリーグに意味が無い。`setup-store` の形式チェックが
広がるとリーグでも通ってしまうため、このスライスの `repository.ts` で
`current.format !== "SINGLE_ELIMINATION"` を確かめ、`{ found: false }` を返す
（＝ `notFound()`）。他の形式と同じ扱いで、存在を漏らさない。

## 画面

### ルーティング

```
divisions/[divisionId]/
├── setup/    SINGLE_ELIMINATION 専用（現行のまま）
└── league/   ROUND_ROBIN 専用（新設）
```

`league/page.tsx` は `setup/page.tsx` と同じ骨格を持つ。`requireOrganization(slug)`
→ 大会・部門・参加者・メンバーの並列読み出し → 見つからなければ `notFound()`。
加えて `division.format !== "ROUND_ROBIN"` なら `notFound()` に倒す。
URL を直に叩いて別形式の部門を開いたときに、中途半端な画面を出さないため。

`setup/page.tsx` にも対称の判定（`SINGLE_ELIMINATION` 以外なら `notFound()`）を
入れる。現状は `DivisionSetup` が「まだ対応していません」を出しているが、
専用画面が別にある以上、案内より 404 の方が正しい。

### `LeagueSetup` の構成

| 区画 | 中身 |
|---|---|
| 編集ロックの通知 | `results` が 1 件でもあれば「勝敗が記録されているため…」（既存と同じ） |
| エントリー | 既存の `EntryList` と `AddEntryForm` をそのまま再利用する |
| 対戦表 | 「対戦表を生成」ボタン ＋ `LeagueCrossTable` |
| 節ごとの試合 | `LeagueRoundList`（試合番号の編集を兼ねる） |

`EntryList` / `AddEntryForm` はどちらも形式に依存しない server component で、
props も `DivisionFormAction` を受け取るだけなので、変更なしで再利用できる。

`DivisionSetup` と同じく、Json のパース失敗はこの区画で受け止めてページを落とさない。

### 形式違いのデータへの対応

`/edit` は `format` を無条件に書き換えるため、トーナメントで組んだ木を持ったまま
`ROUND_ROBIN` に変えられる。このとき `matchingConfig` には `winnerOf` スロットが
残っている。

`LeagueSetup` は「`entry` 以外のスロットを持つ試合が 1 つでもあるか」を見て、
あれば星取表と節一覧の代わりに「この対戦表はリーグの形ではありません。
作り直してください」を出し、生成ボタンだけ残す。`/edit` 側でデータを消す挙動は
入れない（形式を選び直しただけで対戦表が消えるのは破壊的で、戻せない）。

### `LeagueCrossTable`

行と列にエントリーを `seed` 昇順で並べ、交点にその対戦の試合番号（`第3試合`）を
置く。対角は `—`。まだ対戦が無い組は空欄。

人数が増えると横に広がるため、`overflow-x: auto` の箱に入れる。
参加者名を引けなかったエントリーは「（不明な参加者）」と出す
（`lib/division/label.ts` の方針に合わせる）。

### `LeagueRoundList`

節を見出しにして、その節の試合を並べる。1 行は既存の `MatchNumberList` と同じ
作り（1 行 1 フォーム、`useActionState` を行ごとに持ち、エラーを行の隣に出す）。

* 位置の文言: 「第1節 第1試合」
* 対戦の文言: 「山田 vs 佐藤」（`matchCardLabel` を使う）
* 試合番号: テキスト入力と保存ボタン。構造を変えないので編集ロック中も操作できる
* 奇数人のとき、節の見出しの脇に「休み: 山田」を出す

一覧と番号編集を 1 つの区画にまとめるのは、同じ試合が「節ごとの一覧」と
「試合番号」の 2 区画に重複して並ぶのを避けるため。既存の `/setup` 画面が
一覧と番号編集を分けているのは、あちらでは一覧側が 1 回戦のスロット D&D で
別物だからで、リーグにはその区別が無い。

## 既存画面への波及

### 試合一覧（進行順）の位置文言

`lib/division/label.ts` の `matchPositionLabel(match)` は
`${round}回戦 第${order + 1}試合` を返す。リーグの対戦表を作った瞬間、
大会の進行順画面がその試合を拾い、節を「1回戦」と表示してしまう。

`matchPositionLabel(match, format)` に変え、`ROUND_ROBIN` なら
`第${round}節 第${order + 1}試合` を返す。呼び出し元は 2 箇所。

* `features/schedule/domain.ts` — `ScheduleDivision` に `format` を足し、
  `repository.ts` の `select` にも足す
* 部門の試合番号一覧 — `single-elimination/view.ts` の `toMatchNumberView` と、
  新しい `round-robin/view.ts` の `toRoundView`。どちらも扱う形式が決まっている
  モジュールなので、引数では受け取らず定数を渡す

### 部門詳細のボタン

`DivisionDetail.tsx` の「エントリー・組み合わせ」の行き先を format で振り分ける。

| format | 行き先 |
|---|---|
| `SINGLE_ELIMINATION` | `/divisions/{id}/setup` |
| `ROUND_ROBIN` | `/divisions/{id}/league` |
| ダブルエリミネーション 2 種 | ボタンを出さない |

対応形式が増えたときに書き忘れないよう、対応表は `Record<DivisionFormat, string | null>`
として持つ（`DIVISION_FORMAT_LABELS` と同じ形）。

### 対象外

部門詳細ページの `DivisionBracket` はリーグ非対応のままにする
（「リーグ（総当たり）のブラケット表示はまだ対応していません」を表示し続ける）。
編集画面の星取表とは求められる情報が違う（詳細ページは勝敗込みの結果表が要る）ため、
勝敗入力を作るときに一緒に設計する。

## テスト

既存の粒度に合わせ、純粋ドメイン・repository・コンポーネント・ページの 4 層で書く。

**新規**

* `round-robin/build.test.ts` — 偶数人 / 奇数人 / 2 人 / 1 人 / 0 人。全ペアが
  ちょうど 1 回ずつ現れること、同じ節に同じエントリーが 2 回出ないこと、
  節数が `n-1`（偶数）・`n`（奇数）になること、`matchNumber` が連番であること、
  同じ入力から同じ id が出ること
* `round-robin/view.test.ts` — 節ごとの並び、休みの算出、星取表の対称性、
  参加者を引けないエントリーの扱い
* `matching-strategy.test.ts` — 形式ごとの 4 関数の分岐
* `LeagueSetup.test.tsx` — 編集ロックの表示、形式違いデータの案内、
  Json パース失敗時にページを落とさないこと
* `LeagueCrossTable.test.tsx` / `LeagueRoundList.test.tsx`
* `league/page.test.tsx` — 別形式の部門で `notFound()` になること

**追記**

* 変更した 6 つの `repository.test.ts` に ROUND_ROBIN のケース
* `setup-store.test.ts` — ROUND_ROBIN が通り、ダブルエリミネーションが
  `{ found: false }` になること
* `label.test.ts` — 節の文言
* `schedule/domain.test.ts` — リーグの部門が混ざったときの位置文言
* `DivisionDetail.test.tsx`（無ければ新規）— ボタンの行き先
* `setup/page.test.tsx` — ROUND_ROBIN で `notFound()` になること

## 実装の進め方

`AGENTS.md` の指示に従い、worktree を切ってサブエージェントで実装する。
