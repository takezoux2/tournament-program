# 試合結果入力（勝敗）設計

2026-09-05

## 目的

- 大会の全部門の試合を進行順に並べ、各試合の勝者を選ぶだけの「結果入力」画面を追加する。
- 編集画面（`/divisions/[divisionId]/setup` のエントリー・組み合わせ、`/edit` の部門編集、
  `/matches` の進行順編集）とは別の画面として用意する。当日の運営で使うのは勝敗の入力だけで、
  編集操作が同じ画面にあると誤操作になるため。

## 非目標

- スコア（`MatchResultRecord.score`）と終了時刻（`finishedAt`）は書かない。表示する画面が無い。
  必要になったら任意項目のまま後から足せる。
- 引き分けは扱わない。`MatchResultRecord.winnerEntryId = null` は `ROUND_ROBIN` でのみ許されるが、
  現状 `matchingConfig` を生成するのは `SINGLE_ELIMINATION` だけで、`ROUND_ROBIN` の部門には
  試合が 1 つも存在しない。
- 進行順の並べ替え・区切りの編集はこの画面では行わない（`/matches` が持つ）。
- 結果入力専用の権限コードは追加しない。認可は既存の試合一覧・部門ページと同じ
  `requireOrganization` に合わせる。

## 画面

- URL: `/orgs/[slug]/tournaments/[tournamentId]/results`（「結果入力」）。
- 導線は大会詳細ページ（`/orgs/[slug]/tournaments/[tournamentId]`）の「試合一覧」ボタンの隣。
- 並びは試合一覧と同じ進行順（`buildScheduleView` の出力）。区切り行は読み取り専用の見出しとして
  出し、この画面では編集・並べ替えをしない。
- 試合行の表示: 「第N試合」バッジ / 部門名・構造上の位置（「1回戦 第1試合」）/ 選手名ボタン 2 つ。

### 行の 4 状態

| 状態 | 条件 | 見た目 | 操作 |
|---|---|---|---|
| ready | 両スロットが確定・未記録 | 両者の名前がボタン | 押した方が勝者、即保存 |
| recorded | 記録済み | 勝者側に「勝」の印、敗者側は淡色 | もう一方を押すと上書き / 「取り消し」で未入力へ戻す |
| waiting | どちらかが未確定 | 「第3試合の勝者」を淡色表示 | ボタン無効 |
| bye | 片方が BYE | 「不戦勝」表示 | ボタン無効（記録が無くても勝ち上がる） |

### 上書きと取り消し

- 勝者を変えると、その勝者が進む先の試合（下流）の記録は矛盾する。上書き時は下流の記録を
  まとめて削除する。
- 削除される下流の記録が 1 件以上あるときだけ確認ダイアログを出す（「第7試合ほか 2 件の結果も
  取り消されます」）。消えるものが無いときは無確認で即保存する。普段の入力をタップ 1 回で
  終わらせるため。
- 同じ勝者のボタンを押し直した場合は変更なしとして扱い、下流を消さない。
- 記録済みの行には「取り消し」を置く。結果を消して未入力へ戻す（下流の記録も一緒に消える。
  確認ダイアログは上書きと共通）。`setup-store.ts` が「勝敗が 1 件でもあると
  エントリー・組み合わせを編集できない」仕様なので、取り消しが無いと 1 試合の誤入力で
  その部門の組み合わせが永久に編集不能になる。取り消しはその唯一の逃げ道である。
- 保存中はその行のボタンを無効化する。エラーは行の下に文言で出す。

## アーキテクチャ

読み出し（進行順 + スロット解決）は `features/schedule`、書き込み（`Division.results`）は
`features/division` が持ち、両者を `app` のページが合成する。`features/schedule` と
`features/division` は同列なので互いに import できない。共有したい純粋ロジックは下位共通層の
`src/lib/division/` に置く（`lib/division/label.ts` と同じ向き）。

### 新規: `src/lib/division/resolve.ts`（純粋）

