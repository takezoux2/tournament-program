# Division CRUD 画面 設計

作成日: 2026-08-30

## 目的

`Division`（画面上の呼称は「部門」）の作成・一覧・詳細・編集・削除・並べ替えを画面から行えるようにする。
既存の Organization / Tournament CRUD と同じ構造を、大会の一段下にそのまま重ねる。

## 用語

依頼時の「Stage」は既存の `Division` を指す。スキーマ・コード・画面文言はすべて `Division` /
「部門」で統一し、「ステージ」という語は使わない。既存の `DeleteTournamentForm` の文言
（「この大会に属する部門もすべて削除されます」）および `2026-08-27-division-model-design.md` と揃える。

## スコープ

対象は `Division` の次の 3 列。

| 列 | 画面での扱い |
| --- | --- |
| `name` | 作成・編集フォームのテキスト入力 |
| `format` | 作成・編集フォームの選択（`DivisionFormat` の 4 値） |
| `order` | フォームには出さない。作成時に自動採番し、一覧の ↑↓ で並べ替える |

`entries` / `matchingConfig` / `results` / `revision` は**読み取りのみ**。詳細ページの表示に使うだけで、
この機能からは書き込まない。書き込みはエントリー登録・組み合わせ作成・結果入力の後続機能が担当する。

スキーマ変更・マイグレーションは行わない。

## ルーティング

| パス | 内容 |
| --- | --- |
| `/orgs/[slug]/tournaments/[tournamentId]` | **既存ページに追記。** 部門一覧（↑↓ 並べ替え、「部門を作成」ボタン） |
| `/orgs/[slug]/tournaments/[tournamentId]/divisions/new` | 作成 |
| `/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]` | 詳細（メタ情報 + ブラケット描画） |
| `/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/edit` | 編集 + 削除 |

パンくずは `組織 / <組織名> / <大会名> / <部門名>` を基本形とし、既存ページと同じ `AppHeader` を使う。

## ディレクトリ構成

```
src/features/division/
├── schema-parts.ts            divisionNameSchema / divisionFormatSchema
├── state.ts                   DivisionFormState / DivisionFormAction
├── errors.ts                  UnexpectedDivisionError / DivisionOrderConflictError
├── messages.ts                DivisionError → 日本語文言（Match.exhaustive）
├── effect-to-form-state.ts    Exit-failure → DivisionFormState
├── format.ts                  DIVISION_FORMAT_LABELS
├── repository.ts              listDivisionsInTournament / findDivisionInTournament
├── create/{schema,handler,usecase,repository}.ts
├── update/{schema,handler,usecase,repository}.ts
├── delete/{schema,handler,usecase,repository}.ts
└── reorder/{schema,handler,usecase,domain,repository}.ts

src/components/division/
├── DivisionList.tsx           一覧（並べ替えボタンを含む）
├── DivisionReorderButtons.tsx ↑↓ の Server Action フォーム
├── DivisionForm.tsx           作成・編集の共用フォーム
├── DeleteDivisionForm.tsx     部門名入力による削除確認
└── DivisionDetail.tsx         詳細のメタ情報

src/features/bracket/
└── from-division.ts           Division の Json → bracket 型 のアダプタ（新規）
```

`features/division` は `features/tournament` に依存しない（同列スライスへの依存は禁止）。
両方の情報が要るページは、ページ層（`app/`）が両スライスからそれぞれ取得して組み立てる。

共通部品を `schema-parts.ts` / `effect-to-form-state.ts` としてカテゴリ直下に置くのは、
create / update の両スライスが祖先方向に参照するため。`features/tournament` と同じ理由。

## テナント分離

`architecture.md` の 2 原則をそのまま適用する。部門は組織→大会→部門の 3 段になるため、
所有権チェックも 3 段を 1 つの `where` で表現する。

```ts
where: { id: divisionId, tournament: { id: tournamentId, organizationId } }
```

`DivisionWhereInput` にリレーションフィルタ `tournament?: XOR<TournamentScalarRelationFilter,
TournamentWhereInput>` があることを `src/generated/prisma/models/Division.ts` で確認済み。

* 認可境界 `requireOrganization(slug)` は、ページ冒頭と Server Action 冒頭で**それぞれ独立に**呼ぶ。
* 更新・削除は `updateMany` / `deleteMany` を使い、`where` に所有条件を残す。単数形は unique な
  `where` しか受け付けず、所有条件を落としてしまう。
* 0 件は「この組織のこの大会にその部門が無い」を意味する。存在を漏らさないよう `notFound()`。

## order の採番と並べ替え

`@@unique([tournamentId, order])` があるため、素朴な実装は unique 制約に触れる。

### 作成時の採番

`$transaction` 内で当該大会の `max(order) + 1` を求めて `create` する。部門が 0 件なら `0`。

同時作成が競って P2002 が出た場合は `DivisionOrderConflictError` に畳み、
「並び順が競合しました。もう一度お試しください」を返す。リトライは自動では行わない。

### 並べ替え

一覧の ↑↓ ボタンが「隣接 2 件の swap」を Server Action で叩く。
A と B の `order` を直接入れ替えると中間状態が unique に触れるため、`$transaction` 内で 3 回更新する。

```
1. A.order → -1          退避。負数は通常採番で出ないため既存行とは衝突しない
2. B.order → A の元 order
3. A.order → B の元 order
```

