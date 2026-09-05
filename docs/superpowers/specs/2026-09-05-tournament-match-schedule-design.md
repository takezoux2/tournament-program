# 大会 試合一覧（進行順）設計

2026-09-05

## 目的

- 大会配下の全部門の試合を横断した「試合一覧」画面を追加する。
- 一覧の並び（当日の進行順）をドラッグ & ドロップで入れ替えられるようにする。
- 「----- 午前の部 -----」のような区切り行（Divider）を任意の位置に挿入できるようにする。
  Divider は見出しラベルと開始予定時刻を持つ。

## 非目標

- ブラケット（`Division.matchingConfig` の構造）は一切変更しない。進行順は表示・運営上の
  並びであり、組み合わせの木には影響しない。
- 既存の試合番号（`BracketMatch.matchNumber`）の採番規則は変更しない。進行順と試合番号は
  別物として保持する（承認済みの仕様）。一覧には両方を表示する。

## 画面

- URL: `/orgs/[slug]/tournaments/[tournamentId]/matches`（「試合一覧」）。
- 大会ページ（`/orgs/[slug]/tournaments/[tournamentId]`）から導線を張る。
- 対象は大会配下の全部門の `matchingConfig.matches`。試合形式では絞らない。
  組み合わせ未生成の部門は何も出さない。現状 `matchingConfig` を生成するのは
  `SINGLE_ELIMINATION` だけなので実質そこに限られるが、形式で分岐はしない。
- 行の表示内容
  - 試合行: 部門名 / 試合番号 / 構造上の位置（「1 回戦 第 1 試合」）/ 対戦カード
    （「山田 vs 第 3 試合の勝者」）。
  - 区切り行: ラベルと開始予定時刻。インラインで編集・削除できる。

## データモデル

進行順は新規テーブル `ScheduleItem` に持つ（承認済みの仕様）。

```prisma
enum ScheduleItemKind {
  MATCH
  DIVIDER
}

/// 大会の進行順。1 行が「試合」か「区切り」のどちらかを表す。
model ScheduleItem {
  id           String           @id @default(uuid())
  tournamentId String
  /// 進行順。0 始まりの連番。並べ替え・挿入・削除のたびに全行を振り直す。
  order        Int
  kind         ScheduleItemKind
  /// MATCH のとき: 参照先の部門。DIVIDER のとき null。
  divisionId   String?
  /// MATCH のとき: Division.matchingConfig 内の BracketMatch.id。DIVIDER のとき null。
  matchId      String?
  /// DIVIDER のとき: 見出し。MATCH のとき null。
  label        String?
  /// DIVIDER のとき: 開始予定時刻。未設定は null。MATCH のとき null。
  startsAt     DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  division   Division?  @relation(fields: [divisionId], references: [id], onDelete: Cascade)

  @@unique([tournamentId, order])
  @@unique([tournamentId, divisionId, matchId])
  @@index([tournamentId])
  @@index([divisionId])
}
```

- `@@unique([tournamentId, divisionId, matchId])` は同じ試合が二重に並ぶのを防ぐ。
  PostgreSQL の一意制約は NULL 同士を相異なるものとして扱うため、
  `divisionId` / `matchId` がともに NULL になる DIVIDER 行は何行あっても衝突しない。
- `Tournament` に `scheduleItems ScheduleItem[]`、`Division` に
  `scheduleItems ScheduleItem[]` の逆リレーションを追加する。
- kind に依存して使う列が変わる（行の多相化）。整合はコード側の責務になる。
  `src/features/schedule/parse.ts` の `parseScheduleItem(row)` が行を判別可能ユニオン
  `{ kind: "match"; id; divisionId; matchId } | { kind: "divider"; id; label; startsAt }`
  に直し、kind と列の組み合わせが壊れている行（例: MATCH なのに `matchId` が null）は
  落とす。落とした行は次の保存で消える。

## 読み取り — マージ規則

試合の実体は `Division.matchingConfig`（JSON）の中にあり、`ScheduleItem` は文字列 id で
それを指すだけなので、行と実体がずれる経路が必ず存在する（組み合わせの再生成で
`BracketMatch.id` の集合が変わる、部門が消える、新しい部門の組み合わせが増える）。
これを純粋関数のマージで吸収し、画面が壊れないようにする。

