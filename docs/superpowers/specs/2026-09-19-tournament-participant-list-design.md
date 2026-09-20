# 大会の参加者一覧 設計

## 背景

参加者（`Participant`）は大会単位のマスタだが、これを作る経路は部門のエントリー追加
（`src/features/division/add-entry/`）しか無い。逆にエントリーの削除
（`src/features/division/remove-entry/`）は `Division.entries` の Json から要素を外すだけで
`Participant` 行を消さないため、**どの部門にも居ないのに大会には残っている参加者**が溜まる。
運営者がこれを一覧する画面も、消す手段も無い。

公開側には `/t/[tournamentId]/participants`（`src/app/t/[tournamentId]/participants/page.tsx`）が
あるが、番号・氏名・所属だけで、その人がどの部門に出るのかが分からない。

選手番号の編集（`src/features/division/set-player-number/`）は `features/division` に置かれているが、
repository 自身のコメントが「選手番号は Participant（大会単位）の属性で Division の Json ではない」と
書いているとおり、責務としては部門ではなく参加者のものである。

## ゴール

- 管理画面に大会単位の参加者一覧を新設し、氏名・かな・所属・選手番号・出場部門を一覧できる。
- その画面から選手番号を直せる（既存の重複確認フローをそのまま使う）。
- その画面から大会に参加者を直接追加できる（部門を経由しない）。
- その画面から参加者を削除できる。ただしどこかの部門にエントリー済みなら拒否し、部門名を示す。
- 公開側の参加者一覧に出場部門を表示する。

呼称は管理・公開とも「参加者一覧」に統一する（「選手一覧」という語は使わない）。
ただし `Participant.playerNumber` の UI 上のラベルは既存どおり「選手番号」のままとする。

## 画面

| | パス | 見出し・パンくず |
| --- | --- | --- |
| 管理（新設） | `/orgs/[slug]/tournaments/[tournamentId]/participants` | 参加者一覧 |
| 公開（既存を拡張） | `/t/[tournamentId]/participants` | 参加者一覧（変更なし） |

管理側の大会詳細（`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`）の
「試合一覧 / 結果入力 / 公開ページを開く」の並びに「参加者一覧」リンクを追加する。
公開側の導線（大会トップの 2 列グリッド）は変更しない。

## データ・ドメイン

新しいカラムは追加しない（マイグレーション不要）。

出場部門は `Division.entries`（Json）から導出する。`DivisionEntry.participantId` が
その参加者を指す部門を、`Division.order` 昇順で集める。

## 新カテゴリ `src/features/participant/`

`Participant` エンティティを持つ新しい機能カテゴリを作る。兄弟スライス間の import は禁止、
共有物はカテゴリ直下に置くという既存の規約に従う。

```
src/features/participant/
  repository.ts            一覧（出場部門つき）
  errors.ts                ParticipantError とその写像
  messages.ts              エラー → 表示文言
  effect-to-form-state.ts  Cause → ParticipantFormState
  state.ts                 ParticipantFormState / ParticipantFormAction
  revalidate.ts            再検証すべきパスの集約
  add/                     大会に直接追加
  remove/                  参加者の削除
  set-player-number/       features/division から移設
```

### `repository.ts`

```ts
export type ParticipantDivision = { id: string; name: string };

export type TournamentParticipant = {
  id: string;
  name: string;
  nameKana: string;
  playerNumber: string;
  team?: string;
  /** 出場部門。Division.order 昇順。どの部門にも居なければ空配列。 */
  divisions: ParticipantDivision[];
};

export const listParticipantsWithDivisions = (
  organizationId: string,
  tournamentId: string,
): Promise<TournamentParticipant[]>;
```

- `participant.findMany` の `where` は既存 `listParticipantsInTournament` と同じく
  `{ tournament: { id: tournamentId, organizationId } }` とし、組織と大会の所有権を 1 クエリで担保する。
- `division.findMany` で `{ id, name, order, entries }` を `order` 昇順に読み、
  `@/lib/division/parse` の `parseDivisionEntries` で検証してから
  `participantId → ParticipantDivision[]` の Map を組む。
  `lib/` は下位の共通層なので、同列スライスへの依存にはならない。
- `parseDivisionEntries` が `DivisionJsonError` を投げた部門は、エントリー無しとして
  読み飛ばす。この一覧の主題は参加者の名簿で、出場部門はその補足である。
  1 部門の Json が壊れただけで名簿ごと 500 にするのは釣り合わない
  （`features/schedule/repository.ts` が `resultConfig` を既定値で描くのと同じ判断）。
