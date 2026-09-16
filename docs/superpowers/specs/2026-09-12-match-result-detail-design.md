# 試合結果の詳細（勝因・スコア・メモ）設計

2026-09-12

## 目的

- 試合結果に「勝因」「スコア」「メモ」を記録できるようにする。
- 3 項目それぞれの有効・無効と、勝因の選択肢の一覧を `Division` ごとに設定できるようにする。
- 記録した内容を運営の結果入力画面と公開ページの両方で見られるようにする。

2026-09-05 の「試合結果入力（勝敗）設計」でスコアと終了時刻を非目標として見送った
（「表示する画面が無い」）。その前提が変わったのでここで足す。

## 非目標

- スコアから勝者を自動決定しない。勝者は既存の勝者ボタンで人が選ぶ。合計が低い側を勝者に
  しても検証で弾かない（同点時の旗判定、反則による勝ち、審査の取り違えの訂正などを
  仕様で塞ぎたくないため）。
- 終了時刻（`MatchResultRecord.finishedAt`）は引き続き書かない。
- 既存の `MatchResultRecord.score`（表示用文字列）には今後も書き込まない。読み取りだけ残す。
  新しいスコアは構造化した別項目として持つ（後述）。
- リーグの星取表（`LeagueCrossTable`）は変えない。あれは「誰と誰が当たるか」を見せる表で、
  結果を出す場所ではない。

## 用語

- **勝因**: その試合の決着のつき方。「一本勝ち」「判定勝ち」「反則負け」「棄権」など。
  敗者側の事由を表す語（反則負け・棄権）も同じ一覧に並ぶ。文字列ラベルとしてのみ扱い、
  コード側で意味を持たせない。
- **スコア**: 審判の採点。審判が 1〜8 人いて、各審判が両者それぞれに点を付ける。
  部門の設定に従って合計または平均を出す。

## データモデル

### Division.resultConfig（新しい Json 列）

```prisma
model Division {
  ...
  /// 結果入力で何を記録できるか。DivisionResultConfig 型。
  resultConfig Json @default("{\"version\":1,\"winReason\":{\"enabled\":false,\"options\":[\"一本勝ち\",\"判定勝ち\",\"反則負け\",\"棄権\"]},\"score\":{\"enabled\":false,\"count\":3,\"aggregation\":\"sum\"},\"note\":{\"enabled\":false}}")
}
```

```ts
// src/lib/division/types.ts
export type ScoreAggregation = "sum" | "average";

export type DivisionResultConfig = {
  version: 1;
  winReason: { enabled: boolean; options: string[] };
  /** count は 1〜8。片者あたりのスコア欄の数 */
  score: { enabled: boolean; count: number; aggregation: ScoreAggregation };
  note: { enabled: boolean };
};
```

既定値は 3 項目とも `enabled: false`。既存の部門の見え方と操作は何も変わらない。一方
`winReason.options` には 4 つの語を入れておくので、チェックを 1 つ入れるだけで使い始められる。

`entries` / `matchingConfig` / `results` と同じく、列の中身は Zod ではなく
`src/lib/division/parse.ts` の手書きパーサで検証する（既存の 3 列と同じ書き方に合わせる）。
不正な形は `DivisionJsonError`。

### MatchResultRecord の拡張

`Division.results` の中身だけを拡張する。列は増やさない。

```ts
// src/lib/division/types.ts
export type MatchScoreEntry = {
  /** DivisionEntry.id */
  entryId: string;
  /** 未入力は null。長さは保存時の resultConfig.score.count */
  values: (number | null)[];
};

export type MatchResultRecord = {
  matchId: string;
  winnerEntryId: string | null;
  /** 旧・表示用スコア文字列。書き込まない。互換のため読むだけ */
  score?: string;
  finishedAt?: string;
  /** 勝因。現在の options に無い値も保持する */
  winReason?: string;
  /** 両者ぶんの採点。片方だけの記録も許す */
  scores?: MatchScoreEntry[];
  note?: string;
};
```