退避値 `-1` は既存行とは衝突しないが、同じ大会で並べ替えが同時に走ると退避値どうしが衝突しうる。
その P2002 も `DivisionOrderConflictError` に畳み、「並び順が競合しました。もう一度お試しください」を
返す。作成時の衝突と同じ扱いで、自動リトライはしない。

`reorder/domain.ts` に、一覧と「どの部門をどちらへ動かすか」から入れ替える 2 件を求める純粋関数を置き、
単体テストする。端（先頭の ↑ / 末尾の ↓）は `null` を返す。

先頭の ↑ と末尾の ↓ はボタンを `disabled` にするが、それは体感のためで境界ではない。
隣が存在しない要求はハンドラ側で 0 件更新となり `notFound()` に倒れる。

## ブラケット描画

詳細ページに、その部門のブラケットを `TournamentFlow` で描画する。

### 型の断絶

`lib/division`（永続化側）と `features/bracket`（描画側）は別系統の型を持ち、両者を繋ぐものが無い。

| | `lib/division` | `features/bracket` |
| --- | --- | --- |
| スロット参照 | `entryId` | `participantId` |
| 敗者復活 | `loserOf` あり | なし |
| ブラケット区分 | `winners` / `losers` / `final` | 概念なし |
| 引き分け | `winnerEntryId: null` 可 | `winnerId: string` 固定 |
| レイアウト | — | 供給元の中点で配置 = 勝ち上がり木専用 |

全 4 形式の描画には敗者ブラケットのレイアウトとリーグの星取表が要り、この機能より大きい別テーマになる。
**今回は `SINGLE_ELIMINATION` のみを描画対象とする。**

### アダプタの置き場所

`src/features/bracket/from-division.ts` に置く。

`features/division` に置くと同列スライス `features/bracket` への依存になり禁止される。
`features/bracket` から `lib/division` の型を読む向きなら、下位の共通層への依存で正しい。
`lib/division` は変更しない。

```ts
fromDivision(input: {
  format: DivisionFormat
  entries: DivisionEntries
  matchingConfig: MatchingConfig
  results: DivisionResults
  /** 大会の参加者。表示名は解決済みで渡す。seed は持たせない（後述） */
  participants: { id: string; name: string; team?: string }[]
}): { participants: Participant[]; bracket: Bracket; results: MatchResult[] } | null
```

`participants` の表示名は呼び出し側（repository）が `Participant.memberId` から `Member.name` を
join して解決し、解決済みの形で渡す。`fromDivision` 自体は DB を知らない純粋関数に保つ。

`null` を返す条件:

* `format` が `SINGLE_ELIMINATION` 以外
* `matchingConfig.matches` が空
* スロットに `loserOf` が含まれる
* `bracket` が `"winners"` 以外の試合が含まれる

変換規則:

* `SlotSource.entry` の `entryId` → `DivisionEntry.participantId` → 入力の `participants` から引く。
* 出力する `Participant.seed` には `DivisionEntry.seed`（部門内シード）を使う。
  `Participant.seed`（大会全体の初期シード）ではない。部門ごとにシードは組み直されるため、
  入力の `participants` には seed を持たせず、取り違えが起きない形にする。
* `entries` に無い `participantId` は描画に使わない。出力する `participants` は
  `entries` に現れるものだけに絞る。
* `winnerOf` はそのまま `winnerOf` へ。
* `MatchResultRecord.winnerEntryId` が `null`（引き分け）の場合、`SINGLE_ELIMINATION` では
  起こらない想定だが、来たらその試合の結果を捨てて未決として扱う（`MatchResult` を作らない）。

`null` のとき詳細ページは、理由に応じて「組み合わせが未作成です」または
「この形式のブラケット表示はまだ対応していません」と案内する。

Json のパースは既存の `parseDivisionEntries` / `parseMatchingConfig` / `parseDivisionResults` を使う。
`DivisionJsonError` は詳細ページで捕捉し、描画の代わりに「データの形式が不正です」を出す。
ページ全体を落とさない。

## 削除

`DeleteTournamentForm` と同じ形にする。部門は `entries` / `matchingConfig` / `results` を抱えており、
削除すると結果記録ごと失われるため、重さは大会と大差ない。

* 確認のため部門名を入力させる。
* クライアント側の一致判定はボタンの活性のみに使う。境界はハンドラで、DB から引いた
  `division.name` と突き合わせる。
* 削除後は大会詳細へ戻す。

## エラー

```ts
UnexpectedDivisionError   予期しない失敗
DivisionOrderConflictError  order の unique 衝突（P2002）
```

`messages.ts` は `Match.exhaustive` で畳む。タグを足して文言を書き忘れるとコンパイルエラーになる。

## テスト

既存に倣い vitest。各層に置く。

* `schema` — 名前の空・長さ、`format` の不正値
* `reorder/domain` — 端の扱い、入れ替え対象の選定
* `usecase` — ポートをスタブして分岐
* `handler` — `requireOrganization` / repository / `next/navigation` をモックし、
  0 件更新で `notFound()`、成功で `revalidatePath` と `redirect`
* `repository` — `where` に所有条件が入っていること
* `from-division` — 変換規則と `null` を返す 4 条件
* コンポーネント — Testing Library で表示と `disabled` の判定

## 実装方針

AGENTS.md に従い、worktree を切って sub-agent で実装する。