`src/features/schedule/domain.ts`:

```ts
buildScheduleView(
  divisions: ScheduleDivision[],      // id / name / order / matchingConfig / entries
  participants: DivisionParticipant[],
  items: ScheduleItemRecord[],        // parseScheduleItem 済み
): ScheduleRowView[]
```

規則:

1. 保存済みの行を `order` 昇順に並べる。
2. 実在しない試合を指す MATCH 行は落とす。
3. 行を持たない試合を末尾に追加する。追加順は部門の `order` 昇順 → `round` 昇順 →
   `order` 昇順の決定的な順。

DB の掃除（落とした行の削除、追加した試合の行の作成）は読み取り時には行わない。
次の書き込み（並べ替え・区切りの挿入など）で全行を書き直すときに一緒に片付く。
サーバーコンポーネントの描画中に副作用を起こさないための判断である。

各行は `key` を持つ。`match:{divisionId}:{matchId}` または `divider:{id}`。
この文字列が画面とサーバの間で行を指す唯一の識別子になる。

## 書き込み — `features/schedule/` を新設

`features/schedule` は `lib/division`（下位共通層）にのみ依存し、同列の
`features/division` には依存しない。`features/bracket/from-division.ts` が
`lib/division` を参照するのと同じ向きで、既存の依存規則を守る。

### カテゴリ直下

- `repository.ts` — 所有権つきの読み出し。`listScheduleSource(organizationId, tournamentId)`
  が部門（id / name / order / matchingConfig / entries）、参加者、`ScheduleItem` 行を返す。
  所有権は `where: { tournament: { id: tournamentId, organizationId } }` のリレーション
  フィルタに入れる。
- `domain.ts` — `buildScheduleView` と、行配列を変形する純粋関数
  （`moveRow` / `insertDividerAfter` / `updateDivider` / `removeDivider`）。
- `parse.ts` — `parseScheduleItem`。
- `schedule-store.ts` — 4 スライス共通の read-modify-write。`setup-store.ts` と同じ役割で、
  次を 1 トランザクションにまとめる。
  1. 所有権つきで部門・参加者・`ScheduleItem` を読む
  2. `buildScheduleView` でマージ結果を作る
  3. スライスから渡された変形関数を適用する
  4. `deleteMany({ tournamentId })` → `createMany` で `order` を 0..n-1 に振り直す
- `errors.ts` — `ScheduleError` 群。`features/division/errors.ts` と同じ形。
- `state.ts` / `effect-to-form-state.ts` / `revalidate.ts` — `features/division` の同名
  ファイルと同じ形で用意する。

全行を消して作り直すため、`@@unique([tournamentId, order])` の退避操作（
`features/division/reorder/repository.ts` の `PARKING_ORDER` のような二段更新）は
どのスライスでも不要になる。1 大会の行数はたかだか数百で、1 操作あたり全行書き換えの
コストは許容する。

### スライス

いずれも `handler.ts` の冒頭で独立に `requireOrganization(slug)` を呼ぶ。
部門の編集スライスと同じ作法で、権限コードによる絞り込みは行わない。

- `reorder/` — 画面が並べ替え後の `key` 配列を送る。`schedule-store` の中で作った
  マージ結果の `key` 集合と、送られた配列の集合が一致するかを確かめる。一致しなければ
  `ScheduleStaleError`（「一覧が更新されています。再読み込みしてください」）を返す。
  この集合一致の確認が同時編集に対する防波堤になり、別途のリビジョン列は持たない。
  一致したら送られた順で並べ直す。区切り行の `label` / `startsAt` は既存行から引き継ぐ。
- `insert-divider/` — アンカーの `key` を受け取り、その行の直後に挿入する。空文字列を
  「先頭に挿入」の意味に使う。マージ結果に無い `key` は `ScheduleStaleError` にする。
  ラベル既定値 `"区切り"`、`startsAt` は null で挿入し、挿入後に全行を振り直す。