3 つの判断:

- **スコアは `entryId` で持つ。スロット番号では持たない。** `swap-slots` でスロットを
  入れ替えたときに採点が別人に付け替わるのを避ける。
- **空欄は `0` ではなく `null`。** 入力途中の保存を許し、集計は非 null の値だけで行う。
  非 null が 1 つも無ければ集計値は無し（画面に出さない）。「審判 3 人のうち 1 人ぶんだけ
  入っている」状態を 0 点として扱うと合計も平均も嘘になる。
- **`winReason` は文字列そのものを保存する。** 設定から選択肢を消しても、記録済みの値は
  残り続ける。

### 値の範囲

| 項目 | 制約 |
|---|---|
| `winReason.options` | 各 1〜30 文字（trim 後）、最大 20 件、重複と空行は除去 |
| `score.count` | 1〜8 の整数 |
| `score.aggregation` | `"sum"` または `"average"` |
| スコアの各値 | 0 以上 999.99 以下、小数第 2 位まで、または `null` |
| `note` | 1000 文字以内（trim 後。空文字は未設定として削除） |

スコアに負数を許さないのは減点方式の採点を想定していないため。必要になれば下限だけ
緩めればよく、保存形式は変わらない。

### 集計

```ts
// src/lib/division/score.ts（新規）
export const aggregateScore = (
  values: readonly (number | null)[],
  aggregation: ScoreAggregation,
): number | null;

export const formatScore = (value: number | null): string | null;
```

- `sum`: 非 null の合計。
- `average`: 非 null の合計 ÷ 非 null の個数。
- どちらも非 null が 0 個なら `null`。
- `formatScore` は小数第 2 位で四捨五入し、末尾の不要な 0 を落とす（`21` / `6.67` / `7.5`）。
  浮動小数の誤差（`0.1 + 0.2`）が画面に出ないよう、四捨五入は表示の直前に 1 回だけ行う。

この 2 つは入力中のクライアント側と、公開ページのサーバ側の両方から呼ぶので、
どちらからも参照できる `src/lib/` に置く（`features` 同士は import できない）。

## 設定の変更と既存の記録

**設定は表示と入力のフィルタにすぎない。設定を変えても `results` は書き換えない。**

| 操作 | 結果 |
|---|---|
| 項目を無効にする | 入力欄と表示が消える。記録は残り、再び有効にすると戻る |
| `score.count` を減らす | 減らした先までしか欄が出ない。溢れた値は表示されず、次にその試合を保存したときに切り詰められる |
| 使用中の勝因ラベルを削除する | その試合の `<select>` にだけ「（一覧にない）○○」として選択済みで残る。別の値に変えれば消える |

こうする理由は、大会の最中に「メモも使いたい」と設定を足したり、誤って外したりしても
入力済みの値が失われないこと。逆に `results` を設定に合わせて掃除すると、チェックボックスの
誤操作が復旧不能なデータ消失になる。

## 保存経路

### 詳細の保存: 新スライス `features/division/update-result-detail/`

詳細の保存は `record-result` に同居させず、別スライスにする。理由は 2 つ。

1. **下流を消す条件が違う。** `record-result` は勝者が変わったら下流の記録を消す。詳細の
   保存は勝者を変えないので、下流を消してはならない。同じ Server Action に同居させると
   「何を送ったときに何が消えるか」が読めなくなる。
2. **入力の形が違う。** 勝敗はボタン 1 タップで即保存、詳細は複数欄をまとめて保存ボタンで送る。

### 勝敗の付け直し: `record-result` の変更

`record-result` 側は 1 点だけ変える。記録済みの試合で勝者を変えたとき、これまでは記録を
丸ごと置き換えていたため、入力済みの勝因・スコア・メモが黙って消えていた。