- 並びは `playerNumber` の自然順（`Intl.Collator("ja", { numeric: true })`）で返す。
  現在この並べ替えは `PublicParticipantList` の中にあるが、管理側でも同じ並びが要るため
  repository の責務に移す。

既存の `listParticipantsInTournament`（`src/features/division/repository.ts`）は
ブラケット描画とエントリー一覧が使い続けるので**残す**。出場部門を要らない呼び出しに
Division 全件の読み出しを負わせない。

### `state.ts`

```ts
export type ParticipantFormState = {
  error: string | null;
  /** 選手番号の重複確認待ち。value を confirmedNumber として再送する。 */
  confirm?: { message: string; value: string };
};
```

`DivisionFormState` の `notice` / `succeeded` は参加者側のどのスライスも返さないので持たない。

### `errors.ts`

| エラー | 意味 |
| --- | --- |
| `ParticipantNotFoundError` | その組織のその大会に対象の参加者が居ない |
| `ParticipantDuplicateError` | 同じ大会に同じメンバーの参加者が既に居る |
| `ParticipantMemberNotFoundError` | 指定したメンバーがその組織に居ない |
| `ParticipantEnteredError` | 部門にエントリー済みで削除できない（`divisionNames: readonly string[]` を持つ） |
| `ParticipantDataError` | 削除の判定中に `Division.entries` の Json が壊れていた |
| `UnexpectedParticipantError` | それ以外 |

`messages.ts` は `ParticipantEnteredError` を
`「{部門名, 部門名} にエントリー中です。先に部門の編集画面から外してください」`
と組み立てる。他は既存 `features/member/messages.ts` と同じ形。

### `revalidate.ts`

```ts
/** 参加者を足した・消したあと。 */
export const revalidateParticipants = (
  slug: string, tournamentId: string,
): void;

/**
 * 選手番号を変えたあと。番号は大会内で共通で、どの部門のエントリー一覧にも
 * No. として出るため、その大会の全部門の編集画面を再検証する。
 */
export const revalidatePlayerNumber = (
  slug: string, tournamentId: string, divisionIds: readonly string[],
): void;
```

`revalidateParticipants` は `/orgs/${slug}/tournaments/${tournamentId}/participants` と
`/t/${tournamentId}/participants` を叩く。`revalidatePlayerNumber` はそれに加えて、
渡された部門ごとに `""` / `/setup` / `/league` を叩く
（`features/division/revalidate.ts` の `revalidateDivisionSetup` と同じ 3 本。
兄弟カテゴリなので import はできず、ここに書き写す）。

部門 id は `set-player-number` の repository が更新と同じトランザクションで読んで返す。
編集がどの画面から来たかを画面側に申告させる形にすると、参加者一覧からの編集では
部門が分からず、部門の編集画面からの編集でも他の部門が古いままになる。

### `add/`

- `schema.ts` — `mode` による `discriminatedUnion`。`existing` は `memberId`、
  `new` は `name` / `nameKana`（trim・1〜100 文字）。
  `features/division/add-entry/schema.ts` と同じ形を独立に持つ（兄弟カテゴリのため共有しない）。
- `repository.ts` — 1 トランザクションで:
  1. `tournament.findFirst({ where: { id, organizationId } })`。無ければ `{ found: false }`。
  2. `mode === "new"` なら `member.create`、`existing` なら
     `member.findFirst({ where: { id: memberId, organizationId } })`。
     取ってから所属を確かめる形にせず `where` に入れる。見つからなければ
     `ParticipantMemberNotFoundError`。
  3. `participant.findFirst({ where: { tournamentId, memberId } })` が居れば
     `ParticipantDuplicateError`。
  4. `participant.create`。`seed` は付けない（`@@unique([tournamentId, seed])` と衝突するため。
     Postgres は NULL の重複を許す）。`playerNumber` は下記の採番。
- `handler.ts` — `requirePermission(slug, "tournament.edit")` →
  zod 検証 → `Effect.runPromiseExit` → 失敗は `participantErrorFormState`、
  `found: false` は `notFound()` → `revalidateParticipants`。

部門の `entries` には一切触れない。追加された参加者は「どの部門にも居ない」状態で始まる。

### `remove/`

- `schema.ts` — `{ participantId: string }`。
- `repository.ts` — 1 トランザクションで:
  1. `participant.findFirst({ where: { id, tournament: { id: tournamentId, organizationId } } })`。
     無ければ `ParticipantNotFoundError`。
  2. その大会の全 `Division` を `{ id, name, order, entries }` で `order` 昇順に読み、
     `parseDivisionEntries` で検証。`participantId` を含む部門が 1 つでもあれば
     `ParticipantEnteredError({ divisionNames })` を投げる。
     ここでは一覧と違い、`DivisionJsonError` を読み飛ばさず `ParticipantDataError` に
     写して削除を止める。読み飛ばすと「壊れた部門にエントリー済みの参加者」を
     消せてしまい、検査そのものが素通りする。
  3. `participant.delete`。