- `update-divider/` — 対象 `ScheduleItem.id` のラベルと開始予定時刻を更新する。
  ラベルは trim 後に空文字なら拒否、100 文字以内。開始予定時刻は `datetime-local` で
  入力し、空欄なら null（未設定）にする。対象が DIVIDER でなければ「見つからない」に倒す。
- `remove-divider/` — 対象 `ScheduleItem.id` を削除して全行を振り直す。

## 既存コードへの手当て

`src/features/division/single-elimination/view.ts` の `toMatchNumberView` が持つ
スロット表示ロジック（`slotLabel`: 「山田」「第 3 試合の勝者」「BYE」「（不明な参加者）」）を
`src/lib/division/label.ts` へ下ろす。`toMatchNumberView` と
`features/schedule/domain.ts` の両方がここを使う。`features/schedule` から
`features/division` への同列依存を作らずに済み、既存側の責務も減る。
`toMatchNumberView` の外から見た振る舞いは変えない（既存テストがそのまま通ること）。

## UI

- `src/components/schedule/ScheduleList.tsx`（クライアントコンポーネント）。
  `@dnd-kit/sortable` を新規に依存へ追加し、`SortableContext` と
  `verticalListSortingStrategy` で縦一列の並べ替えを組む。ポインタセンサーに加えて
  キーボードセンサーを入れ、マウス以外でも並べ替えられるようにする。
- ドロップ結果から送信用の `key` 配列を作る判断は
  `src/components/schedule/schedule-drag.ts` の純粋関数に切り出し、単体テストする。
  コンポーネントは呼ぶだけにする（既存 `matching-drag.ts` と同じ形）。
- 区切りの挿入は各行の右端の「区切りを挿入」ボタン（その行の直後）と、リスト先頭の
  「先頭に区切りを挿入」ボタン。挿入直後は既定ラベルなので、区切り行のインライン
  フォームでラベルと時刻を編集する。
- 各操作はそれぞれ Server Action を即時に呼ぶ（`MatchNumberList` や
  `DivisionReorderButtons` と同じ作法）。まとめて保存するモードは持たない。
- 試合が 1 件も無い場合は「まだ試合がありません」を出す。

## エラー処理

`ScheduleError` を `features/schedule/errors.ts` に定義し、`effect-to-form-state.ts` で
`DivisionFormState` 相当の `{ error: string | null }` に写す。

- `ScheduleStaleError` — 並べ替えの `key` 集合が現在のマージ結果と一致しない。
  「一覧が更新されています。再読み込みしてください」。
- `ScheduleItemNotFoundError` — 区切りの更新・削除で対象が無い、または DIVIDER でない。
- `ScheduleDataError` — `ScheduleItem` の行が壊れている等。
- 大会・組織が見つからない場合は `notFound()`（404）。「権限が無い」と「存在しない」を
  区別させないという既存方針に合わせる。

## テスト

- `features/schedule/domain.test.ts` — マージ規則（保存順の尊重、実体の無い行を落とす、
  行の無い試合を決定的な順で末尾に足す）と各変形関数。
- `features/schedule/parse.test.ts` — 壊れた行を落とすこと。
- 各スライスの `handler.test.ts` / `repository.test.ts` — 既存の部門スライスのテストと
  同じ形。所有権（他組織の大会を触れないこと）と `ScheduleStaleError` を含める。
- `components/schedule/schedule-drag.test.ts` — ドロップ結果 → `key` 配列。
- `components/schedule/ScheduleList.test.tsx` — 描画とアクション呼び出し。D&D の実操作は
  jsdom で再現しないので、判断は純粋関数側のテストで担保する。
- `app/orgs/[slug]/tournaments/[tournamentId]/matches/page.test.tsx` — 既存のページテストと
  同じ形。

## マイグレーション

- `ScheduleItem` テーブルと `ScheduleItemKind` enum を追加する新規マイグレーション。
- 既存データのバックフィルは行わない。既存の大会は行を 1 つも持たない状態から始まり、
  マージ規則 3 によって全試合が決定的な順で並ぶ。最初の並べ替えや区切りの挿入で
  行が作られる。