- 勝者が変わったら **`scores` と `note` は引き継ぎ、`winReason` は消す。** スコアとメモは
  勝者が誰かに依らず意味を保つ。勝因は前の勝者に付けたものなので、残すと新しい勝者の
  勝因として表示されてしまう。
- 取り消し（空文字）は従来どおり記録ごと消す。下流の記録を消す挙動も変えない。

構成は既存スライスと同じ 4 ファイル（`schema.ts` / `usecase.ts` / `repository.ts` /
`handler.ts`）。`repository.ts` は `record-result` と同じく `$transaction` + `revision` の
楽観ロックで書く。

**受け付ける条件**

- その試合に勝敗の記録が既にあること（`results` に `matchId` の行があること）。無ければ
  新エラー `DivisionResultNotRecordedError`。勝敗より先に詳細だけ入れる場面は無く、
  許すと「記録の無い試合が記録済みに見える」状態を作ってしまう。
- 該当部門・大会・組織の所有であること（`requireOrganization` とは別に `where` でも確かめる。
  Server Action はページを経由せず直接叩ける）。

**項目ごとの扱い（サーバ側）**

- 無効化されている項目は**書かない。既存値も消さない。** 画面に出ていない項目を直接 POST で
  書き換えられないようにしつつ、設定＝フィルタの方針とも揃う。
- `winReason`: 空文字は解除。値がある場合、`options` に含まれるか、その試合に今保存されて
  いる値と同一のときだけ受理する。それ以外は入力エラー。任意の文字列を投げ込めると
  部門ごとの選択肢という設定の意味が無くなる。
- `scores`: フォームの欄名を `score_<entryId>_<index>` にする。サーバは「その試合の 2 つの
  スロットの `entryId`」×「`config.score.count`」から**期待する欄名を自分で組み立てて**
  読み出す。送られてきたキーを信用して列挙しない。両者とも全欄が空なら `scores` を削除する。
- `note`: trim して空なら削除。

### 設定の保存: 既存の `features/division/update/` を拡張

部門編集（`/divisions/[divisionId]/edit`）と同じフォーム・同じ Server Action で保存する。

- 検証部品 `divisionResultConfigSchema` は `features/division/update/schema.ts` に置く。
  使うのが `update` だけなので、`schema-parts.ts`（`create` と `update` の共有部品）には
  上げない。
- `options` は textarea の中身を改行で分割 → 各行 trim → 空行を除去 → 重複を除去 → 上限件数で
  切る、の順で正規化する。
- `updateDivisionInDb` の `data` に `resultConfig` を足す。`results` には触れない。

部門の**作成**フォームには設定欄を出さない。`DivisionForm` に `defaultResultConfig` を
任意の props として渡し、渡されたときだけ `<fieldset>` を描く。部門を作る時点で採点方式まで
決める運用は考えにくく、作成画面を短く保ちたいため。

## 画面

### (a) 部門編集 `/orgs/[slug]/tournaments/[id]/divisions/[divisionId]/edit`

既存の「部門名」「試合形式」の下に `<fieldset>` を 1 つ足す。

```
── 結果入力の設定 ────────────────
[✓] 勝因を記録する
    勝因の選択肢（1行1項目）
    ┌────────────────┐
    │一本勝ち        │
    │判定勝ち        │
    │反則負け        │
    │棄権            │
    └────────────────┘
[✓] スコアを記録する
    スコア欄の数 [3 ▾]   集計 (●)合計 ( )平均
[✓] メモを記録する
```

チェックを外しても記録済みの内容は消えず、表示されなくなるだけである旨を注記する。

### (b) 結果入力 `/orgs/[slug]/tournaments/[id]/results`

勝者ボタンは現状のまま 1 タップで即保存。その右に「詳細 ▾」を足す。