- `Member` は消さない。`Member` は組織のマスタで、`Participant.member` は `onDelete: Restrict`。
  大会から外れただけの人を組織から消すのは別の操作（`/orgs/[slug]/members`）である。
- `handler.ts` — `requirePermission(slug, "tournament.edit")` →
  zod 検証 → 実行 → `revalidateParticipants`。

一覧側でも出場部門がある行の削除ボタンは無効にするが、**境界は Server Action のこの検査**である。
一覧を描いてから送信するまでの間にエントリーが増える経路（別の運営者の操作）が実在する。

### `set-player-number/`（移設）

`src/features/division/set-player-number/` を `src/features/participant/set-player-number/` へ移す。
移設にともなう変更は次の 3 点だけで、重複確認フローの挙動は変えない。

1. Port が受け取る id を `DivisionIds`（`{ organizationId, tournamentId, divisionId }`）から
   `ParticipantIds`（`{ organizationId, tournamentId }`）へ狭める。repository は元々
   `divisionId` を使っておらず、revalidate のためだけに運ばれていた。
2. 戻り値から `DivisionSetupOutcome<T>` の包みを外し、
   `SetPlayerNumberResult = { updated: false } | { updated: true; divisionIds: string[] }`
   を直接返す。この repository は対象が無ければ `ParticipantNotFoundError` を投げるので
   `found: false` を返す経路が無く、包むと実行されない分岐が残る。
   `divisionIds` は更新が確定したときだけ、同じトランザクションで読んで返す。
3. `handler.ts` は `divisionId` を FormData から読まない。再検証の範囲は
   repository が返す `divisionIds` が決める。
4. 権限を `requireOrganization` から `requirePermission(slug, "tournament.edit")` へ
   締める（下の「権限」を参照）。

`features/division` 側に残る `DivisionParticipantNotFoundError` は、この移設で
`features/division/errors.ts` の `DivisionError` 合併から外す（他に投げる箇所が無いため）。
`messages.ts` の対応行と網羅性テストも合わせて外す。

## `src/lib/participant/player-number.ts`（新規・共有）

```ts
/**
 * 次の選手番号。10 進整数として読める番号の最大値 + 1。
 * 手入力の "A-1" のような番号は序数を持たないので最大値の計算から外す。
 */
export const nextPlayerNumber = (existing: readonly string[]): string;
```

このルールは現在 `src/features/division/add-entry/repository.ts` の中に閉じている。
大会に直接追加する経路が増えると同じ規則が 2 箇所に要るが、`features` 同士は依存できないため、
純粋関数として下位共通層 `lib/` に括り出し、両方の repository が自分のクエリで集めた
`playerNumber` の配列を渡す形にする。`add-entry` 側の `nextPlayerNumber` はこれを呼ぶよう書き換える。

## UI

### `src/components/participant/PlayerNumberForm.tsx`（移設）

`src/components/division/PlayerNumberForm.tsx` を移す。変更点:

- `action` の型を `DivisionFormAction` から `ParticipantFormAction` へ。
- `divisionId` の prop と hidden input を落とす。再検証の範囲はサーバ側が決めるので、
  画面が編集元の部門を申告する必要がない。

`EntryList`（`src/components/division/EntryList.tsx`）は移設先から import する。
`action` は元々 props 渡しなので、配線の差し替えだけで済む。
`EntryList` の `setPlayerNumberAction` prop の型も `ParticipantFormAction` になる。

### `src/components/participant/ParticipantList.tsx`（新規・サーバーコンポーネント）

行ごとに以下を出す。

- `No.{playerNumber}` のバッジ、氏名、かな、所属（`team` があるとき）
- 出場部門名のバッジ列。空なら「出場部門なし」を淡色で出す
- `canEdit` のとき `PlayerNumberForm`
- `canEdit` のとき削除ボタン。`divisions.length > 0` の行は `disabled` にし、
  `title` に理由（部門名）を出す

削除は既存の `src/components/ui/ConfirmDialog.tsx` を使う
（`src/components/participant/RemoveParticipantButton.tsx` として `useActionState` と組み合わせる）。
文言: タイトル「参加者を削除」、本文「「{氏名}」を大会から削除しますか？組織のメンバーは残ります。」、
確定「削除する」。

0 件のときは「まだ参加者がいません」を出す。

### `src/components/participant/AddParticipantForm.tsx`（新規・クライアントコンポーネント）