```ts
export type ResolvedSlot =
  | { state: "entry"; entryId: string }
  | { state: "pending" }
  | { state: "bye" };

export type ResolvedMatch = {
  slots: [ResolvedSlot, ResolvedSlot];
  /** BYE の自動勝ち上がりを含む。決まっていなければ null */
  winnerEntryId: string | null;
};

export const resolveMatchSlots = (
  config: MatchingConfig,
  results: DivisionResults,
): Map<string, ResolvedMatch>;
```

- round 昇順 → order 昇順の 1 パスで走査し、解決済みの勝者を次のラウンドへ伝播する。
  `validateMatchingConfig` が「参照先の round は自分より小さい」を保証しているので循環しない。
  未検証の入力でも止まるよう、参照先が見つからない場合は `pending` にする。
- `winnerOf` は解決済みの勝者。`loserOf` は、参照先の勝者が決まっていて、かつ勝者でない方の
  スロットが `entry` として確定しているときにその `entry`。それ以外（BYE 相手の不戦勝など）は
  `pending`。
- BYE の自動勝ち上がり: 片方が `bye` でもう一方が `entry` なら、記録が無くても勝者が決まる
  （`features/bracket/resolve-bracket.ts` と同じ意味づけ）。両方 `bye` の試合は勝者なし。
- 記録された勝者がどちらのスロットにも立っていない（データが壊れている）場合は例外を投げず、
  勝者なしとして読む。読み出しで落とさないのは `label.ts` が引けない参加者を
  「（不明な参加者）」にするのと同じ思想で、一覧が読めなくなる方が困るため。

### 新規: 下流の集合と結果の削除

- `downstreamMatchIds(matchId, config)`（`resolve.ts`）— その試合を `winnerOf` / `loserOf` で
  推移的に参照する試合の id 集合。上書き時に消す対象と、確認ダイアログに出す件数の両方が
  この 1 本から出る。
- `clearResults(results, matchIds)`（`results.ts`）— 指定した試合の記録を除いた新しい
  `DivisionResults` を返す。元の値は変更しない。

### 変更: `src/lib/division/results.ts`

- `recordMatchResult` を削除する。未使用であり、`findUniqueOrThrow({ where: { id } })` で読むため
  組織の所有権チェックを持たない。書き込み経路を所有権つきの 1 本（`record-result` スライスの
  repository）に絞る。
- `applyMatchResult` はそのまま残して再利用する。

### 読み: `features/schedule`

- `result-rows.ts`（スライスではなくカテゴリ直下の共有モジュール）に純粋関数
  `buildResultRows(rows, divisions)` を置く。`buildScheduleView` の出力をそのまま受け取り、
  区切り行は素通しし、試合行に次を足した行を返す。

```ts
export type ResultRowView =
  | { kind: "divider"; key: string; label: string; startsAt: Date | null }
  | {
      kind: "match";
      key: string;
      divisionId: string;
      divisionName: string;
      matchId: string;
      matchNumber: string;
      label: string;
      slots: [ResultSlotView, ResultSlotView];
      winnerEntryId: string | null;
      state: "ready" | "recorded" | "waiting" | "bye";
      /** 上書き・取り消しで消える下流の記録の件数。0 なら確認を出さない */
      downstreamRecordedCount: number;
    };

export type ResultSlotView = {
  /** 確定なら参加者名、未確定なら「第3試合の勝者」、BYE なら "BYE" */
  label: string;
  /** 確定しているときだけ入る */
  entryId: string | null;
};
```

- `repository.ts` の `loadDivisions` の select に `results` を足し、`ScheduleDivision` に
  パース済みの `results` を持たせる。`buildScheduleView` はこの項目を使わない。
- ページから呼ぶ読み出しとして `loadResultRows(organizationId, tournamentId)` を公開する。
- 既存の `ScheduleRowView` は変更しない。試合一覧の対戦カード（`card`）は構造上の表記
  （「山田 vs 第3試合の勝者」）のままとし、結果入力画面だけが解決後の名前を出す。