```
────────────────────────────────────────
 第3試合  男子シングルス / 1回戦
   [ 田中 ] vs [ 佐藤 ]   [取り消し] [詳細 ▾]
   一本勝ち ・ 21.0 - 20.0 ・ 📝          ← 入力済みのときだけ出る要約
  ┌──────────────────────────────┐
  │ 勝因  [一本勝ち ▾]                │
  │ スコア      1     2     3    集計  │
  │  田中      [7.0] [6.8] [7.2]  21.0 │
  │  佐藤      [6.5] [6.9] [6.6]  20.0 │
  │ メモ  [                      ]    │
  │                        [ 保存 ]    │
  └──────────────────────────────┘
```

- 「詳細」ボタンは `row.state === "recorded"` かつ有効な項目が 1 つ以上あるときだけ出す。
  未確定・BYE・未記録の行には出さない。
- 有効な項目だけを描画する。
- 集計値は入力に追従してクライアント側で再計算する（`useState` + `aggregateScore`）。
- 現在の一覧にない勝因が保存されている行では、`<select>` の先頭にその値を
  「（一覧にない）○○」として選択済みで出す。
- 保存は `MatchResultRow` の勝敗フォームとは**別の `<form>`**。HTML のフォームは入れ子に
  できないので、アコーディオンは `<li>` の中で勝敗フォームと並ぶ兄弟として置く。
- `useActionState` を行ごとに持ち、エラーはその行の下に出す（勝敗フォームと同じ形）。

### (c) 公開ブラケット（`MatchCard`）

ノードは 220×76 の固定寸法。`NODE_WIDTH` / `NODE_HEIGHT` は変えない（変えると
`layout-bracket` の座標計算とそのテストまで波及する）。今ある右上のスコアバッジを
「スロット行ごとの集計スコア」に置き換え、空いた右上にメモアイコンを置く。

```
┌──────────────────────┐
│ 3          田中  一本 21.0 │  ← 勝者行に勝因バッジ＋集計スコア
│         📝 佐藤       20.0 │  ← メモアイコンはメモがある試合だけ
└──────────────────────┘
```

勝因バッジは幅を食うので、参加者名と同じく truncate する。

### (d) 公開の試合一覧 `/t/[tournamentId]/schedule`

この一覧は現在、結果を一切出していない。そのためリーグ（`ROUND_ROBIN`）の部門は公開側で
結果を見る場所が無い（ブラケットは `SINGLE_ELIMINATION` 専用）。ここに結果を出すことで
全形式が公開で見られるようになる。

ページのデータ取得を `loadScheduleView` から `loadResultRows` に替え、各行に勝者・勝因・
スコア・メモアイコンを足す。

```
┌──────────────────────────────────┐
│ 第3試合  田中 vs 佐藤                  │
│ 男子シングルス / 1回戦                  │
│ ✓田中の勝ち ・ 一本勝ち ・ 21.0-20.0 ・📝 │
└──────────────────────────────────┘
```

引き分け（`winnerEntryId === null`、`ROUND_ROBIN` のみ）は「引き分け」と出す。勝因・スコア・
メモはそのまま並べる。ブラケット（c）は引き分けを扱えず `from-division` が結果ごと捨てるため、
引き分けの表示はこの一覧だけの話になる。

これは「勝因・スコア・メモを足す」を超えて「公開一覧に勝敗を出す」という追加になるが、
リーグ部門の公開表示が他に無いため今回の範囲に含める。

### メモの表示

`src/components/result/MatchNoteButton.tsx`（client component）を 1 つ作り、(b)(c)(d) の
3 箇所で使い回す。

- メモが空なら何も描画しない。
- アイコンを押すと吹き出しが開く。HTML の `popover` 属性を使い、`Esc` と外側クリックで
  閉じる挙動をブラウザに任せる（自前の外側クリック検出を書かない）。
- `aria-label` は「第N試合のメモ」。

## 読み出し側の変更