`src/components/division/AddEntryForm.tsx` と同じ作り。既存メンバーから選ぶ／新しく登録する の
ラジオで `mode` を切り替え、組織のメンバーが 0 人なら「新しく登録」だけを見せる。
hidden に `slug` / `tournamentId`。見出しは「参加者を追加」。

### 管理画面ページ

`src/app/orgs/[slug]/tournaments/[tournamentId]/participants/page.tsx`

1. `requireOrganization(slug)` — 閲覧は大会詳細と同じく組織メンバーであれば可。
2. `findTournamentInOrganization`。無ければ `notFound()`。
3. `listParticipantsWithDivisions` と `listMembersInOrganization` を並行で読む。
4. `canByCode(ability, "tournament.edit")` で追加フォームと削除ボタンの表示を決める。
   UI の出し分けは体感のためで、境界は各 Server Action の `requirePermission`。

パンくずは `組織 / {組織名} / {大会名} / 参加者一覧`（大会名は大会詳細へのリンク）。

### 公開ページ

`src/app/t/[tournamentId]/participants/page.tsx` の読み出しを
`listParticipantsWithDivisions` に差し替える。公開ゲート（`findPublicTournament`）は変更しない。

`src/components/public/PublicParticipantList.tsx` は `TournamentParticipant[]` を受け取り、
各行に出場部門名を出す。並べ替えは repository へ移るのでコンポーネントからは削除し、
受け取った順に描画する。出場部門が空の行は部門を出さない（公開側では「出場部門なし」と
書き立てない。準備中の大会で未エントリーの参加者を晒す意味がない）。

## 権限

| 操作 | ガード |
| --- | --- |
| 管理画面の閲覧 | `requireOrganization(slug)` |
| 追加 | `requirePermission(slug, "tournament.edit")` |
| 削除 | `requirePermission(slug, "tournament.edit")` |
| 選手番号の変更 | `requirePermission(slug, "tournament.edit")` |

選手番号の変更は移設前は `requireOrganization` のみだった。同じ画面で追加・削除と
並び、3 つとも 1 つの `canEdit`（= `tournament.edit`）で出し分けている以上、
番号だけ組織メンバーなら誰でも通るのは画面が示す境界と食い違う。権限を持たない
メンバーが読み取り専用の画面から Server Action を直接叩いて、公開中の大会の番号を
書き換えられてしまう。締めた結果、部門の編集画面からの番号変更にも同じ権限が要る。

既存の `add-entry` は組織メンバーなら誰でも叩ける（`requireOrganization` のみ）ため、
参加者の追加はそれより厳しい。揃えるなら `add-entry` 側を締める別作業になるが、
許可が増える方向には倒れないので今回はこのままとする。

## テスト

- `lib/participant/player-number.test.ts` — 空配列は "1"、非数値番号の無視、最大値 + 1。
- `features/participant/repository.test.ts` — 出場部門のマッピング（複数部門、未エントリー、
  壊れた Json の部門を読み飛ばしても他の行は出ること）、`where` に organizationId と
  tournamentId が入ること、番号の自然順（"10" が "2" の後に来る）。
- `features/participant/add/` — schema（mode ごとの必須項目）、repository（重複・他組織の
  memberId・採番）、handler（権限なしで `notFound`、エラー状態、revalidate）。
- `features/participant/remove/` — repository（エントリー済みで拒否し部門名を返す、
  未エントリーなら削除、Member を消さない、壊れた Json では削除せず
  `ParticipantDataError`）、handler。
- `features/participant/set-player-number/` — 移設前のテストを移し、`tournament.edit` を
  要求すること、更新が確定したときだけ部門 id を読んで返すこと、全部門が再検証の
  対象になることを足す。
- `features/division/errors.test.ts` / `messages.test.ts` — `DivisionParticipantNotFoundError`
  を外した分の更新。
- コンポーネント — `ParticipantList`（出場部門の表示、エントリー済み行の削除ボタンが disabled、
  `canEdit` による出し分け）、`AddParticipantForm`（メンバー 0 人のとき新規のみ）、
  `PublicParticipantList`（出場部門の表示、出場部門が空の行）。
- ページ — 管理画面の `page.test.tsx`（`notFound` の経路、権限による出し分け）と
  公開ページの `page.test.tsx` の更新。

## スコープ外

- `Participant.team` の編集 UI。現状どの画面からも設定されない項目なので、表示のみに留める。
- `Participant.seed` の編集。
- CSV などの一括取り込み。
- 参加者一覧からの部門への一括エントリー。
- `add-entry` の権限を `tournament.edit` に締めること。