### 書き: `features/division/record-result/` スライス

- `schema.ts` — `divisionId` / `matchId` / `winnerEntryId`（取り消しは空文字で送り、
  「記録を消す」意味にする）。
- `repository.ts` — 1 トランザクションで次を行う。
  1. 所有権つきの読み出し: `findFirst({ where: { id: divisionId, tournament: { id: tournamentId, organizationId } } })`。
     0 件は `{ found: false }` としてハンドラで `notFound()` に倒す。
  2. Json をパースし、`matchId` が `matchingConfig` にあることを確認（無ければ
     `DivisionMatchNotFoundError`）。
  3. 記録の場合: `resolveMatchSlots` で今その試合に立っている確定スロットを求め、
     `winnerEntryId` がそのどちらかであることを確認する（違えば
     `DivisionSlotNotDecidedError`）。画面ではボタンを無効にしているが、Server Action は
     ページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  4. 勝者が変わる場合（取り消しを含む）は `downstreamMatchIds` の記録を `clearResults` で消す。
     同じ勝者の押し直しは変更なしとして下流を残す。
  5. `applyMatchResult`（取り消しのときは対象自身も `clearResults`）→ `validateResults` で
     反映後の全体を検証 → `updateMany({ where: { id, revision }, data: { results, revision: revision + 1 } })`。
     0 件は `DivisionRevisionConflictError`。
- `usecase.ts` / `handler.ts` — 既存スライスに倣う。ハンドラは `requireOrganization(slug)` を
  冒頭で独立に呼び、`Effect.runPromiseExit` の失敗を `divisionErrorFormState` で文言に変える。
- 共有ストア（`setup-store.ts` 相当）は作らない。この read-modify-write を使うスライスは
  1 つだけで、切り出しても使い回す相手がいない。

### エラーの追加

- `DivisionRevisionConflictError` — 楽観ロックの競合。文言は
  「他の人が更新しました。画面を再読み込みしてください」。
- `DivisionSlotNotDecidedError` — 対戦相手がまだ決まっていない試合への入力。文言は
  「対戦相手がまだ決まっていません。画面を再読み込みしてください」。
- どちらも `errors.ts` の union と対照表、`messages.ts` の `Match.exhaustive` に追加する
  （書き忘れはコンパイルエラーになる）。

### 再検証

`features/division/revalidate.ts` に `revalidateDivisionResults(slug, tournamentId, divisionId)` を
足し、結果入力ページ・試合一覧・部門詳細（ブラケット表示）の 3 本を再検証する。

### 画面のファイル

- `app/orgs/[slug]/tournaments/[tournamentId]/results/page.tsx` — `requireOrganization` →
  大会の存在確認 → `loadResultRows` → コンポーネントに Server Action を渡す。
- `src/components/result/MatchResultList.tsx` / `MatchResultRow.tsx`（クライアント）。
  `useActionState` + `useTransition` の使い方は `ScheduleList` に倣う。

## テスト

TDD で進める。

- `lib/division/resolve.test.ts` — `winnerOf` の伝播 / BYE の自動勝ち上がり / 未確定 /
  `loserOf` / 到達しない勝者が記録された壊れたデータ / `downstreamMatchIds` の推移的な収集。
- `lib/division/results.test.ts` — `clearResults`。`recordMatchResult` のテストは削除する。
- `features/schedule/result-rows.test.ts` — 4 状態の判定、下流の記録件数、区切り行の素通し。
- `features/schedule/repository.test.ts` / `domain.test.ts` — `results` 追加に伴う調整。
- `features/division/record-result/` — schema / repository（トランザクションをモック）/
  usecase / handler。
- `components/result/MatchResultList.test.tsx` — 押した側が勝者として送られる、保存中の無効化、
  下流があるときだけ確認が出る、取り消しの送信内容。
- `app/orgs/[slug]/tournaments/[tournamentId]/results/page.test.tsx` — 既存のページテストに倣う。

最後に `pnpm test` / `pnpm typecheck` / `pnpm lint` を通す。