| 場所 | 変更 |
|---|---|
| `features/division/repository.ts` | `DivisionDetail` に `resultConfig: unknown` を足し、`select` に含める |
| `features/schedule/types.ts` | `ScheduleDivision` に `resultConfig: DivisionResultConfig` を足す |
| `features/schedule/repository.ts` | `resultConfig` を選んで `parseDivisionResultConfig` に通す |
| `features/schedule/result-rows.ts` | `ResultRowView`（match）に `resultConfig` と `winReason` / `scores` / `note` を、divider に `startsAt` を足す |
| `features/bracket/from-division.ts` | `MatchResult` に `winReason` / `scores` / `note` を載せ、`resultConfig` も渡す |
| `features/bracket/resolve-bracket.ts` | `ResolvedMatch` に同じ 3 項目と、スロットごとの集計スコアを載せる |

ブラケット側の参加者 id は `DivisionEntry.id` なので、`scores` の `entryId` はそのまま
スロットに対応づけられる（変換表は要らない）。

`ResultRowView` の区切り行が `startsAt` を持っていないのは、結果入力に時刻が要らないため
だった。(d) で公開の試合一覧をこの型に移すと区切りの開始予定時刻が消えてしまうので、
`ScheduleRowView` と同じく `Date | null` を素のまま載せる（書式化は画面側の仕事）。

`revalidate.ts` の `revalidateDivisionResults` に公開ページ（`/t/[tournamentId]/schedule` と
`/t/[tournamentId]/divisions/[divisionId]`）を足す。公開ブラケットは今も結果を出しているのに
再検証の対象から漏れており、(d) を足すとその取りこぼしが目に見えるようになる。
`record-result` も同じ関数を呼ぶので、既存の勝敗入力もあわせて直る。

## エラー

`features/division/errors.ts` に 1 つ足す。

- `DivisionResultNotRecordedError` — 勝敗が未記録の試合に詳細を保存しようとした。
  文言は「先に勝敗を記録してください」。
- `DivisionWinReasonNotAllowedError` — 選択肢にも現在の記録にも無い勝因を保存しようとした。
  文言は「その勝因は選べません。画面を再読み込みしてください」。この判定には DB 側の
  `resultConfig.winReason.options` と現在の記録の両方が要るので Zod では書けず、repository で
  行う。したがって入力エラーではなくドメインエラーになる。

`messages.ts` の対応表にも追加する（Record のキーが網羅されているので、足し忘れは
コンパイルエラーになる）。

## テスト

Vitest。既存の並びに合わせて各スライスへ `*.test.ts` を置く。TDD で進める。

- `lib/division/parse` — `resultConfig` の検証、`MatchResultRecord` の新項目、
  新項目を持たない旧データがそのまま読めること、不正値の拒否
- `lib/division/score` — 合計・平均、全 null、一部 null、丸めと末尾 0 の落とし方
- `features/division/schema-parts` — `options` の正規化（trim / 空行 / 重複 / 上限）、
  `count` の範囲、`aggregation` の値
- `features/division/update` — 設定が保存されること、`results` に触れないこと
- `features/division/update-result-detail` — 無効項目を書かず既存値も消さないこと、
  一覧外ラベルの受理と拒否、範囲外スコアの拒否、送られてきた未知の欄名を無視すること、
  未記録の試合でのエラー、`revision` 競合、**下流の記録が消えないこと**
- `features/schedule/result-rows` — 新項目が行に載ること
- `features/bracket/from-division` / `resolve-bracket` — 新項目の伝播
- コンポーネント — `DivisionForm` の fieldset、詳細フォームの描画と集計の追従、
  一覧にない勝因の選択肢、`MatchNoteButton` の開閉、`MatchCard` と
  `PublicScheduleList` の表示

## マイグレーション

`Division.resultConfig` を足す 1 本のみ。`NOT NULL DEFAULT` 付きなので既存行はそのまま
既定値（3 項目とも無効）になる。既存の `results` は形を変えないので後方互換の心配は無い。
