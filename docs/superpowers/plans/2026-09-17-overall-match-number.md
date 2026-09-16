# 試合番号を大会全体の通し番号に一本化する Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合番号を大会の進行順の通し番号 `{{OverallSeq}}` だけにする。部門内の実施順（`BracketMatch.sequence`）と部門内の並べ替え（`reorder-matches`）を撤去し、試合名を出す全画面で展開済みの名前を表示する。あわせて `main`（リーグの結果表）を取り込み、元の計画の残り（Task 6〜9）を改訂に合わせて仕上げる。

**Architecture:** 通し番号は `lib/division/overall-order.ts` の `buildOverallSeq` が進行順（`ScheduleItem`）から毎回算出し、行を持たない試合は部門 `order` → 部門内の `matches` 配列の順（`parseMatchingConfig` が round → order に揃えた順）で末尾に付く。試合名は mustache のテンプレートで、`lib/division/match-name.ts` の `renderMatchName` / `resolveMatchNames` が `{{OverallSeq}}` だけを渡して展開する。画面は大会全体を読んで展開済みの文字列を受け取り（部門の画面は `listOverallOrderSources`、進行順と結果入力は `features/schedule` の読み出し）、スロットの文言（「◯◯の勝者」）も展開済みの名前から作る。構造上の位置 `matchPositionLabel` は番号と紛れない `N回戦 (M)` にし、リーグでは出さない。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Prisma 7 / Effect / Zod v4 / Vitest + Testing Library / Tailwind v4 / Biome / mustache

**設計書:**
- [試合番号を大会全体の通し番号に一本化する 設計](../specs/2026-09-17-overall-match-number-design.md)（**優先**）
- [試合名のテンプレート化 設計](../specs/2026-09-09-match-name-template-design.md)（改訂に書かれていない事項）
- 元の計画: [試合名のテンプレート化 Implementation Plan](2026-09-09-match-name-template.md)（Task 1〜5 はこのブランチにコミット済み。Task 6〜9 は本計画の Task 2・7〜10 に置き換える）

## Global Constraints

- 作業ブランチは `feat/match-name-template`、作業ツリーは `.claude/worktrees/match-name-template`。
- パッケージマネージャは **pnpm**。`pnpm add` / `pnpm exec` を使う（npm / yarn は使わない）。
- 単体テストは `pnpm exec vitest run <path>`、全体は `pnpm test`。型検査は `pnpm exec tsc --noEmit`（`pnpm typecheck` と同じ）。lint は `pnpm lint`。
- **ワークツリーの準備**（欠けると型検査が落ちる）: メインのチェックアウトの `.env` があること、`pnpm install` 済みであること、`pnpm exec next typegen` を実行済みであること（`PageProps` 型が生成される）。
- **Biome の CRLF ノイズ**: Windows チェックアウトは CRLF で、`pnpm lint` が触っていないファイルにも改行由来のエラーを出す。lint の合否は自分が書いた内容で判断し、CRLF だけの指摘は無視する。自分が触ったファイルは `pnpm exec biome check --write <path>` で整形してよい。
- **git はコマンド 1 つにつき 1 回の呼び出し**で実行する（`&&` でつながない）。コミットメッセージは `-m` を複数渡して段落に分け、最後の `-m` を必ず `"Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"` にする。
- 試合名で使える変数は **`{{OverallSeq}}` だけ**。綴りは大文字小文字を含めてこのとおり（mustache は大小文字を区別する）。`{{DivisionSeq}}` は変数ではなく、書かれていれば mustache の既定どおり空文字に展開される。
- 既定の試合名は `"第{{OverallSeq}}試合"`（定数 `DEFAULT_MATCH_NAME`）。この文字列を実装コードにベタ書きせず、必ず定数を参照する（テストの期待値に書くのは可）。
- 試合名の一意性は要求しない。部門内で全試合が同じ文字列になるのが正常な状態。
- 旧データは移行しない。`parse` は旧 `matchNumber` と旧 `sequence` を読まずに捨てる。
- `matchPositionLabel` はトーナメントで `N回戦 (M)`（M = `order + 1`）、リーグで空文字。表示側は空文字なら区切りごと描かない。
- コメントと UI 文言は日本語。既存ファイルのコメントの粒度・語り口に合わせ、「なぜそうするか」を書く。
- 各タスクの末尾で 1 回コミットする（Task 1 はマージコミット）。

## File Structure

**削除**

| ファイル | 理由 |
|---|---|
| `src/features/division/reorder-matches/`（`domain.ts` / `domain.test.ts` / `handler.ts` / `handler.test.ts` / `repository.ts` / `repository.test.ts` / `schema.ts` / `usecase.ts`） | 部門内の並べ替えを撤去する（Task 3） |

**`main` から取り込むファイル（Task 1）**

| ファイル | 責務 |
|---|---|
| `src/features/division/round-robin/standings.ts` | リーグの勝敗込み星取表と順位表 |
| `src/components/division/LeagueResultTable.tsx` | 上の表の描画 |
| `src/components/division/DivisionMatchingView.tsx` | 形式ごとの組み合わせビューの振り分け |
| `src/features/division/format.ts`（`needsParticipants`） | 参加者一覧を引くかの判定 |

**主な変更**

| ファイル | 変更内容 | タスク |
|---|---|---|
| `round-robin/standings.ts` / `LeagueResultTable.tsx` | `matchNumber` → `matchName`、展開済みの名前を受け取る | 1, 2 |
| `features/bracket/from-division.ts` / `DivisionBracket.tsx` / `DivisionMatchingView.tsx` | 展開済みの試合名・`overallSeq` を通す | 2 |
| `app/orgs/.../divisions/[divisionId]/page.tsx` / `app/t/.../divisions/[divisionId]/page.tsx` | `listOverallOrderSources` を読んで渡す | 2 |
| `components/division/MatchOrderList.tsx` / `MatchNameRow.tsx` | ドラッグ撤去 → 位置の空文字対応 → テンプレート入力とプレビュー | 3, 5, 9 |
| `DivisionSetup.tsx` / `LeagueSetup.tsx` / `setup/page.tsx` / `league/page.tsx` | `reorderMatches` の撤去 | 3 |
| `features/division/errors.ts` / `messages.ts` | `DivisionMatchOrderError` と `DivisionMatchNumberConflictError` の削除 | 3, 7 |
| `lib/division/match-name.ts` | `DivisionSeq` の撤去、既定値の変更 | 4 |
| `lib/division/overall-order.ts` | コメント（配列の順）とテスト追加 | 4 |
| `lib/division/label.ts` | `N回戦 (M)`、リーグは空文字、`formatDivisionPosition`、`createSlotLabeler` が展開済みの名前を受け取る | 5, 8 |
| `ScheduleMatchRow.tsx` / `ScheduleList.tsx` / `PublicScheduleList.tsx` / `MatchResultRow.tsx` | 位置が空文字なら区切りごと描かない | 5 |
| `lib/division/types.ts` / `parse.ts` / `validate.ts` | `sequence` の撤去、重複ルールの撤去、既定値の補完 | 6, 7, 8 |
| `single-elimination/build.ts` / `round-robin/build.ts` | `sequence` を入れない、既定値を入れる | 6, 8 |
| `features/schedule/domain.ts` / `result-rows.ts` | `OverallSeq` だけで展開、スロット文言を展開済みの名前から作る | 4, 8 |
| `set-match-name/schema.ts` / `repository.ts` | 重複チェック撤去、100 文字・構文検査 | 7, 9 |
| `features/division/match-name-view.ts` | `template` の追加、`createSlotLabeler` の呼び出し | 8, 9 |
| `docs/code-design/architecture.md` | 取り込み時の名前修正、通し番号と試合名の節 | 1, 10 |

### タスクの順序について

依存関係から、指定の並び（取り込み → 番号の改訂 → `sequence` 撤去 → スライス撤去 → 位置の文言 → 残り）を次のように入れ替えている。どの中間状態でも型検査と全テストが通る。

1. **取り込みは名前の揃えだけ**にし、展開の配線は Task 2 に分ける。マージコミットに挙動の変更を混ぜないため。
2. **閲覧画面の配線（元 Task 6）を先に**行う。`DivisionMatchingView` がブラケットとリーグの結果表の両方の入口なので、`overallSeq` の配線を 1 回で済ませられる。
3. **`reorder-matches` の撤去を番号の改訂より前**に置く。並べ替えは `matchName` を `String(sequence + 1)` で上書きするため、既定値をテンプレートに切り替える（Task 8）より前に消えている必要がある。`sequence` の撤去（Task 6）の前に消すと、`sequence` を書き換える経路が無い状態で型から外せる。
4. **`DivisionSeq` の撤去（Task 4）と位置の文言（Task 5）を `sequence` の撤去より前**に置く。`resolveMatchNames` / `buildMatchRows` の `DivisionSeq: match.sequence + 1` と、リーグの `第${match.sequence + 1}試合` が `sequence` の最後の読み手だから。
5. **一意制約の撤廃（Task 7）を既定値の切り替え（Task 8）より前**に置く。既定値をテンプレートにすると全試合が同じ文字列になり、重複ルールが残っていると生成の保存が `validateMatchingConfig` で落ちる。
6. **既定値の切り替えとスロット文言の変更は同じタスク（Task 8）**にする。切り替えだけ先にすると「第第{{OverallSeq}}試合試合の勝者」が出る。

---

### Task 1: `main` を取り込み、`matchNumber` の残りを `matchName` に揃える

計画作成時点（`main` = `c9afd55`）で `git merge-tree --write-tree feat/match-name-template main` は**テキストの衝突なし**で終わる。壊れるのは意味の上だけで、`main` で増えたリーグの結果表まわりが旧名 `matchNumber` を使っている。取り込みと同時に名前だけを揃え、マージコミットの時点で型検査と全テストを通す。値はまだリテラルの連番なので、表示の飾り `第{…}試合` はこのタスクでは外さない（Task 2 で外す）。

**Files:**
- Merge: `main`
- Modify: `src/features/division/round-robin/standings.ts`
- Modify: `src/features/division/round-robin/standings.test.ts`
- Modify: `src/components/division/LeagueResultTable.tsx`
- Modify: `src/components/division/LeagueResultTable.test.tsx`
- Modify: `src/components/division/DivisionMatchingView.test.tsx`
- Modify: `src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`
- Modify: `docs/code-design/architecture.md`

**Interfaces:**
- Consumes: `BracketMatch.matchName`（元 Task 3）
- Produces:
  - `LeagueTableCell` の match 分岐 `{ kind: "match"; matchName: string; outcome: LeagueOutcome | null }`（`src/features/division/round-robin/standings.ts`）
  - `toLeagueTableView(config, entries, results, participants): LeagueTableView`（引数はこのタスクでは据え置き）

- [ ] **Step 1: 作業ツリーが綺麗なことを確かめる**

Run: `git status --short`
Expected: 何も出ない

- [ ] **Step 2: コミットせずに取り込む**

Run: `git merge --no-ff --no-commit main`
Expected: `Automatic merge went well; stopped before committing as requested`

> **衝突が出た場合**（計画作成後に `main` が進んだとき）。`git diff --name-only --diff-filter=U` で一覧を出し、次の規則で解く。
>
> | ファイル | 解き方 |
> |---|---|
> | `round-robin/standings.ts(.test.ts)`、`LeagueResultTable.tsx(.test.tsx)`、`DivisionMatchingView.tsx(.test.tsx)`、`features/division/format.ts(.test.ts)`、`app/orgs/.../divisions/[divisionId]/page.tsx(.test.tsx)`、`app/t/.../divisions/[divisionId]/page.tsx(.test.tsx)` | `git checkout --theirs <path>` で `main` 側を採り、Step 4 の名前揃えを当てる |
> | `set-match-name/`、`match-name-view.ts`、`lib/division/*`、`features/schedule/*`、`DivisionSetup.tsx`、`LeagueSetup.tsx`、`setup/page.tsx`、`league/page.tsx` | `git checkout --ours <path>` でブランチ側を採り、`main` 側の差分（`git diff <merge-base> main -- <path>`）を手で当て直す |
> | `package.json` / `pnpm-lock.yaml` | 両方の変更を残す（ブランチの `mustache` / `@types/mustache` を消さない）。解いたあと `pnpm install` |
> | `docs/code-design/architecture.md` | 両方の段落を残す |
>
> 解いたら `git add <path>` を 1 ファイルずつ実行する。

- [ ] **Step 3: 壊れている箇所を型検査で確かめる**

Run: `pnpm exec tsc --noEmit`
Expected: FAIL。少なくとも `src/features/division/round-robin/standings.ts`（`Property 'matchNumber' does not exist on type 'BracketMatch'`）と `standings.test.ts`（`Object literal may only specify known properties, and 'matchNumber' does not exist in type 'BracketMatch'`）でエラー。`DivisionMatchingView.test.tsx` と公開の部門ページのテストは `unknown` の Json を組み立てているので型エラーにはならないが、名前は Step 4 で揃える

- [ ] **Step 4: 名前を揃える**

識別子の置換（Git Bash で実行）:

```bash
sed -i 's/matchNumber/matchName/g' src/features/division/round-robin/standings.ts src/features/division/round-robin/standings.test.ts src/components/division/LeagueResultTable.tsx src/components/division/LeagueResultTable.test.tsx src/components/division/DivisionMatchingView.test.tsx "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"
```

日本語の文言は手で直す:

| ファイル | 変更前 | 変更後 |
|---|---|---|
| `src/components/division/LeagueResultTable.tsx`（`CellContent` の doc コメント） | `対戦済みは印を大きく、試合番号を小さく添える。` / `未実施は試合番号だけを淡色で出し、` | `対戦済みは印を大きく、試合名を小さく添える。` / `未実施は試合名だけを淡色で出し、` |
| `src/components/division/LeagueResultTable.test.tsx` | `it("未実施のマスは試合番号だけを出す"` | `it("未実施のマスは試合名だけを出す"` |
| `src/features/division/round-robin/standings.test.ts` | `it("未実施の試合は集計せず、マスには試合番号だけ残す"` | `it("未実施の試合は集計せず、マスには試合名だけ残す"` |
| `docs/code-design/architecture.md` | `` `LeagueCrossTable` は試合番号だけを出す別物で、`` | `` `LeagueCrossTable` は試合名だけを出す別物で、`` |
| `docs/code-design/architecture.md` | `` 先例は `set-match-number` と同じ形の `` | `` 先例は `set-match-name` と同じ形の `` |

`LeagueResultTable.tsx` の `第{cell.matchName}試合` はこのタスクでは**そのまま残す**（値がまだ `"1"` などのリテラル）。

- [ ] **Step 5: 型検査と全テストを通す**

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし

Run: `pnpm test`
Expected: 全件 PASS

- [ ] **Step 6: 旧名の取り残しが無いことを確かめる**

Run: `grep -rn "matchNumber\|match-number" src docs/code-design`
Expected: 何も出ない（`DivisionMatchNumberConflictError` は `MatchNumber` の綴りなのでこの grep には掛からない。Task 7 で消す）

- [ ] **Step 7: マージコミットを作る**

```bash
git add -A
```

```bash
git commit -m "Merge branch 'main' into feat/match-name-template" -m "リーグの結果表（round-robin/standings.ts・LeagueResultTable）が旧名 matchNumber を使っていたため、取り込みと同時に matchName へ揃える。展開の配線は次のコミットで行う。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 閲覧画面（ブラケット・リーグの結果表）に展開済みの試合名を通す

元の計画の Task 6 に、取り込んだリーグの結果表を加えたもの。部門詳細（管理）と公開の部門ページは `DivisionMatchingView` を通してブラケットと結果表を描くので、ページで `listOverallOrderSources` を読み、`DivisionMatchingView` → `DivisionBracket` / `LeagueSection` と `overallSeq` を渡す。

**Files:**
- Modify: `src/features/division/round-robin/standings.ts`
- Modify: `src/components/division/LeagueResultTable.tsx`
- Modify: `src/features/bracket/from-division.ts`
- Modify: `src/components/division/DivisionBracket.tsx`
- Modify: `src/components/division/DivisionMatchingView.tsx`
- Modify: `src/components/division/DivisionSetup.tsx`（プレビューの `DivisionBracket`）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx`
- Modify: `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`
- Test: `src/features/division/round-robin/standings.test.ts`、`src/components/division/LeagueResultTable.test.tsx`、`src/features/bracket/from-division.test.ts`、`src/components/division/DivisionBracket.test.tsx`、`src/components/division/DivisionMatchingView.test.tsx`、`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx`、`src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`

**Interfaces:**
- Consumes: `resolveMatchNames(config: MatchingConfig, divisionId: string, overallSeq: ReadonlyMap<string, number>): Map<string, string>`、`listOverallOrderSources(tournamentId: string): Promise<Map<string, number>>`、`overallSeqKey(divisionId: string, matchId: string): string`（いずれも元 Task 2・5）
- Produces:
  - `toLeagueTableView(config: MatchingConfig, entries: DivisionEntries, results: DivisionResults, participants: { id: string; name: string }[], matchNames: ReadonlyMap<string, string>): LeagueTableView`
  - `FromDivisionInput.matchNames: ReadonlyMap<string, string>`
  - `DivisionBracket` の props に `overallSeq: ReadonlyMap<string, number>`
  - `DivisionMatchingView` の props に `overallSeq: ReadonlyMap<string, number>`

- [ ] **Step 1: 結果表のドメインの失敗テストを書く**

`src/features/division/round-robin/standings.test.ts`:

1. `const config: MatchingConfig = {…};` の直後に追加:

```ts
/** 展開済みの名前を渡さない呼び出し。マスにはテンプレートがそのまま入る。 */
const noNames = new Map<string, string>();
```

2. ファイル内の**すべての** `toLeagueTableView(` 呼び出しに、最後の引数として `noNames` を足す。複数行の呼び出しは `participants,` の次の行に `noNames,` を足す。1 行にまとまっている 2 箇所は次のとおり:

```ts
    const view = toLeagueTableView(
      broken,
      entries,
      results([]),
      participants,
      noNames,
    );
```

```ts
    const view = toLeagueTableView(
      config,
      entries,
      results([]),
      [participants[0]],
      noNames,
    );
```

3. `describe("toLeagueTableView", …)` の末尾に追加:

```ts
  it("マスの試合名は渡された展開済みの名前を使い、無ければテンプレートのまま出す", () => {
    const view = toLeagueTableView(
      config,
      entries,
      results([]),
      participants,
      new Map([["r1-0", "第7試合"]]),
    );

    // 全員 0 点で同順位なので行・列ともシード順。e1 vs e4 が r1-0。
    expect(view.rows[0].cells[3]).toEqual({
      kind: "match",
      matchName: "第7試合",
      outcome: null,
    });
    // e1 vs e2（r1-4）は表に無いので、保存されている文字列のまま。
    expect(view.rows[0].cells[1]).toEqual({
      kind: "match",
      matchName: "5",
      outcome: null,
    });
  });
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `pnpm exec vitest run src/features/division/round-robin/standings.test.ts`
Expected: FAIL（新しいテストで `matchName: "1"` が返り、`"第7試合"` と一致しない）

- [ ] **Step 3: `toLeagueTableView` が展開済みの名前を受け取るようにする**

`src/features/division/round-robin/standings.ts` の `readMatches` を差し替える:

```ts
const readMatches = (
  config: MatchingConfig,
  results: DivisionResults,
  matchNames: ReadonlyMap<string, string>,
): PlayedMatch[] => {
  const recorded = new Map(
    results.matches.map((record) => [record.matchId, record.winnerEntryId]),
  );
  const played: PlayedMatch[] = [];
  for (const match of config.matches) {
    const [first, second] = match.slots;
    if (first.kind !== "entry" || second.kind !== "entry") {
      continue;
    }
    const winner = recorded.get(match.id);
    let outcome: LeagueOutcome | null = null;
    if (winner === null) {
      outcome = "draw";
    } else if (winner === first.entryId) {
      outcome = "win";
    } else if (winner === second.entryId) {
      outcome = "loss";
    }
    played.push({
      // 展開に失敗する経路は無いが、引けなければテンプレートをそのまま出す
      // （round-robin/view.ts の星取表と同じ倒し方）。
      matchName: matchNames.get(match.id) ?? match.matchName,
      left: first.entryId,
      right: second.entryId,
      outcome,
    });
  }
  return played;
};
```

`toLeagueTableView` の引数と `readMatches` の呼び出しを直す:

```ts
export const toLeagueTableView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  results: DivisionResults,
  participants: { id: string; name: string }[],
  /** 展開済みの試合名。{{OverallSeq}} は大会全体を見ないと決まらないので上で作って渡す */
  matchNames: ReadonlyMap<string, string>,
): LeagueTableView => {
```

```ts
  const matches = readMatches(config, results, matchNames);
```

Run: `pnpm exec vitest run src/features/division/round-robin/standings.test.ts`
Expected: PASS

- [ ] **Step 4: 結果表の描画の失敗テストを書く**

`src/components/division/LeagueResultTable.test.tsx`:

1. 先頭の `table` の 6 つの `matchName: "N"` を `matchName: "第N試合"` にする（期待値の `"○第1試合"` などはそのまま）:

```bash
sed -i -E 's/matchName: "([0-9]+)"/matchName: "第\1試合"/g' src/components/division/LeagueResultTable.test.tsx
```

2. `describe` の末尾に追加:

```tsx
  it("マスには渡された試合名をそのまま出し、飾りを足さない", () => {
    const named: LeagueTableView = {
      headers: [
        { entryId: "e1", label: "山田" },
        { entryId: "e2", label: "佐藤" },
      ],
      rows: [
        {
          entryId: "e1",
          label: "山田",
          rank: 1,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          cells: [
            { kind: "self" },
            { kind: "match", matchName: "決勝", outcome: null },
          ],
        },
        {
          entryId: "e2",
          label: "佐藤",
          rank: 1,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          cells: [
            { kind: "match", matchName: "決勝", outcome: null },
            { kind: "self" },
          ],
        },
      ],
    };
    render(<LeagueResultTable table={named} />);

    // cell[0] が順位、cell[1] が自分自身、cell[2] が佐藤との対戦。
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent(/^決勝$/);
  });
```

Run: `pnpm exec vitest run src/components/division/LeagueResultTable.test.tsx`
Expected: FAIL（新しいテストで `第決勝試合` が描かれる）

- [ ] **Step 5: 描画から飾りを外す**

`src/components/division/LeagueResultTable.tsx` の `CellContent` の match 分岐:

```tsx
    case "match": {
      // 展開は toLeagueTableView の上（DivisionMatchingView）で済んでいる。
      // 「第◯試合」の形は試合名そのものが決めるので、ここでは飾りを足さない。
      const number = (
        <span className="block text-[10px] text-slate-400">
          {cell.matchName}
        </span>
      );
```

Run: `pnpm exec vitest run src/components/division/LeagueResultTable.test.tsx`
Expected: PASS

- [ ] **Step 6: ブラケットの変換の失敗テストを書く**

`src/features/bracket/from-division.test.ts`:

1. `buildInput` の既定値に `matchNames` を足す:

```ts
const buildInput = (
  overrides: Partial<Parameters<typeof fromDivision>[0]> = {},
) => ({
  id: "d1",
  name: "男子シングルス",
  format: "SINGLE_ELIMINATION" as const,
  entries,
  matchingConfig,
  results: emptyResults,
  participants,
  matchNames: new Map<string, string>(),
  ...overrides,
});
```

2. 既存の `it("matchName を描画側の Match に写す"` の名前を `it("展開済みの名前が引けなければ保存されている試合名を写す"` に改め、その直後に追加:

```ts
  it("展開済みの試合名があればそれを Match に載せる", () => {
    const result = fromDivision(
      buildInput({ matchNames: new Map([["m1", "第9試合"]]) }),
    );

    expect(result?.bracket.matches[0].matchName).toBe("第9試合");
  });
```

Run: `pnpm exec vitest run src/features/bracket/from-division.test.ts`
Expected: FAIL（新しいテストで `"1"` が返る）

- [ ] **Step 7: `fromDivision` を書き換える**

`src/features/bracket/from-division.ts` の `FromDivisionInput`:

```ts
export type FromDivisionInput = {
  /** Division.id。Bracket.id に使う */
  id: string;
  /** Division.name。Bracket.name に使う */
  name: string;
  format: DivisionFormat;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
  results: DivisionResults;
  participants: DivisionSourceParticipant[];
  /**
   * 展開済みの試合名（試合 id → 表示名）。{{OverallSeq}} は大会全体を
   * 見ないと決まらないため、部門だけを受け取るこの関数では作れない。
   */
  matchNames: ReadonlyMap<string, string>;
};
```

`matches.push` の `matchName`:

```ts
    matches.push({
      id: source.id,
      round: source.round,
      order: source.order,
      // 引けなければテンプレートをそのまま出す。描画を止めるほどの不整合ではない。
      matchName: input.matchNames.get(source.id) ?? source.matchName,
      slots: [first, second],
    });
```

Run: `pnpm exec vitest run src/features/bracket/from-division.test.ts`
Expected: PASS

- [ ] **Step 8: `DivisionBracket` に `overallSeq` を足す**

`src/components/division/DivisionBracket.tsx` — import に追加:

```tsx
import { resolveMatchNames } from "@/lib/division/match-name";
```

props:

```tsx
export function DivisionBracket({
  division,
  participants,
  overallSeq,
  heightClassName = "h-[28rem]",
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  /** 大会全体の通し番号。試合名の {{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  /**
   * 描画枠の高さ。既定は管理画面の詳細ページ向け。公開のブラケットページは
   * ブラケット専用の画面なので、dvh 基準の高さを渡して画面を占有させる。
   * Tailwind v4 はソース中の文字列からクラスを生成するため、
   * 呼び出し側は必ず文字列リテラルで渡すこと。
   */
  heightClassName?: string;
}) {
```

`fromDivision` の呼び出し:

```tsx
  const converted = fromDivision({
    id: division.id,
    name: division.name,
    format: division.format,
    entries: parsed.entries,
    matchingConfig: parsed.matchingConfig,
    results: parsed.results,
    participants,
    matchNames: resolveMatchNames(
      parsed.matchingConfig,
      division.id,
      overallSeq,
    ),
  });
```

`src/components/division/DivisionBracket.test.tsx` — `participants` の定義の直後に `const noSeq = new Map<string, number>();` を足し、ファイル内の**すべての** `<DivisionBracket` 要素（8 箇所）の `participants={participants}` の次の行に `overallSeq={noSeq}` を足す。

`src/components/division/DivisionSetup.tsx` のプレビュー:

```tsx
        <DivisionBracket
          division={division}
          participants={participants}
          overallSeq={overallSeq}
        />
```

- [ ] **Step 9: 振り分けの入口の失敗テストを書く**

`src/components/division/DivisionMatchingView.test.tsx`:

1. 先頭の `DivisionBracket` のモックを、受け取った props を控える形に差し替える:

```tsx
import { overallSeqKey } from "@/lib/division/overall-order";

// ブラケットの組み立ては DivisionBracket.test.tsx が見る。ここでは
// 「どの形式でどれを描くか」と、何を渡したかだけを確かめる。
const bracketProps = vi.fn();
vi.mock("./DivisionBracket", () => ({
  DivisionBracket: (props: { heightClassName?: string }) => {
    bracketProps(props);
    return (
      <div data-testid="bracket">{props.heightClassName ?? "default"}</div>
    );
  },
}));
```

2. `participants` の直後に `const noSeq = new Map<string, number>();` を足し、既存の**すべての** `<DivisionMatchingView` 要素の `participants={participants}` の次の行に `overallSeq={noSeq}` を足す。

3. `describe` の末尾に追加:

```tsx
  it("SINGLE_ELIMINATION は大会全体の通し番号をブラケットへそのまま渡す", () => {
    const overallSeq = new Map([[overallSeqKey("d1", "m1-0"), 2]]);
    render(
      <DivisionMatchingView
        division={buildDivision({ format: "SINGLE_ELIMINATION" })}
        participants={participants}
        overallSeq={overallSeq}
      />,
    );

    expect(bracketProps.mock.lastCall?.[0].overallSeq).toBe(overallSeq);
  });

  it("ROUND_ROBIN のマスには大会全体の通し番号で展開した試合名を出す", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "r1-0",
                bracket: "winners",
                round: 1,
                order: 0,
                matchName: "第{{OverallSeq}}試合",
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "entry", entryId: "e2" },
                ],
              },
            ],
          },
        })}
        participants={participants}
        overallSeq={new Map([[overallSeqKey("d1", "r1-0"), 4]])}
      />,
    );

    // 星取表は左右対称なので同じ試合名が 2 マスに出る。
    expect(screen.getAllByText("第4試合")).toHaveLength(2);
  });
```

Run: `pnpm exec vitest run src/components/division/DivisionMatchingView.test.tsx`
Expected: FAIL（`overallSeq` が `undefined` で渡る／マスに `第{{OverallSeq}}試合` が出る）

- [ ] **Step 10: `DivisionMatchingView` を配線する**

`src/components/division/DivisionMatchingView.tsx` — import に追加:

```tsx
import { resolveMatchNames } from "@/lib/division/match-name";
```

`LeagueSection` の props と結果表の呼び出し:

```tsx
const LeagueSection = ({
  division,
  participants,
  overallSeq,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  overallSeq: ReadonlyMap<string, number>;
}) => {
```

```tsx
  return (
    <LeagueResultTable
      table={toLeagueTableView(
        parsed.matchingConfig,
        parsed.entries,
        parsed.results,
        participants,
        resolveMatchNames(parsed.matchingConfig, division.id, overallSeq),
      )}
    />
  );
```

`DivisionMatchingView` の props と分岐:

```tsx
export function DivisionMatchingView({
  division,
  participants,
  overallSeq,
  heightClassName,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  /** 大会全体の通し番号。試合名の {{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  heightClassName?: string;
}) {
  switch (division.format) {
    case "SINGLE_ELIMINATION":
      return (
        <DivisionBracket
          division={division}
          participants={participants}
          overallSeq={overallSeq}
          heightClassName={heightClassName}
        />
      );
    case "ROUND_ROBIN":
      return (
        <LeagueSection
          division={division}
          participants={participants}
          overallSeq={overallSeq}
        />
      );
```

（`DOUBLE_ELIMINATION_*` と `default` の分岐は変えない）

Run: `pnpm exec vitest run src/components/division/DivisionMatchingView.test.tsx src/components/division/DivisionBracket.test.tsx`
Expected: PASS

- [ ] **Step 11: 管理画面の部門詳細ページの失敗テストを書く**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx`:

1. モック用の関数の宣言に `const listOverallOrderSources = vi.fn();` を足し、`@/features/division/repository` のモックに追加:

```ts
  listOverallOrderSources: (tournamentId: string) =>
    listOverallOrderSources(tournamentId),
```

2. `DivisionMatchingView` のモックを props を控える形に差し替える:

```tsx
const matchingViewProps = vi.fn();
vi.mock("@/components/division/DivisionMatchingView", () => ({
  DivisionMatchingView: (props: unknown) => {
    matchingViewProps(props);
    return <div>matching</div>;
  },
}));
```

3. `beforeEach` に追加:

```ts
    listOverallOrderSources.mockReset();
    listOverallOrderSources.mockResolvedValue(new Map());
    matchingViewProps.mockReset();
```

4. 既存の「requireOrganization が例外を投げたら…」のテストの末尾に `expect(listOverallOrderSources).not.toHaveBeenCalled();` を足し、`describe` の末尾に追加:

```tsx
  it("大会 id で通し番号を読み、DivisionMatchingView にそのまま渡す", async () => {
    const overallSeq = new Map([["d1:m1-0", 1]]);
    listOverallOrderSources.mockResolvedValue(overallSeq);

    render(await DivisionPage(pageProps("tennis", "t1", "d1")));

    expect(listOverallOrderSources).toHaveBeenCalledWith("t1");
    const { overallSeq: passed } = matchingViewProps.mock.calls[0][0] as {
      overallSeq: unknown;
    };
    expect(passed).toBe(overallSeq);
  });
```

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx"`
Expected: FAIL（`listOverallOrderSources` が呼ばれない）

- [ ] **Step 12: 管理画面の部門詳細ページを配線する**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx`:

```tsx
import {
  findDivisionInTournament,
  listOverallOrderSources,
  listParticipantsInTournament,
} from "@/features/division/repository";
```

```tsx
  const [tournament, division, overallSeq] = await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
    // 大会 id だけで読む関数だが、所有権は requireOrganization と上の 2 つが
    // 確かめ、見つからなければ下の notFound で打ち切る。番号が画面に出るのは
    // 所有権を通ったときだけ（setup / league のページと同じ形）。
    listOverallOrderSources(tournamentId),
  ]);
```

```tsx
          <DivisionMatchingView
            division={division}
            participants={participants}
            overallSeq={overallSeq}
          />
```

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx"`
Expected: PASS

- [ ] **Step 13: 公開の部門ページの失敗テストを書く**

`src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`:

1. モック用の関数の宣言に `const listOverallOrderSources = vi.fn();` を足し、`@/features/division/repository` のモックに追加:

```ts
  listOverallOrderSources: (tournamentId: string) =>
    listOverallOrderSources(tournamentId),
```

2. import に `import { overallSeqKey } from "@/lib/division/overall-order";` を足し、`beforeEach` に追加:

```ts
    listOverallOrderSources.mockReset();
    listOverallOrderSources.mockResolvedValue(new Map());
```

3. 既存の「公開対象でなければ notFound を呼び、部門も引かない」のテストの末尾に `expect(listOverallOrderSources).not.toHaveBeenCalled();` を足し、`describe` の末尾に追加:

```tsx
  it("リーグの結果表には大会全体の通し番号で展開した試合名を出す", async () => {
    listOverallOrderSources.mockResolvedValue(
      new Map([[overallSeqKey("d1", "r1-0"), 4]]),
    );
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "ROUND_ROBIN" as const,
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "r1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "第{{OverallSeq}}試合",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
    });

    render(await Page(pageProps("t1", "d1")));

    expect(listOverallOrderSources).toHaveBeenCalledWith("t1");
    expect(screen.getAllByText("第4試合")).toHaveLength(2);
  });
```

Run: `pnpm exec vitest run "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"`
Expected: FAIL

- [ ] **Step 14: 公開の部門ページを配線する**

`src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`:

```tsx
import {
  type DivisionParticipant,
  findDivisionInTournament,
  listOverallOrderSources,
  listParticipantsInTournament,
} from "@/features/division/repository";
```

`const participants = …` を差し替える:

```tsx
  // 描画に参加者名を使わない形式では参加者一覧を引かない。
  // 管理画面の部門詳細と同じ条件を needsParticipants で共有する。
  // 通し番号は公開ゲートと部門の絞り込みを通ったあとに読む。番号は部門ではなく
  // 大会全体の進行順から作るので、大会 id で引く。
  const [participants, overallSeq] = await Promise.all([
    needsParticipants(division.format)
      ? listParticipantsInTournament(tournament.organizationId, tournament.id)
      : Promise.resolve<DivisionParticipant[]>([]),
    listOverallOrderSources(tournament.id),
  ]);
```

```tsx
        <DivisionMatchingView
          division={division}
          participants={participants}
          overallSeq={overallSeq}
          heightClassName="h-[calc(100dvh-11rem)]"
        />
```

- [ ] **Step 15: テストと型を通す**

Run: `pnpm exec vitest run src/features/division/round-robin src/features/bracket src/components/division "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx" "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"`
Expected: PASS

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし

- [ ] **Step 16: コミット**

```bash
git add -A
```

```bash
git commit -m "feat(division): ブラケットとリーグの結果表に展開済みの試合名を出す" -m "部門詳細（管理）と公開の部門ページが大会全体の通し番号を読み、DivisionMatchingView を通してブラケットのカードと結果表のマスに展開済みの試合名を渡す。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 部門内の並べ替え（`reorder-matches`）を撤去する

**Files:**
- Delete: `src/features/division/reorder-matches/`（`domain.ts`、`domain.test.ts`、`handler.ts`、`handler.test.ts`、`repository.ts`、`repository.test.ts`、`schema.ts`、`usecase.ts`）
- Modify: `src/features/division/errors.ts`、`src/features/division/messages.ts`（`DivisionMatchOrderError` の削除）
- Modify: `src/components/division/MatchOrderList.tsx`
- Modify: `src/components/division/MatchNameRow.tsx`（コメント）
- Modify: `src/components/division/DivisionSetup.tsx`、`src/components/division/LeagueSetup.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`、`.../league/page.tsx`
- Modify: `src/features/division/match-name-view.ts`（コメント）
- Modify: `src/lib/dnd/reorder.ts`、`src/components/schedule/ScheduleList.tsx`（コメント）
- Test: `src/components/division/MatchOrderList.test.tsx`、`DivisionSetup.test.tsx`、`LeagueSetup.test.tsx`、`setup/page.test.tsx`、`league/page.test.tsx`、`src/features/division/match-name-view.test.ts`

**Interfaces:**
- Consumes: `MatchNameRowView`、`MatchNameRow`
- Produces:
  - `MatchOrderList` の props: `{ rows: MatchNameRowView[]; slug: string; tournamentId: string; divisionId: string; setMatchNameAction: DivisionFormAction; emptyMessage: string }`（`reorderAction` が無くなる）
  - `DivisionSetupActions` = `{ addEntry; removeEntry; reorderEntry; generateMatching; swapSlots; setMatchName; setPlayerNumber }`（7 つ）
  - `LeagueSetupActions` = `{ addEntry; removeEntry; reorderEntry; generateMatching; setMatchName; setPlayerNumber }`（6 つ）
  - `DivisionError` から `DivisionMatchOrderError` が消える

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/MatchOrderList.test.tsx`:

1. `renderList` と「行の保存で…」テストの `<MatchOrderList` から `reorderAction={noop}` の行を削除する。
2. 「行ごとに区別できる名前のドラッグハンドルを出す」テストを丸ごと次に差し替える:

```tsx
  it("並べ替えの操作を出さない", () => {
    // 試合の順番は大会の進行順（/matches）だけが決める。部門の中で
    // 並べ替える操作を残すと、番号が変わると誤解させる。
    renderList(rows);

    expect(screen.queryByRole("button", { name: /並べ替え/ })).toBeNull();
    expect(screen.queryByText(/ドラッグ/)).toBeNull();
  });
```

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx`:

1. `vi.mock("@/features/division/reorder-matches/handler", …)` のブロックと、`const { reorderMatchesAction } = await import(…)` のブロックを削除する。
2. 「8 つの Server Action を…」のテストの名前を「7 つの Server Action を…」に、コメントの「8 つ」を「7 つ」に改め、`expect(actions.reorderMatches).toBe(reorderMatchesAction);` を次に差し替える:

```ts
    expect(actions).not.toHaveProperty("reorderMatches");
```

3. ファイル先頭付近のコメント「8 つの Server Action は…」を「7 つの Server Action は…」に改める。

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.test.tsx` — 同じ手当てをする（「7 つ」→「6 つ」）。

Run: `pnpm exec vitest run src/components/division/MatchOrderList.test.tsx "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.test.tsx"`
Expected: FAIL（「1行目 1回戦 第1試合をドラッグして並べ替え」ボタンが見つかる／`actions.reorderMatches` がある）

- [ ] **Step 2: スライスとエラー型を削除する**

Run: `git rm -r src/features/division/reorder-matches`

`src/features/division/errors.ts`:
- `/** 送られてきた並び順が現在の組み合わせと一致しないことを表す。 */` から始まる `DivisionMatchOrderError` クラスの定義を削除
- `DivisionError` union から `| DivisionMatchOrderError` を削除
- `divisionErrorTags` から `DivisionMatchOrderError: true,` を削除

`src/features/division/messages.ts`:
- `Match.tag("DivisionMatchOrderError", () => "並び順が古くなっています。画面を再読み込みしてください")` の節を削除

- [ ] **Step 3: `MatchOrderList` を試合名の編集一覧にする**

`src/components/division/MatchOrderList.tsx` を丸ごと置き換える:

```tsx
"use client";

import type { MatchNameRowView } from "@/features/division/match-name-view";
import type { DivisionFormAction } from "@/features/division/state";
import { MatchNameRow } from "./MatchNameRow";

/**
 * 部門の試合を並べた、試合名の編集一覧。1 行が 1 つの編集フォーム。
 *
 * 並べ替えの操作は持たない。試合番号は大会の進行順（/matches）の通し番号
 * {{OverallSeq}} だけで決まり、部門の中で順番を持つ意味が無くなったため。
 * 行の並びは渡された配列の順（parseMatchingConfig が揃えた順）のまま。
 *
 * トーナメントとリーグで同じ部品を使う。違いは行の中身（位置の文言）だけで、
 * それは toMatchOrderView が format を見て吸収する。
 *
 * フックを持たないが "use client" を残すのは、Server Component（DivisionSetup /
 * LeagueSetup）とクライアント部品（MatchNameRow）の境界をこれまでと同じ位置に
 * 保つため。
 */
export function MatchOrderList({
  rows,
  slug,
  tournamentId,
  divisionId,
  setMatchNameAction,
  emptyMessage,
}: {
  /** この並びがそのまま画面の並びになる。 */
  rows: MatchNameRowView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  setMatchNameAction: DivisionFormAction;
  /** 行が 1 つも無いときの文言。画面ごとに言い方が違う。 */
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        組み合わせを作り直したときと、トーナメントで 1
        回戦の組み合わせを入れ替えたときは、試合名が既定に戻ります
      </p>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.matchId}
            className="flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3"
          >
            <MatchNameRow
              row={row}
              slug={slug}
              tournamentId={tournamentId}
              divisionId={divisionId}
              action={setMatchNameAction}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/components/division/MatchNameRow.tsx` の doc コメントの 3 段落目を差し替える:

```tsx
 * <li> を返さないのは、一覧側（MatchOrderList）が行の枠を持つため。
 * 行の見た目を一覧に集めておくと、この部品は「試合名を直す口」だけに
 * 集中できる。
```

- [ ] **Step 4: セットアップ画面とページから `reorderMatches` を外す**

`src/components/division/DivisionSetup.tsx`:
- `DivisionSetupActions` から `reorderMatches: DivisionFormAction;` を削除
- `<MatchOrderList` から `reorderAction={actions.reorderMatches}` を削除
- 区画を次に差し替える:

```tsx
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">試合名</h2>
        {/* 試合名の変更は構造を変えないため、locked でも編集できる */}
        {mismatched ? (
          <Notice>組み合わせを作り直すと、ここに試合が出ます</Notice>
        ) : (
```

`src/components/division/LeagueSetup.tsx`:
- `LeagueSetupActions` から `reorderMatches: DivisionFormAction;` を削除
- `<MatchOrderList` から `reorderAction={actions.reorderMatches}` を削除
- 見出しとコメントを次に差し替える:

```tsx
        <h2 className="text-sm font-bold text-slate-700">試合名</h2>
        {/* 試合名の変更は構造を変えないため、locked でも編集できる */}
```

- `const matchNames = …` の直前のコメントの「星取表と実施順の一覧の両方が…」を「星取表と試合名の一覧の両方が…」に改める

`setup/page.tsx` と `league/page.tsx`:
- `import { reorderMatchesAction } from "@/features/division/reorder-matches/handler";` を削除
- `actions` から `reorderMatches: reorderMatchesAction,` を削除

`src/components/division/DivisionSetup.test.tsx`:
- `actions` から `reorderMatches: vi.fn(async () => ({ error: null })),` を削除し、直前のコメントの「8 つとも」を「7 つとも」に改める
- `screen.getByText("組み合わせを作り直すと、ここに試合の実施順が出ます")` を `screen.getByText("組み合わせを作り直すと、ここに試合が出ます")` に改める
- 「8 つのアクションが…」のテスト名を「7 つのアクションが…」に、本文のコメント「8 つの Server Action」を「7 つの Server Action」に改め、`expect(matchOrderListProps?.reorderAction).toBe(actions.reorderMatches);` を `expect(matchOrderListProps).not.toHaveProperty("reorderAction");` に差し替える
- コメント「実施順と試合名は構造を変えないため、locked でも編集できる。」を「試合名は構造を変えないため、locked でも編集できる。」に改める

`src/components/division/LeagueSetup.test.tsx`:
- `actions` から `reorderMatches: vi.fn(async () => ({ error: null })),` を削除し、コメント「7 つとも」を「6 つとも」に改める
- テスト名「エントリー・対戦表・試合の実施順の 3 区画を出す」を「エントリー・対戦表・試合名の 3 区画を出す」に、`screen.getByRole("heading", { name: "試合の実施順" })` を `screen.getByRole("heading", { name: "試合名" })` に改める
- コメント中の「実施順の一覧」を「試合名の一覧」に改める（2 箇所）

- [ ] **Step 5: 並べ替えを前提にした記述を直す**

`src/features/division/match-name-view.test.ts` — 「並べ替え済みの配列は並べ直さずにそのまま返す」のテストを丸ごと削除する（前提の並べ替えが無くなった。配列の順を保つことは 1 つ目のテストが確かめている）。

`src/features/division/match-name-view.ts` の `toMatchOrderView` の doc コメント:

```ts
/**
 * 保存済みの組み合わせを試合名の編集一覧にする。
 *
 * 並べ替えず配列の順をそのまま使う。parseMatchingConfig が揃えた順が
 * そのまま画面の並びになる。
 *
 * トーナメントとリーグで同じ行・同じ並べ方になったため 1 つにまとめてある。
 * 違いは位置の文言だけで、それは format を label.ts へ渡して吸収する。
 */
```

`src/lib/dnd/reorder.ts` の doc コメントの 2 段落目:

```ts
 * 大会の進行順（components/schedule）が使う。判断を画面から切り離して
 * 下位共通層に置いておくと、lib は features / components を参照できない層
 * なので、この関数がライブラリにも画面にも依存しない純粋関数であることが
 * 構造的に保たれる。
```

`src/components/schedule/ScheduleList.tsx` の `rowName` の doc コメントの「（components/division/MatchOrderList.tsx と同じ形）」を削除する。

- [ ] **Step 6: テストと型を通す**

Run: `pnpm exec vitest run src/components/division src/features/division "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]"`
Expected: PASS

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし

- [ ] **Step 7: 取り残しが無いことを確かめる**

Run: `grep -rn "reorder-matches\|reorderMatches\|ReorderMatches\|DivisionMatchOrderError" src`
Expected: 何も出ない

- [ ] **Step 8: コミット**

```bash
git add -A
```

```bash
git commit -m "refactor(division): 部門内の試合の並べ替えを撤去する" -m "試合番号を大会の進行順の通し番号だけにするため、reorder-matches スライスと編集一覧のドラッグを削除する。一覧は試合名の編集だけを持つ。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 試合名の変数を `{{OverallSeq}}` だけにし、既定値を変える

`DEFAULT_MATCH_NAME` はこの時点ではまだ生成にも読み出しにも使われていない（Task 8 で使う）ので、画面の表示は変わらない。

**Files:**
- Modify: `src/lib/division/match-name.ts`
- Modify: `src/lib/division/overall-order.ts`（コメント）
- Modify: `src/features/schedule/domain.ts`
- Modify: `src/features/schedule/types.ts`（コメント）
- Test: `src/lib/division/match-name.test.ts`、`src/lib/division/overall-order.test.ts`、`src/features/schedule/domain.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `DEFAULT_MATCH_NAME: string` = `"第{{OverallSeq}}試合"`
  - `type MatchNameVars = { OverallSeq: number }`
  - `renderMatchName(template: string, vars: MatchNameVars): string`
  - `resolveMatchNames(config: MatchingConfig, divisionId: string, overallSeq: ReadonlyMap<string, number>): Map<string, string>`（シグネチャは据え置き、`DivisionSeq` を渡さなくなる）

- [ ] **Step 1: 展開の失敗テストを書く**

`src/lib/division/match-name.test.ts` を丸ごと置き換える:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATCH_NAME,
  renderMatchName,
  resolveMatchNames,
} from "./match-name";
import { overallSeqKey } from "./overall-order";
import type { BracketMatch, MatchingConfig } from "./types";

const vars = { OverallSeq: 5 };

describe("DEFAULT_MATCH_NAME", () => {
  it("既定値は大会全体の通し番号で「第N試合」になる", () => {
    expect(DEFAULT_MATCH_NAME).toBe("第{{OverallSeq}}試合");
    expect(renderMatchName(DEFAULT_MATCH_NAME, vars)).toBe("第5試合");
  });
});

describe("renderMatchName", () => {
  it("OverallSeq を大会全体の通し番号に展開する", () => {
    expect(renderMatchName("第{{OverallSeq}}試合", vars)).toBe("第5試合");
  });

  it("DivisionSeq はもう変数ではないので空文字になる", () => {
    expect(renderMatchName("第{{DivisionSeq}}試合", vars)).toBe("第試合");
  });

  it("変数の内側の空白を許す", () => {
    expect(renderMatchName("第{{ OverallSeq }}試合", vars)).toBe("第5試合");
  });

  it("知らない変数は空文字にする（mustache の既定）", () => {
    expect(renderMatchName("第{{Foo}}試合", vars)).toBe("第試合");
  });

  it("変数名の大文字小文字を区別する", () => {
    expect(renderMatchName("{{overallseq}}", vars)).toBe("");
  });

  it("変数を含まない文字列はそのまま返す", () => {
    expect(renderMatchName("決勝", vars)).toBe("決勝");
  });

  it("テンプレートのリテラル部分はエスケープしない", () => {
    expect(renderMatchName("A & B 第{{OverallSeq}}試合", vars)).toBe(
      "A & B 第5試合",
    );
  });

  it("閉じ忘れた区画は例外にせずテンプレートのまま返す", () => {
    expect(renderMatchName("{{#a}}第1試合", vars)).toBe("{{#a}}第1試合");
  });
});

const match = (
  id: string,
  order: number,
  matchName: string,
): BracketMatch => ({
  id,
  bracket: "winners",
  round: 1,
  order,
  sequence: order,
  matchName,
  slots: [{ kind: "bye" }, { kind: "bye" }],
});

describe("resolveMatchNames", () => {
  const config: MatchingConfig = {
    version: 1,
    matches: [
      match("m1", 0, "第{{OverallSeq}}試合"),
      match("m2", 1, "決勝"),
      match("m3", 2, "第{{DivisionSeq}}試合"),
    ],
  };

  it("部門 id と組にしたキーで通し番号を引く", () => {
    const names = resolveMatchNames(
      config,
      "d1",
      new Map([
        [overallSeqKey("d1", "m1"), 7],
        [overallSeqKey("d1", "m2"), 8],
        [overallSeqKey("d1", "m3"), 9],
      ]),
    );

    expect(names.get("m1")).toBe("第7試合");
    expect(names.get("m2")).toBe("決勝");
  });

  it("部門内の番号は展開しない", () => {
    const names = resolveMatchNames(
      config,
      "d1",
      new Map([[overallSeqKey("d1", "m3"), 9]]),
    );

    expect(names.get("m3")).toBe("第試合");
  });

  it("通し番号を引けない試合は OverallSeq を 0 にする", () => {
    const names = resolveMatchNames(config, "d1", new Map());

    expect(names.get("m1")).toBe("第0試合");
    expect(names.get("m2")).toBe("決勝");
  });
});
```

> `match` ヘルパの `sequence: order,` は Task 6 で型ごと消す。

`src/features/schedule/domain.test.ts` の `describe("buildScheduleView の試合名", …)` の 1 つ目のテストを差し替え、その直後にテストを 1 つ足す:

```ts
  it("テンプレートを展開して行に載せる", () => {
    const division = makeDivision({
      id: "d1",
      order: 0,
      matches: [
        makeMatch({ id: "m1", sequence: 0, matchName: "第{{OverallSeq}}試合" }),
        makeMatch({ id: "m2", sequence: 1, matchName: "決勝" }),
      ],
    });

    const rows = buildScheduleView([division], [], []);

    expect(rows[0]).toMatchObject({ matchId: "m1", matchName: "第1試合" });
    expect(rows[1]).toMatchObject({ matchId: "m2", matchName: "決勝" });
  });

  it("部門内の番号（{{DivisionSeq}}）は展開しない", () => {
    const division = makeDivision({
      id: "d1",
      order: 0,
      matches: [
        makeMatch({ id: "m1", sequence: 1, matchName: "第{{DivisionSeq}}試合" }),
      ],
    });

    const rows = buildScheduleView([division], [], []);

    expect(rows[0]).toMatchObject({ matchId: "m1", matchName: "第試合" });
  });
```

- [ ] **Step 2: 通し番号の性質を固定するテストを足す**

`src/lib/division/overall-order.test.ts` の `describe` の末尾に追加（算出の規則そのものは変えないので、この 2 件は最初から PASS する。改訂の仕様を回帰テストとして固定する目的）:

```ts
  it("保存済みの進行順を並べ替えると番号も振り直される", () => {
    const before = buildOverallSeq(divisions, [
      { divisionId: "d1", matchId: "m1" },
      { divisionId: "d1", matchId: "m2" },
      { divisionId: "d2", matchId: "n1" },
    ]);
    const after = buildOverallSeq(divisions, [
      { divisionId: "d2", matchId: "n1" },
      { divisionId: "d1", matchId: "m1" },
      { divisionId: "d1", matchId: "m2" },
    ]);

    expect(before.get(overallSeqKey("d1", "m1"))).toBe(1);
    expect(after.get(overallSeqKey("d1", "m1"))).toBe(2);
    expect(after.get(overallSeqKey("d2", "n1"))).toBe(1);
  });

  it("行を持たない試合は、部門の中では matchIds の配列の順で末尾に足す", () => {
    // id の文字列順でも round 順でもなく、渡された配列の順。配列の順は
    // parseMatchingConfig が round → order に揃えた順になっている。
    const seq = buildOverallSeq(
      [{ id: "d1", order: 0, matchIds: ["m2-0", "m1-0", "m1-1"] }],
      [],
    );

    expect(seq.get(overallSeqKey("d1", "m2-0"))).toBe(1);
    expect(seq.get(overallSeqKey("d1", "m1-0"))).toBe(2);
    expect(seq.get(overallSeqKey("d1", "m1-1"))).toBe(3);
  });
```

- [ ] **Step 3: テストを走らせて落ちることを確かめる**

Run: `pnpm exec vitest run src/lib/division/match-name.test.ts src/lib/division/overall-order.test.ts src/features/schedule/domain.test.ts`
Expected: FAIL（`DEFAULT_MATCH_NAME` が `"第{{DivisionSeq}}試合"`、`resolveMatchNames` / `buildScheduleView` が `{{DivisionSeq}}` を `"第2試合"` などに展開する）。`overall-order.test.ts` は PASS

- [ ] **Step 4: 展開から `DivisionSeq` を外す**

`src/lib/division/match-name.ts` の定数・型・`resolveMatchNames` を差し替える:

```ts
/**
 * 生成直後の試合名。番号は大会の進行順（/matches）の通し番号で、
 * 進行順を並べ替えたり区切りを挿したりすると表示も自動で振り直される。
 * テンプレートなので、振り直しのたびに試合名を書き換える必要が無い。
 */
export const DEFAULT_MATCH_NAME = "第{{OverallSeq}}試合";

/**
 * 試合名のテンプレートに渡せる変数。名前は mustache のキーそのもの。
 *
 * 部門ごとの番号は持たない。試合番号を大会全体の通し番号 1 つに絞ったため。
 * 旧 {{DivisionSeq}} のような知らない変数は mustache の既定どおり空文字になる。
 */
export type MatchNameVars = {
  /** 大会の進行順で何番目の試合か。1 始まり */
  OverallSeq: number;
};
```

```ts
export const resolveMatchNames = (
  config: MatchingConfig,
  divisionId: string,
  overallSeq: ReadonlyMap<string, number>,
): Map<string, string> =>
  new Map(
    config.matches.map((match) => [
      match.id,
      renderMatchName(match.matchName, {
        OverallSeq: overallSeq.get(overallSeqKey(divisionId, match.id)) ?? 0,
      }),
    ]),
  );
```

`src/features/schedule/domain.ts` の `buildMatchRows` の `matchName`:

```ts
          matchName: renderMatchName(match.matchName, { OverallSeq: seq }),
```

`src/features/schedule/types.ts` の `ScheduleRowView` の `matchName` のコメント:

```ts
      /**
       * 展開済みの表示名。{{OverallSeq}} を含むテンプレートのままでは運ばない。
       * {{OverallSeq}} は大会全体の通し番号が要るため、展開できるのは
       * 全部門を見ている buildScheduleView だけ。
       */
```

`src/lib/division/overall-order.ts` のコメント 2 箇所:

```ts
/**
 * 通し番号の材料になる部門。matchIds は部門の matches 配列の順
 * （parseMatchingConfig が round → order に揃えた順）で渡す。
 */
```

```ts
 * 並びの規則は進行順の一覧（features/schedule の buildScheduleView）と同じ
 * ——「保存された進行順に並べ、実体の無い行と二重の行は落とし、行を持たない
 * 試合を部門 order → 部門内の配列の順で末尾に足す」。同じ規則を 2 箇所に書くと
```

- [ ] **Step 5: テストと型を通す**

Run: `pnpm exec vitest run src/lib/division src/features/schedule`
Expected: PASS

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: `DivisionSeq` の取り残しを確かめる**

Run: `grep -rn "DivisionSeq" src`
Expected: `src/lib/division/match-name.test.ts`（「もう変数ではない」「部門内の番号は展開しない」のテスト）、`src/lib/division/match-name.ts`（`MatchNameVars` のコメント）、`src/features/schedule/domain.test.ts`（「展開しない」のテスト）だけ

- [ ] **Step 7: コミット**

```bash
git add -A
```

```bash
git commit -m "feat(division): 試合名の変数を大会全体の通し番号だけにする" -m "{{DivisionSeq}} を展開の変数から外し、既定値を 第{{OverallSeq}}試合 にする。書かれていれば mustache の既定どおり空文字になる。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 構造上の位置の文言を `N回戦 (M)` にし、リーグでは出さない

**Files:**
- Modify: `src/lib/division/label.ts`
- Modify: `src/components/schedule/ScheduleMatchRow.tsx`、`src/components/schedule/ScheduleList.tsx`
- Modify: `src/components/public/PublicScheduleList.tsx`
- Modify: `src/components/result/MatchResultRow.tsx`
- Modify: `src/components/division/MatchNameRow.tsx`
- Modify: `src/features/schedule/types.ts`、`src/features/schedule/result-rows.ts`、`src/features/division/match-name-view.ts`（コメント）
- Test: `src/lib/division/label.test.ts`、`src/components/schedule/ScheduleList.test.tsx`、`src/components/public/PublicScheduleList.test.tsx`、`src/components/result/MatchResultList.test.tsx`、`src/components/division/MatchOrderList.test.tsx`、`src/features/schedule/domain.test.ts`、`src/features/division/match-name-view.test.ts`、`src/components/division/DivisionSetup.test.tsx`、`src/components/division/LeagueSetup.test.tsx`

**Interfaces:**
- Consumes: `BracketMatch`、`DivisionFormat`
- Produces:
  - `matchPositionLabel(match: BracketMatch, format: DivisionFormat): string` — `ROUND_ROBIN` は `""`、それ以外は `` `${match.round}回戦 (${match.order + 1})` ``
  - `formatDivisionPosition(divisionName: string, label: string): string` — `label` が空なら `divisionName`、そうでなければ `` `${divisionName} / ${label}` ``（`src/lib/division/label.ts`）

- [ ] **Step 1: 文言の失敗テストを書く**

`src/lib/division/label.test.ts`:

1. import を `import { createSlotLabeler, formatDivisionPosition, matchCardLabel, matchPositionLabel } from "./label";` にする。
2. `describe("matchPositionLabel", …)` を丸ごと次に差し替え、その後ろに `formatDivisionPosition` の `describe` を足す:

```ts
describe("matchPositionLabel", () => {
  it("round と order から構造上の位置を作る", () => {
    expect(matchPositionLabel(config.matches[1], "SINGLE_ELIMINATION")).toBe(
      "2回戦 (1)",
    );
  });

  describe("matchPositionLabel（形式ごとの文言）", () => {
    // BracketMatch.slots はタプル型（読み取り専用ではない）なので、
    // ここでは `as const` を使わず型注釈でリテラル型を効かせる。
    const match: BracketMatch = {
      id: "x1-0",
      bracket: "winners",
      round: 2,
      order: 1,
      sequence: 1,
      matchName: "5",
      slots: [
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ],
    };

    it("トーナメントは「N回戦 (ラウンド内の位置)」で表す", () => {
      // 「第 M 試合」と書くと、試合名の既定値（第{{OverallSeq}}試合）と
      // 見分けが付かなくなる。
      expect(matchPositionLabel(match, "SINGLE_ELIMINATION")).toBe(
        "2回戦 (2)",
      );
    });

    it("リーグは位置の文言を出さない", () => {
      // リーグに節は無い。round は常に 1 なので「1回戦」と出すと嘘になり、
      // 通し番号を出すと試合番号と紛らわしい。
      expect(matchPositionLabel(match, "ROUND_ROBIN")).toBe("");
    });
  });
});

describe("formatDivisionPosition", () => {
  it("部門名と位置を「 / 」でつなぐ", () => {
    expect(formatDivisionPosition("男子", "1回戦 (1)")).toBe("男子 / 1回戦 (1)");
  });

  it("位置が空文字なら部門名だけにする", () => {
    expect(formatDivisionPosition("女子リーグ", "")).toBe("女子リーグ");
  });
});
```

`src/components/schedule/ScheduleList.test.tsx` の `describe` の末尾に追加:

```tsx
  it("位置の文言が空の試合行（リーグ）は部門名だけを出し、操作の名前にも空白を残さない", () => {
    const leagueRow: ScheduleRowView = {
      kind: "match",
      key: "match:dL:r1-0",
      divisionId: "dL",
      divisionName: "女子リーグ",
      matchId: "r1-0",
      matchName: "第3試合",
      label: "",
      card: "高橋 vs 伊藤",
    };
    renderList({ rows: [leagueRow] });

    expect(screen.getByText("女子リーグ")).toBeInTheDocument();
    expect(screen.queryByText(/女子リーグ \//)).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "1行目 女子リーグをドラッグして並べ替え",
      }),
    ).toBeInTheDocument();
  });
```

`src/components/public/PublicScheduleList.test.tsx` の `describe` の末尾に追加:

```tsx
  it("位置の文言が空の試合行（リーグ）は部門名だけを出す", () => {
    render(
      <PublicScheduleList
        rows={[
          {
            kind: "match",
            key: "match:dL:r1-0",
            divisionId: "dL",
            divisionName: "女子リーグ",
            matchId: "r1-0",
            matchName: "第3試合",
            label: "",
            card: "高橋 vs 伊藤",
          },
        ]}
      />,
    );

    expect(screen.getByText("女子リーグ")).toBeInTheDocument();
    expect(screen.queryByText(/女子リーグ \//)).toBeNull();
  });
```

`src/components/result/MatchResultList.test.tsx` の `describe` の末尾に追加:

```tsx
  it("位置の文言が空の行（リーグ）は部門名だけを出す", () => {
    renderList([matchRow({ divisionName: "女子リーグ", label: "" })]);

    expect(screen.getByText("女子リーグ")).toBeInTheDocument();
    expect(screen.queryByText(/女子リーグ \//)).toBeNull();
  });
```

`src/components/division/MatchOrderList.test.tsx` の `describe` の末尾に追加（import に `within` は不要）:

```tsx
  it("位置の文言が空の行（リーグ）は対戦カードで入力欄を名付け、位置の行を出さない", () => {
    renderList([
      {
        matchId: "r1-0",
        matchName: "1",
        label: "",
        card: "山田 vs 田中",
      },
    ]);

    expect(screen.getByLabelText("山田 vs 田中の試合名")).toHaveValue("1");
    // 行の中の段落は対戦カードの 1 つだけ（空の位置の段落を描かない）。
    expect(screen.getByRole("listitem").querySelectorAll("p")).toHaveLength(1);
  });
```

算出側の既存テストの期待値を直す:

| ファイル | 変更前 | 変更後 |
|---|---|---|
| `src/features/schedule/domain.test.ts`（「試合行に部門名・試合名・位置・対戦カードを載せる」） | `label: "1回戦 第1試合",` | `label: "1回戦 (1)",` |
| `src/features/schedule/domain.test.ts`（「リーグの部門は実施順の通し番号で並べる」） | テスト名と `.toBe("第1試合")` | テスト名「リーグの部門は位置の文言を空にする」、`.toBe("")` |
| `src/features/division/match-name-view.test.ts`（「位置の文言と対戦カードを載せる」） | `label: "1回戦 第1試合",` | `label: "1回戦 (1)",` |
| `src/components/division/DivisionSetup.test.tsx` | `screen.getByLabelText("1回戦 第1試合の試合名")` | `screen.getByLabelText("1回戦 (1)の試合名")` |
| `src/components/division/LeagueSetup.test.tsx` | `screen.getByLabelText("第1試合の試合名")` | `screen.getByLabelText("山田 vs 田中の試合名")` |

> ほかのテストにある `label: "1回戦 第1試合"` は行の型を満たすための不透明な値で、算出を通らない。変えなくてよい。

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `pnpm exec vitest run src/lib/division/label.test.ts src/components/schedule src/components/public src/components/result src/components/division src/features/schedule/domain.test.ts src/features/division/match-name-view.test.ts`
Expected: FAIL（`formatDivisionPosition` が無い、`"2回戦 第1試合"` が返る、`女子リーグ / ` と描かれる、入力欄の名前が `の試合名` になる）

- [ ] **Step 3: 位置の文言を変える**

`src/lib/division/label.ts` の `matchPositionLabel` を差し替え、その直後に `formatDivisionPosition` を足す:

```ts
/**
 * 「1回戦 (1)」のような構造上の位置。
 *
 * 「第 N 試合」と書かないのは、試合名の既定値（第{{OverallSeq}}試合）と同じ形に
 * なり、大会の通し番号と取り違えるため。括弧の数字はラウンド内の上からの位置
 * （order + 1）で、試合の番号ではない。
 *
 * リーグは節も回戦も持たないので位置の文言を出さない（空文字）。表示側は
 * formatDivisionPosition を通して、空文字なら区切りごと描かない。
 *
 * 形式を引数に取るのは、この関数が大会の進行順（複数の部門が混ざる）でも
 * 使われるため。呼び出し側がその試合の部門の形式を知っている。
 */
export const matchPositionLabel = (
  match: BracketMatch,
  format: DivisionFormat,
): string =>
  format === "ROUND_ROBIN" ? "" : `${match.round}回戦 (${match.order + 1})`;

/**
 * 「男子 / 1回戦 (1)」のような、部門名と位置を並べた 1 行。
 * 位置が空文字（リーグ）のときは部門名だけにして、「男子 / 」のように
 * 区切りだけが残るのを防ぐ。進行順・公開の進行順・結果入力の 3 画面が
 * 同じ見せ方をするため、ここに 1 つだけ置く。
 */
export const formatDivisionPosition = (
  divisionName: string,
  label: string,
): string => (label === "" ? divisionName : `${divisionName} / ${label}`);
```

- [ ] **Step 4: 表示側で空文字を描かない**

`src/components/schedule/ScheduleMatchRow.tsx`:

```tsx
"use client";

import type { ScheduleRowView } from "@/features/schedule/types";
import { formatDivisionPosition } from "@/lib/division/label";

type MatchRow = Extract<ScheduleRowView, { kind: "match" }>;

export function ScheduleMatchRow({ row }: { row: MatchRow }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 text-sm text-slate-800">
        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
          {row.matchName}
        </span>
        <span className="truncate font-medium">{row.card}</span>
      </p>
      <p className="truncate text-xs text-slate-500">
        {formatDivisionPosition(row.divisionName, row.label)}
      </p>
    </div>
  );
}
```

`src/components/schedule/ScheduleList.tsx` の `rowName`:

```tsx
const rowName = (row: ScheduleRowView, position: number): string =>
  row.kind === "match"
    ? // リーグの行は位置の文言が空文字。空の部分を詰めて、名前の中に
      // 余計な空白を残さない。
      [`${position}行目`, row.divisionName, row.label]
        .filter((part) => part !== "")
        .join(" ")
    : `${position}行目 区切り「${row.label}」`;
```

`src/components/public/PublicScheduleList.tsx` — import に `import { formatDivisionPosition } from "@/lib/division/label";` を足し、試合行の 2 段目を差し替える:

```tsx
            <p className="mt-1 text-xs text-slate-500">
              {formatDivisionPosition(row.divisionName, row.label)}
            </p>
```

`src/components/result/MatchResultRow.tsx` — import に `import { formatDivisionPosition } from "@/lib/division/label";` を足し、見出しの 2 つ目の `span` を差し替える:

```tsx
            <span className="truncate text-xs text-slate-500">
              {formatDivisionPosition(row.divisionName, row.label)}
            </span>
```

`src/components/division/MatchNameRow.tsx` — `return` の直前に名前を作り、位置の段落と `aria-label` を差し替える:

```tsx
  // リーグの行は位置の文言を持たない（空文字）。入力欄の名前には対戦カードを
  // 使い、支援技術に「の試合名」という同じ名前の欄が並ばないようにする。
  const rowName = row.label === "" ? row.card : row.label;

  return (
    <div className="flex flex-1 items-center justify-between gap-4">
      <div className="min-w-0">
        {row.label !== "" && (
          <p className="text-sm font-medium text-slate-800">{row.label}</p>
        )}
        <p className="truncate text-xs text-slate-500">{row.card}</p>
      </div>
```

```tsx
          aria-label={`${rowName}の試合名`}
```

型のコメントを直す:

| ファイル | 変更前 | 変更後 |
|---|---|---|
| `src/features/schedule/types.ts`（`ScheduleRowView.label`） | `/** 「1回戦 第1試合」 */` | `/** 「1回戦 (1)」。リーグは位置を持たないので空文字 */` |
| `src/features/schedule/result-rows.ts`（`ResultRowView.label`） | `/** 「1回戦 第1試合」 */` | `/** 「1回戦 (1)」。リーグは位置を持たないので空文字 */` |
| `src/features/division/match-name-view.ts`（`MatchNameRowView.label`） | `/** 「1回戦 第1試合」（リーグは「第1試合」）のような構造上の位置 */` | `/** 「1回戦 (1)」のような構造上の位置。リーグは空文字 */` |

- [ ] **Step 5: テストと型を通す**

Run: `pnpm exec vitest run src/lib/division src/components src/features/schedule src/features/division`
Expected: PASS

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add -A
```

```bash
git commit -m "feat(division): 構造上の位置を N回戦 (M) にし、リーグでは出さない" -m "「第N試合」は試合名の既定値と紛らわしいので位置の文言から外す。リーグは空文字にし、進行順・公開の進行順・結果入力・試合名の一覧は空なら区切りごと描かない。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `BracketMatch.sequence` を撤去する

Task 3〜5 で `sequence` の読み手（並べ替え・`DivisionSeq`・リーグの位置）は無くなっている。型・読み出し・検証・生成から外し、テストの組み立てからも消す。

**Files:**
- Modify: `src/lib/division/types.ts`
- Modify: `src/lib/division/parse.ts`
- Modify: `src/lib/division/validate.ts`
- Modify: `src/features/division/single-elimination/build.ts`
- Modify: `src/features/division/round-robin/build.ts`
- Modify: `src/features/schedule/domain.ts`（コメント）
- Test: `src/lib/division/parse.test.ts`、`src/lib/division/validate.test.ts`、`src/features/division/single-elimination/build.test.ts`、`src/features/division/round-robin/build.test.ts`
- Modify（組み立ての `sequence` を消すだけ）: `src/lib/division/label.test.ts`、`src/lib/division/match-name.test.ts`、`src/lib/division/resolve.test.ts`、`src/features/schedule/domain.test.ts`、`src/features/schedule/result-rows.test.ts`、`src/features/bracket/from-division.test.ts`、`src/features/division/repository.test.ts`、`src/features/division/round-robin/standings.test.ts`、`src/features/division/match-name-view.test.ts`（テスト名のみ）、`src/components/division/DivisionMatchingView.test.tsx`、`src/components/division/DivisionSetup.test.tsx`、`src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces:
  - `BracketMatch` = `{ id: string; bracket: BracketSide; round: number; order: number; matchName: string; slots: [SlotSource, SlotSource] }`
  - `parseMatchingConfig(value: unknown): MatchingConfig` — `matches` を round → order の順に並べて返す。保存済みの `sequence` は読まない

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/parse.test.ts` — `describe("parseMatchingConfig", …)` の中の次の 4 件を削除する:
「sequence の無い旧データには round/order 順で 0 からの連番を振る」「sequence があればその昇順に並べ、0 からの連番に詰め直す」「sequence が一部にしか無ければ全件を round/order 順で振り直す」「sequence が整数以外なら DivisionJsonError」。代わりに同じ位置へ次の 3 件を足す:

```ts
  it("matches は round → order の順に並べて返す", () => {
    const match = (id: string, round: number, order: number) => ({
      id,
      bracket: "winners",
      round,
      order,
      matchName: id,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    });
    const config = parseMatchingConfig({
      version: 1,
      // 配列順を round/order 順と食い違わせ、並べ直すことを確かめる
      matches: [match("m2-0", 2, 0), match("m1-1", 1, 1), match("m1-0", 1, 0)],
    });

    // 返す配列の順が下流（編集一覧・進行順の末尾追加）の並びになる
    expect(config.matches.map((match) => match.id)).toEqual([
      "m1-0",
      "m1-1",
      "m2-0",
    ]);
  });

  it("保存済みの sequence は読まずに捨て、並びにも使わない", () => {
    // 部門内の並べ替えで sequence を書いていた旧データ。
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          sequence: 0,
          matchName: "b",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          sequence: 1,
          matchName: "a",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });

    expect(config.matches.map((match) => match.id)).toEqual(["m1-0", "m1-1"]);
    expect(config.matches[0]).not.toHaveProperty("sequence");
  });

  it("sequence が整数でなくてもエラーにしない（読まないため）", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            sequence: "1",
            matchName: "1",
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      }),
    ).not.toThrow();
  });
```

`src/lib/division/validate.test.ts` — 「sequence が 0 からの連番なら通る」「sequence が重複していたらエラー」「sequence に欠番があったらエラー」の 3 件を削除し、同じ位置へ足す:

```ts
  it("実施順（sequence）は検査しない", () => {
    const config: MatchingConfig = {
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          matchName: "2",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    };

    expect(validateMatchingConfig(config, { version: 1, entries: [] })).toEqual(
      [],
    );
  });
```

`src/features/division/single-elimination/build.test.ts` — `describe("buildFromSlots", …)` の末尾に足す:

```ts
  it("試合に実施順（sequence）を持たせない", () => {
    const config = buildFromSlots([
      entry("e1"),
      entry("e2"),
      entry("e3"),
      entry("e4"),
    ]);

    for (const match of config.matches) {
      expect(match).not.toHaveProperty("sequence");
    }
  });
```

`src/features/division/round-robin/build.test.ts` — 「節を保存しない（全試合が round 1 の 1 本の並び）」の中の `expect(config.matches.map((match) => match.sequence)).toEqual([0, 1, 2, 3, 4, 5]);`（複数行）を削除し、`describe("buildRoundRobin", …)` の末尾に足す:

```ts
  it("試合に実施順（sequence）を持たせない", () => {
    for (const match of buildRoundRobin(entriesOf(4)).matches) {
      expect(match).not.toHaveProperty("sequence");
    }
  });
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `pnpm exec vitest run src/lib/division/parse.test.ts src/lib/division/validate.test.ts src/features/division/single-elimination/build.test.ts src/features/division/round-robin/build.test.ts`
Expected: FAIL（`sequence` が付いて返る、`sequence: "1"` で `DivisionJsonError`、`sequence` の無い config が検証で落ちる）

- [ ] **Step 3: 型から外す**

`src/lib/division/types.ts` の `BracketMatch`:

```ts
/** 組み合わせの中の 1 試合。 */
export type BracketMatch = {
  /** 部門内で一意 */
  id: string;
  bracket: BracketSide;
  /** 1 = 1 回戦。ROUND_ROBIN は節を持たないので常に 1 */
  round: number;
  /**
   * ラウンド内の上からの位置。0 始まり。
   *
   * round/order は「ブラケット上のどこにある試合か」を表し、描画座標に
   * そのまま使われる（features/bracket/layout-bracket.ts）。部門の中の
   * 実施順は持たない。試合の順番は大会の進行順（ScheduleItem）だけが決める。
   */
  order: number;
  /** 表示用の試合名。部門内で一意。デフォルトは round/order 順の連番 */
  matchName: string;
  slots: [SlotSource, SlotSource];
};
```

- [ ] **Step 4: 読み出しから外す**

`src/lib/division/parse.ts`:

1. `ParsedBracketMatch` と `NumberedBracketMatch` の 2 つの型を次の 1 つに置き換える:

```ts
/** matchName 補完前の 1 試合。旧データには無い。 */
type ParsedBracketMatch = Omit<BracketMatch, "matchName"> & {
  matchName?: string;
};
```

2. `parseBracketMatch` の `if (record.sequence !== undefined) { … }` のブロックを削除し、`return parsed;` の直前に次のコメントを置く:

```ts
  // 旧データの sequence（部門内の実施順）は読まずに捨てる。試合の順番は
  // 大会の進行順だけが持つ。型が合わない値でも読まないので弾かない。
```

3. `fillMatchNames` の返り値の型を `BracketMatch[]` にし、末尾のキャストを `(match as BracketMatch)` にする（中身の採番はこのタスクでは変えない）。

4. `fillSequences` を丸ごと削除し、代わりに置く:

```ts
/**
 * round → order の順に並べる。
 *
 * Json の配列順は当てにできない（旧データは部門内の並べ替えで sequence 順に
 * 並んでいる）ので、読み出しで構造上の順に揃える。下流（試合名の一覧、
 * 進行順に行を持たない試合の末尾追加）は並べ直さずに配列の順を読む。
 */
const sortByPosition = (matches: BracketMatch[]): BracketMatch[] =>
  [...matches].sort(
    (left, right) => left.round - right.round || left.order - right.order,
  );
```

5. `parseMatchingConfig`:

```ts
export const parseMatchingConfig = (value: unknown): MatchingConfig => {
  const record = asRecord(value, "matchingConfig");
  return {
    version: asVersion1(record.version, "matchingConfig.version"),
    matches: sortByPosition(
      fillMatchNames(
        asArray(record.matches, "matchingConfig.matches").map((item, index) =>
          parseBracketMatch(item, `matchingConfig.matches[${index}]`),
        ),
      ),
    ),
  };
};
```

- [ ] **Step 5: 検証と生成から外す**

`src/lib/division/validate.ts`:
- `validateMatchingConfig` の doc コメントから `あわせて sequence が 0 からの連番になっていることも検証する。` の行を削除
- `// 実施順は 0 から抜けなく並んでいなければならない。` から始まるコメントと、`const sequences = …` から `errors.push(…sequence が 0 からの連番ではありません…)` を含む `if` ブロックまでを削除

`src/features/division/single-elimination/build.ts`:
- 1 回戦の `matches.push` から `// 生成直後の実施順は round/order 順。…` のコメント行と `sequence: matches.length,` を削除
- 2 回戦以降の `matches.push` から `sequence: matches.length,` を削除

`src/features/division/round-robin/build.ts`:
- `matches.push` から `sequence: order,` を削除
- `matchId` の doc コメントの `ことを表していて、実施順ではない。並べ替えても id は変わらない。` を `ことを表していて、並びの位置（order）と同じ値を使う。` に改める

`src/features/schedule/domain.ts` の `buildScheduleView` のコメント:

```ts
        // parseMatchingConfig が round → order の順に揃えて返すので、配列の順をそのまま使う。
```

- [ ] **Step 6: テストの組み立てから `sequence` を消す**

機械的な置換（Git Bash で実行。CRLF の行末も対象にする）:

```bash
sed -i -E '/^[[:space:]]*sequence: [^,]+,\r?$/d' src/lib/division/label.test.ts src/lib/division/match-name.test.ts src/lib/division/validate.test.ts src/features/schedule/domain.test.ts src/features/bracket/from-division.test.ts src/features/division/repository.test.ts src/features/division/round-robin/standings.test.ts src/features/division/round-robin/build.test.ts src/features/division/single-elimination/build.test.ts src/components/division/DivisionMatchingView.test.tsx src/components/division/DivisionSetup.test.tsx "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"
```

```bash
sed -i -E 's/, sequence: [0-9]+,/,/g' src/features/schedule/domain.test.ts
```

置換では消えない形を手で直す:

| ファイル | 変更内容 |
|---|---|
| `src/features/schedule/result-rows.test.ts` | `match` ヘルパの引数 `sequence: number,` と本体の `sequence,` を削除し、3 つの呼び出し `match("m1-0", 1, 0, 0, "1", [` / `match("m1-1", 1, 1, 1, "2", [` / `match("m2-0", 2, 0, 2, "3", [` から 4 番目の引数を消して `match("m1-0", 1, 0, "1", [` / `match("m1-1", 1, 1, "2", [` / `match("m2-0", 2, 0, "3", [` にする |
| `src/lib/division/resolve.test.ts` | `match` ヘルパの引数 `sequence = 0,` と本体の `sequence,` を削除し、ファイル内の全 `match(` 呼び出しから最後の数値の引数（`0,` `1,` `2,` `1,` `3,` の行）を削除する |
| `src/features/schedule/domain.test.ts` | テスト名「部門内は round/order で並べ直さず、配列順（＝実施順）をそのまま使う」→「部門内は round/order で並べ直さず、配列順をそのまま使う」、「行が 1 件も無ければ部門順 → 部門内の実施順で全試合を並べる」→「行が 1 件も無ければ部門順 → 部門内の配列順で全試合を並べる」、`outOfOrderDivision` の doc コメントの「配列順（実施順）」→「配列順」 |
| `src/features/division/match-name-view.test.ts` | テスト名「配列の順（＝実施順）のまま行にする」→「配列の順のまま行にする」 |

- [ ] **Step 7: テストと型を通す**

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし。`'sequence' does not exist in type 'BracketMatch'` が残っていれば、その行の `sequence` を同じ規則で消す

Run: `pnpm test`
Expected: 全件 PASS

- [ ] **Step 8: 取り残しが無いことを確かめる**

Run: `grep -rn "sequence" src --include=*.ts --include=*.tsx | grep -v "^src/generated/"`
Expected: `src/lib/division/parse.test.ts`（旧 `sequence` を捨てることを確かめる 2 件）と `src/lib/division/parse.ts`（捨てる理由のコメント）だけ

- [ ] **Step 9: コミット**

```bash
git add -A
```

```bash
git commit -m "refactor(division): 部門内の実施順 sequence を撤去する" -m "試合の順番は大会の進行順だけが決めるため、BracketMatch から sequence を外す。読み出しは保存済みの sequence を捨て、matches を round → order の順に揃えて返す。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 試合名の一意制約を撤廃する

既定値をテンプレートにすると部門内の全試合が同じ文字列になる。その前に、同じ文字列を拒む 2 つの経路（保存前の検証と、試合名の保存スライス）を外す。

**Files:**
- Modify: `src/lib/division/validate.ts`
- Modify: `src/lib/division/types.ts`（コメント）
- Modify: `src/features/division/set-match-name/repository.ts`
- Modify: `src/features/division/errors.ts`、`src/features/division/messages.ts`
- Test: `src/lib/division/validate.test.ts`、`src/features/division/set-match-name/repository.test.ts`、`src/features/division/set-match-name/handler.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_MATCH_NAME`（Task 4）
- Produces: `DivisionError` から `DivisionMatchNumberConflictError` が消える。`validateMatchingConfig` は `matchName` の重複を報告しない（空文字は引き続き報告する）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/validate.test.ts` — import に `import { DEFAULT_MATCH_NAME } from "./match-name";` を足し、「matchName が重複していたらエラー」のテストを丸ごと差し替える:

```ts
  it("試合名が重複していてもエラーにしない", () => {
    // 既定値はテンプレートなので、部門内の全試合が同じ文字列を持つのが正常な状態。
    const errors = validateMatchingConfig(
      {
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: DEFAULT_MATCH_NAME,
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
          {
            id: "m1-1",
            bracket: "winners",
            round: 1,
            order: 1,
            matchName: DEFAULT_MATCH_NAME,
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      },
      { version: 1, entries: [] },
    );

    expect(errors).toEqual([]);
  });
```

`src/features/division/set-match-name/repository.test.ts`:
- 「指定した試合の番号だけを書き換える」のテスト名を「指定した試合の試合名だけを書き換える」に改める
- 「別の試合と同じ番号なら DivisionMatchNumberConflictError」のテストを丸ごと差し替える:

```ts
  it("別の試合と同じ試合名でも保存できる", async () => {
    const twoMatches = buildFromSlots([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
      { kind: "bye" },
      { kind: "bye" },
    ]);
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig: twoMatches,
    });
    const sameAsOther = twoMatches.matches[1].matchName;

    const outcome = await Effect.runPromise(
      setMatchNameInDb(ids, { matchId: "m1-0", matchName: sameAsOther }),
    );

    expect(outcome).toEqual({ found: true, value: null });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches[0].matchName).toBe(sameAsOther);
  });
```

- 「同じ試合への同じ番号の再設定は重複にならない」のテスト名を「同じ試合への同じ試合名の再設定もそのまま保存する」に改める

`src/features/division/set-match-name/handler.test.ts` — 「試合番号が重複していたら文言を返す」のテストを丸ごと削除する。

Run: `pnpm exec vitest run src/lib/division/validate.test.ts src/features/division/set-match-name`
Expected: FAIL（重複のエラーが返る／`DivisionMatchNumberConflictError` で失敗する）

- [ ] **Step 2: 重複の拒否を外す**

`src/lib/division/validate.ts` — `for (const matchName of duplicates(matches.map((match) => match.matchName))) { … }` のループを削除する（空文字を積むループは残す）。直前に次のコメントを置く:

```ts
  // 試合名は重複してよい。既定値がテンプレートなので、全試合が同じ文字列を
  // 持つのが正常な状態。results も ScheduleItem も試合を id で指すので、
  // 名前の一意性に依存している参照は無い。
```

`src/lib/division/types.ts` の `BracketMatch.matchName` のコメント:

```ts
  /** 表示用の試合名。部門内で重複してよい */
  matchName: string;
```

`src/features/division/set-match-name/repository.ts`:
- import から `DivisionMatchNumberConflictError,` を削除
- `if (config.matches.some((match) => match.id !== input.matchId && match.matchName === input.matchName)) { throw new DivisionMatchNumberConflictError(…); }` のブロックを削除

`src/features/division/errors.ts`:
- `/** 試合番号が部門内の別の試合と重複していることを表す。 */` から始まる `DivisionMatchNumberConflictError` クラスの定義を削除
- `DivisionError` union から `| DivisionMatchNumberConflictError` を削除
- `divisionErrorTags` から `DivisionMatchNumberConflictError: true,` を削除

`src/features/division/messages.ts`:
- `Match.tag("DivisionMatchNumberConflictError", () => "その試合番号は別の試合で使われています")` の節を削除

- [ ] **Step 3: テストと型を通す**

Run: `pnpm exec vitest run src/lib/division src/features/division`
Expected: PASS

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし（`Match.exhaustive` と `divisionErrorTags` が union と一致する）

Run: `grep -rn "MatchNumber\|試合番号" src`
Expected: 何も出ない

- [ ] **Step 4: コミット**

```bash
git add -A
```

```bash
git commit -m "feat(division): 試合名の一意制約を撤廃する" -m "既定値をテンプレートにすると全試合が同じ文字列になるため、保存前の検証と試合名の保存スライスから重複の拒否を外す。DivisionMatchNumberConflictError も削除する。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 既定値をテンプレートに切り替え、スロットの文言を展開済みの名前にする

元の計画の Task 7 を改訂に合わせたもの。生成と読み出しの既定値を `DEFAULT_MATCH_NAME` にし、同時に `createSlotLabeler` が展開済みの名前を受け取るようにする（片方だけだと「第第{{OverallSeq}}試合試合の勝者」が出る）。

元の計画では `buildResultRows` に `overallSeq` の引数を足していたが、本計画では**引数を増やさず、渡された進行順の行（展開済みの `matchName` を持つ）から名前の表を作る**。`buildScheduleView` の出力は大会の全試合を含むので材料は揃っており、`loadResultRows` と通し番号の計算を 2 回書かずに済む。

**Files:**
- Modify: `src/features/division/single-elimination/build.ts`
- Modify: `src/features/division/round-robin/build.ts`
- Modify: `src/lib/division/parse.ts`
- Modify: `src/lib/division/label.ts`
- Modify: `src/lib/division/types.ts`（コメント）
- Modify: `src/features/division/match-name-view.ts`
- Modify: `src/features/schedule/domain.ts`
- Modify: `src/features/schedule/result-rows.ts`
- Test: `src/features/division/single-elimination/build.test.ts`、`src/features/division/round-robin/build.test.ts`、`src/lib/division/parse.test.ts`、`src/lib/division/label.test.ts`、`src/features/schedule/domain.test.ts`、`src/features/schedule/result-rows.test.ts`、`src/features/division/match-name-view.test.ts`、`src/features/division/round-robin/view.test.ts`、`src/components/division/LeagueSetup.test.tsx`、`src/features/division/set-match-name/repository.test.ts`（コメント）

**Interfaces:**
- Consumes: `DEFAULT_MATCH_NAME`、`resolveMatchNames`（Task 4）
- Produces:
  - `createSlotLabeler(matchNames: ReadonlyMap<string, string>, entries: DivisionEntries, participants: { id: string; name: string }[]): SlotLabeler` — `winnerOf` / `loserOf` は `` `${名前 ?? "?"}の勝者` `` / `` `${名前 ?? "?"}の敗者` ``
  - `buildResultRows(rows: ScheduleRowView[], divisions: ScheduleDivision[], participants: ScheduleParticipant[]): ResultRowView[]`（シグネチャは据え置き）
  - 生成（`buildFromSlots` / `buildRoundRobin`）と読み出し（`parseMatchingConfig`）が `matchName` に `DEFAULT_MATCH_NAME` を入れる

- [ ] **Step 1: 生成と読み出しの失敗テストを書く**

`src/features/division/single-elimination/build.test.ts`:
- import に `import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";` を足す
- 「2 スロットなら決勝 1 試合だけになる」の期待値の `matchName: "1",` を `matchName: DEFAULT_MATCH_NAME,` にする
- 「試合名を round 昇順 → order 昇順で 1 始まりの連番で振る」と「bye 試合にも試合名を振る」の 2 件を削除し、同じ位置へ足す:

```ts
  it("bye の試合を含む全試合に既定の試合名テンプレートを入れる", () => {
    const config = buildFromSlots([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
      { kind: "entry", entryId: "e3" },
    ]);

    expect(config.matches.map((match) => match.matchName)).toEqual([
      DEFAULT_MATCH_NAME,
      DEFAULT_MATCH_NAME,
      DEFAULT_MATCH_NAME,
    ]);
  });
```

`src/features/division/round-robin/build.test.ts`:
- import に `import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";` を足す
- 「節を保存しない（全試合が round 1 の 1 本の並び）」の中の `expect(config.matches.map((match) => match.matchName)).toEqual(["1", "2", "3", "4", "5", "6"]);`（複数行）を削除
- 「matchName は実施順の通し番号」のテストを差し替える:

```ts
  it("全試合に既定の試合名テンプレートを入れる", () => {
    expect(
      buildRoundRobin(entriesOf(4)).matches.map((match) => match.matchName),
    ).toEqual(Array.from({ length: 6 }, () => DEFAULT_MATCH_NAME));
  });
```

`src/lib/division/parse.test.ts`:
- import に `import { DEFAULT_MATCH_NAME } from "./match-name";` を足す
- 「matchName の無い試合には round/order 順で未使用の連番を補完する」と「補完する連番は既に使われている番号を飛ばす」の 2 件を削除し、同じ位置へ足す:

```ts
  it("matchName の無い試合には既定のテンプレートを入れる", () => {
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "決勝",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });

    expect(config.matches.map((match) => match.matchName)).toEqual([
      "決勝",
      DEFAULT_MATCH_NAME,
    ]);
  });

  it("旧データの matchNumber は読み継がない", () => {
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchNumber: "7",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });

    expect(config.matches[0].matchName).toBe(DEFAULT_MATCH_NAME);
    expect(config.matches[0]).not.toHaveProperty("matchNumber");
  });
```

- [ ] **Step 2: スロットの文言の失敗テストを書く**

`src/lib/division/label.test.ts` の `describe("createSlotLabeler", …)` と `describe("matchCardLabel", …)` を丸ごと差し替える:

```ts
/** 展開済みの試合名。createSlotLabeler は自分では展開しない。 */
const names = new Map([
  ["m1-0", "第3試合"],
  ["m2-0", "決勝"],
]);

describe("createSlotLabeler", () => {
  it("entry は参加者名にする", () => {
    const label = createSlotLabeler(names, entries, participants);
    expect(label({ kind: "entry", entryId: "e1" })).toBe("山田");
  });

  it("参加者を引けない entry は「（不明な参加者）」にする", () => {
    const label = createSlotLabeler(names, entries, participants);
    expect(label({ kind: "entry", entryId: "e9" })).toBe("（不明な参加者）");
  });

  it("勝者・敗者参照は展開済みの試合名に「の勝者」「の敗者」を付ける", () => {
    const label = createSlotLabeler(names, entries, participants);
    expect(label({ kind: "winnerOf", matchId: "m1-0" })).toBe("第3試合の勝者");
    expect(label({ kind: "loserOf", matchId: "m1-0" })).toBe("第3試合の敗者");
  });

  it("試合名に「第◯試合」の飾りを足さない", () => {
    const label = createSlotLabeler(names, entries, participants);
    expect(label({ kind: "winnerOf", matchId: "m2-0" })).toBe("決勝の勝者");
  });

  it("名前を引けない試合を指す参照は「?」にする", () => {
    const label = createSlotLabeler(names, entries, participants);
    expect(label({ kind: "winnerOf", matchId: "zzz" })).toBe("?の勝者");
  });

  it("bye は BYE にする", () => {
    const label = createSlotLabeler(names, entries, participants);
    expect(label({ kind: "bye" })).toBe("BYE");
  });
});

describe("matchCardLabel", () => {
  it("両スロットを vs でつなぐ", () => {
    const label = createSlotLabeler(names, entries, participants);
    expect(matchCardLabel(config.matches[0], label)).toBe("山田 vs BYE");
  });
});
```

`src/features/schedule/domain.test.ts` の `describe("buildScheduleView の試合名", …)` の末尾に足す:

```ts
  it("対戦カードの勝者・敗者の参照は展開済みの試合名で書く", () => {
    const division = makeDivision({
      id: "d1",
      order: 0,
      matches: [
        makeMatch({ id: "m1", matchName: "準決勝" }),
        makeMatch({ id: "m2", order: 1, matchName: "第{{OverallSeq}}試合" }),
        makeMatch({
          id: "m3",
          round: 2,
          matchName: "決勝",
          slots: [
            { kind: "winnerOf", matchId: "m1" },
            { kind: "loserOf", matchId: "m2" },
          ],
        }),
      ],
    });

    const rows = buildScheduleView([division], [], []);

    expect(rows[2]).toMatchObject({
      matchId: "m3",
      card: "準決勝の勝者 vs 第2試合の敗者",
    });
  });
```

`src/features/schedule/result-rows.test.ts`:
- `matchRow` ヘルパの `label: \`${matchName}回戦 第${matchName}試合\`,` を `label: "1回戦 (1)",` にする（どのテストも見ていない不透明な値）
- `rows` を次にする:

```ts
const rows: ScheduleRowView[] = [
  matchRow("m1-0", "第1試合"),
  matchRow("m1-1", "第2試合"),
  matchRow("m2-0", "第3試合"),
];
```

- `describe` の末尾に足す:

```ts
  it("未確定のスロットは、行が持つ展開済みの試合名で「◯◯の勝者」と書く", () => {
    const named: ScheduleRowView[] = [
      matchRow("m1-0", "準決勝A"),
      matchRow("m1-1", "準決勝B"),
      matchRow("m2-0", "決勝"),
    ];

    const result = buildResultRows(
      named,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(asMatch(result[2]).slots[0]).toEqual({
      label: "準決勝Aの勝者",
      entryId: null,
    });
  });
```

呼び出し元の期待値を直す:

| ファイル | 変更内容 |
|---|---|
| `src/features/division/match-name-view.test.ts` | import に `import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";`、「位置の文言と対戦カードを載せる」の `matchName: "1",` → `matchName: DEFAULT_MATCH_NAME,` |
| `src/features/division/round-robin/view.test.ts` | import に `import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";`、「対戦がある組には試合名が入り、左右対称になる」の 2 つの `matchName: "1"` → `matchName: DEFAULT_MATCH_NAME`、コメント `// e1 vs e4 は第1試合 = 通し番号 1。` → `// 展開済みの名前を渡していないので、保存されているテンプレートのまま。` |
| `src/components/division/LeagueSetup.test.tsx` | import に `import { overallSeqKey } from "@/lib/division/overall-order";`、`props.overallSeq` を `new Map([[overallSeqKey("d1", "r1-0"), 1]])` にし、`.toHaveValue("1")` → `.toHaveValue("第1試合")` |
| `src/features/division/set-match-name/repository.test.ts` | コメント `// e1 vs e2 の 1 試合だけの組み合わせ（matchName "1"）` → `// e1 vs e2 の 1 試合だけの組み合わせ（matchName は既定のテンプレート）` |

- [ ] **Step 3: テストを走らせて落ちることを確かめる**

Run: `pnpm exec vitest run src/features/division src/lib/division src/features/schedule src/components/division/LeagueSetup.test.tsx`
Expected: FAIL（生成と補完が `"1"` などを返す、`createSlotLabeler` が `第3試合` を `第第3試合試合の勝者` にする、カードが `第準決勝試合の勝者` になる）

- [ ] **Step 4: 生成と読み出しの既定値を差し替える**

`src/features/division/single-elimination/build.ts` — import に `import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";` を足し、2 箇所の `matchName: String(matches.length + 1),` を `matchName: DEFAULT_MATCH_NAME,` にする。

`src/features/division/round-robin/build.ts` — import に `import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";` を足し、`matchName: String(order + 1),` を `matchName: DEFAULT_MATCH_NAME,` にする。

`src/lib/division/parse.ts` — import に `import { DEFAULT_MATCH_NAME } from "./match-name";` を足し、`fillMatchNames` を丸ごと差し替える:

```ts
/**
 * matchName の無い試合（改名前に保存された旧データ）へ既定のテンプレートを入れる。
 *
 * 旧 matchNumber の値は読み継がない。リテラルの番号を残すと、その部門だけが
 * 進行順の並べ替えに追従しなくなり、新しく作った部門と挙動が分かれるため。
 * データ移行を行わない代わりに、読み出しが必ず完全な形へ正規化する。
 */
const fillMatchNames = (matches: ParsedBracketMatch[]): BracketMatch[] =>
  matches.map((match) =>
    match.matchName === undefined
      ? { ...match, matchName: DEFAULT_MATCH_NAME }
      : (match as BracketMatch),
  );
```

`src/lib/division/types.ts` の `BracketMatch.matchName` のコメント:

```ts
  /**
   * 表示用の試合名のテンプレート。{{OverallSeq}}（大会の進行順の通し番号）を使える。
   * 部門内で重複してよい（既定値は全試合で同じ文字列になる）
   */
  matchName: string;
```

- [ ] **Step 5: スロットの文言を展開済みの名前基準にする**

`src/lib/division/label.ts` — import を `import type { BracketMatch, DivisionEntries, SlotSource } from "./types";` にし、`createSlotLabeler` を差し替える:

```ts
/**
 * スロットの表示文字列を作る関数を返す。
 *
 * 部門の試合名一覧（features/division）と大会の試合一覧（features/schedule）が
 * 同じ文言を出す必要がある。features は同列どうし依存できないため、
 * 両方から参照できる下位共通層のここへ置く。
 *
 * 第 1 引数が展開済みの試合名の表なのは、{{OverallSeq}} が大会全体を
 * 見ないと決まらないため。この関数は部門しか知らないので自分では展開できない。
 * 「第◯試合」の飾りを付けないのも同じ理由で、名前の形は試合名そのものが
 * 決める（既定値なら「第1試合の勝者」になる）。
 *
 * 名前を引けなかった entry は「（不明な参加者）」にして落とさない。
 * 参加者一覧が古いだけでも一覧は読めた方がよい。bye と書き分けるのは、
 * 引けないだけのスロットを「不戦勝」と出すとブラケットの読み違いになるため。
 */
export const createSlotLabeler = (
  matchNames: ReadonlyMap<string, string>,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): SlotLabeler => {
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const nameByEntryId = new Map(
    entries.entries.map((entry) => [
      entry.id,
      participantById.get(entry.participantId) ?? null,
    ]),
  );

  return (slot) => {
    switch (slot.kind) {
      case "entry":
        return nameByEntryId.get(slot.entryId) ?? "（不明な参加者）";
      case "winnerOf":
        return `${matchNames.get(slot.matchId) ?? "?"}の勝者`;
      case "loserOf":
        return `${matchNames.get(slot.matchId) ?? "?"}の敗者`;
      case "bye":
        return "BYE";
    }
  };
};
```

- [ ] **Step 6: `createSlotLabeler` の呼び出し 3 箇所を直す**

`src/features/division/match-name-view.ts` の `toMatchOrderView`:

```ts
  const labelSlot = createSlotLabeler(matchNames, entries, participants);
```

`src/features/schedule/domain.ts` — import の `import { renderMatchName } from "@/lib/division/match-name";` を `import { resolveMatchNames } from "@/lib/division/match-name";` にし、`buildMatchRows` の部門ループを差し替える:

```ts
  for (const division of divisions) {
    // 行の試合名とカードの「◯◯の勝者」が同じ展開結果を使うよう、部門ごとに 1 回だけ作る。
    const matchNames = resolveMatchNames(
      division.matchingConfig,
      division.id,
      overallSeq,
    );
    const labelSlot = createSlotLabeler(
      matchNames,
      division.entries,
      participants,
    );

    for (const match of division.matchingConfig.matches) {
      const seq = overallSeq.get(overallSeqKey(division.id, match.id)) ?? 0;
      rows.push({
        seq,
        row: {
          kind: "match",
          key: matchKey(division.id, match.id),
          divisionId: division.id,
          divisionName: division.name,
          matchId: match.id,
          matchName: matchNames.get(match.id) ?? match.matchName,
          label: matchPositionLabel(match, division.format),
          card: matchCardLabel(match, labelSlot),
        },
      });
    }
  }
```

`src/features/schedule/result-rows.ts` の `buildResultRows` の冒頭（`const context = …` の前）に名前の表を作り、`labelSlot` をそれで作る:

```ts
export const buildResultRows = (
  rows: ScheduleRowView[],
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
): ResultRowView[] => {
  // 展開済みの試合名は進行順の行（buildScheduleView の出力）が既に持っている。
  // 行は大会の全試合を含むので、部門ごとの「試合 id → 表示名」に組み直して
  // スロットの文言（「第3試合の勝者」）もそれで作る。通し番号をここで
  // 計算し直すと、進行順の一覧と結果入力で規則が 2 本になるため。
  const namesByDivision = new Map<string, Map<string, string>>();
  for (const row of rows) {
    if (row.kind !== "match") {
      continue;
    }
    const names = namesByDivision.get(row.divisionId) ?? new Map();
    names.set(row.matchId, row.matchName);
    namesByDivision.set(row.divisionId, names);
  }

  const context = new Map(
    divisions.map((division) => [
      division.id,
      {
        division,
        resolved: resolveMatchSlots(division.matchingConfig, division.results),
        labelSlot: createSlotLabeler(
          namesByDivision.get(division.id) ?? new Map<string, string>(),
          division.entries,
          participants,
        ),
```

（`recorded` 以降の項目と、`return rows.flatMap(…)` は変えない）

- [ ] **Step 7: テストと型を通す**

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし

Run: `pnpm test`
Expected: 全件 PASS

- [ ] **Step 8: コミット**

```bash
git add -A
```

```bash
git commit -m "feat(division): 試合名の既定値を 第{{OverallSeq}}試合 にする" -m "生成と読み出しの既定値をテンプレートに切り替え、旧 matchNumber は読み継がない。スロットの文言は展開済みの試合名に「の勝者／の敗者」を付ける形にする。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 試合名の保存の検証とプレビュー

元の計画の Task 8 から、重複チェックの撤去（Task 7 に移した）を除き、変数の説明を `{{OverallSeq}}` だけにしたもの。

**Files:**
- Modify: `src/features/division/set-match-name/schema.ts`
- Modify: `src/features/division/match-name-view.ts`
- Modify: `src/components/division/MatchNameRow.tsx`
- Modify: `src/components/division/MatchOrderList.tsx`
- Test: `src/features/division/set-match-name/schema.test.ts`、`src/features/division/set-match-name/handler.test.ts`、`src/features/division/match-name-view.test.ts`、`src/components/division/MatchOrderList.test.tsx`、`src/components/division/DivisionSetup.test.tsx`、`src/components/division/LeagueSetup.test.tsx`

**Interfaces:**
- Consumes: `MatchNameRowView`、`DEFAULT_MATCH_NAME`
- Produces:
  - `setMatchNameSchema` — `{ matchId: string; matchName: string }`。`matchName` は trim 済み・1〜100 文字・`Mustache.parse` で構文解析できる
  - `MatchNameRowView` = `{ matchId: string; template: string; matchName: string; label: string; card: string }`

- [ ] **Step 1: スキーマの失敗テストを書く**

`src/features/division/set-match-name/schema.test.ts` を丸ごと置き換える:

```ts
import { describe, expect, it } from "vitest";
import { setMatchNameSchema } from "./schema";

const parse = (matchName: string, matchId = "m1-0") =>
  setMatchNameSchema.safeParse({ matchId, matchName });

describe("setMatchNameSchema", () => {
  it("前後の空白を落として受け付ける", () => {
    const result = parse("  決勝  ");

    expect(result.success && result.data.matchName).toBe("決勝");
  });

  it("変数を含む文字列を受け付ける", () => {
    expect(parse("第{{OverallSeq}}試合").success).toBe(true);
  });

  it("空白だけの試合名を拒む", () => {
    const result = parse("   ");

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      "試合名を入力してください",
    );
  });

  it("100 文字までは受け付ける", () => {
    expect(parse("あ".repeat(100)).success).toBe(true);
  });

  it("100 文字を超える試合名を拒む", () => {
    const result = parse("あ".repeat(101));

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      "試合名は100文字以内で入力してください",
    );
  });

  it("閉じ忘れた区画を拒む", () => {
    const result = parse("{{#a}}第1試合");

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      "試合名の書き方が正しくありません",
    );
  });

  it("知らない変数は拒まない（展開時に空文字になる）", () => {
    expect(parse("第{{Foo}}試合").success).toBe(true);
  });

  it("matchId が空なら拒む", () => {
    expect(parse("決勝", "").success).toBe(false);
  });
});
```

`src/features/division/set-match-name/handler.test.ts` の `describe` の末尾（「部門が無ければ 404 にする」の前）に足す:

```ts
  it("試合名の書き方が正しくなければ文言を返し、保存しない", async () => {
    const state = await setMatchNameAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("m1", "{{#a}}第1試合"),
    );

    expect(state.error).toBe("試合名の書き方が正しくありません");
    expect(setMatchNameInDb).not.toHaveBeenCalled();
  });
```

Run: `pnpm exec vitest run src/features/division/set-match-name`
Expected: FAIL（21〜100 文字が拒まれる、閉じ忘れが通る）

- [ ] **Step 2: スキーマを書き換える**

`src/features/division/set-match-name/schema.ts` を丸ごと置き換える:

```ts
import Mustache from "mustache";
import { z } from "zod";

/**
 * mustache として読める文字列かどうか。閉じ忘れた区画（{{#a}} だけ など）は
 * 展開時に例外になり、画面ではテンプレートがそのまま出てしまう。保存の前に
 * 弾いて、書いた人がその場で気づけるようにする。
 * 知らない変数は mustache の既定どおり空文字に展開されるだけなので弾かない。
 */
const isParsableTemplate = (value: string): boolean => {
  try {
    Mustache.parse(value);
    return true;
  } catch {
    return false;
  }
};

export const setMatchNameSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  matchName: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "試合名を入力してください")
        // 数える対象は展開後ではなくテンプレートそのもの。展開後の長さは
        // 通し番号の桁数で変わり、保存できるかどうかが後から変わってしまう。
        .max(100, "試合名は100文字以内で入力してください")
        .refine(isParsableTemplate, "試合名の書き方が正しくありません"),
    ),
});

export type SetMatchNameInput = z.infer<typeof setMatchNameSchema>;
```

Run: `pnpm exec vitest run src/features/division/set-match-name`
Expected: PASS

- [ ] **Step 3: 行に生のテンプレートを載せる失敗テストを書く**

`src/features/division/match-name-view.test.ts`:
- 「位置の文言と対戦カードを載せる」の期待値を次にする:

```ts
    expect(row).toEqual({
      matchId: "m1-0",
      template: DEFAULT_MATCH_NAME,
      matchName: DEFAULT_MATCH_NAME,
      label: "1回戦 (1)",
      card: "山田 vs 佐藤",
    });
```

- `describe` の末尾に足す:

```ts
  it("template には保存されているテンプレートを、matchName には展開後の名前を載せる", () => {
    const [row] = toMatchOrderView(
      config,
      entries,
      participants,
      "SINGLE_ELIMINATION",
      new Map([["m1-0", "第9試合"]]),
    );

    expect(row.template).toBe(DEFAULT_MATCH_NAME);
    expect(row.matchName).toBe("第9試合");
  });
```

`src/components/division/MatchOrderList.test.tsx` を丸ごと置き換える:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MatchNameRowView } from "@/features/division/match-name-view";
import type { DivisionFormState } from "@/features/division/state";
import { MatchOrderList } from "./MatchOrderList";

const rows: MatchNameRowView[] = [
  {
    matchId: "m1-0",
    template: "第{{OverallSeq}}試合",
    matchName: "第1試合",
    label: "1回戦 (1)",
    card: "山田 vs 佐藤",
  },
  {
    matchId: "m1-1",
    template: "決勝",
    matchName: "決勝",
    label: "1回戦 (2)",
    card: "鈴木 vs 田中",
  },
];

const noop = vi.fn(async () => ({ error: null }));

const renderList = (list: MatchNameRowView[]) =>
  render(
    <MatchOrderList
      rows={list}
      slug="acme"
      tournamentId="t1"
      divisionId="d1"
      setMatchNameAction={noop}
      emptyMessage="まだ組み合わせがありません"
    />,
  );

describe("MatchOrderList", () => {
  it("渡された順に行を出す", () => {
    renderList(rows);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1回戦 (1)");
    expect(items[0]).toHaveTextContent("山田 vs 佐藤");
    expect(items[1]).toHaveTextContent("1回戦 (2)");
  });

  it("入力欄にはテンプレートを、隣には展開後の名前を出す", () => {
    renderList(rows);

    expect(screen.getByLabelText("1回戦 (1)の試合名")).toHaveValue(
      "第{{OverallSeq}}試合",
    );
    expect(screen.getByText("第1試合")).toBeInTheDocument();
  });

  it("行の保存で matchId と入力した試合名が送られる", async () => {
    // MatchNameRow の hidden input の name（slug/tournamentId/divisionId/matchId）と
    // 入力欄の name（matchName）を、一覧側の props に合わせて配線したままで
    // あることを確かめる。ここが無いと、行側が名前を書き換えても検知できない。
    const setMatchNameAction = vi.fn(
      async (_state: DivisionFormState, _data: FormData) => ({ error: null }),
    );
    const user = userEvent.setup();
    render(
      <MatchOrderList
        rows={[rows[0]]}
        slug="acme"
        tournamentId="t1"
        divisionId="d1"
        setMatchNameAction={setMatchNameAction}
        emptyMessage="まだ組み合わせがありません"
      />,
    );

    const input = screen.getByLabelText("1回戦 (1)の試合名");
    await user.clear(input);
    await user.type(input, "A");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const sent = setMatchNameAction.mock.calls[0][1];
    expect(sent.get("matchId")).toBe("m1-0");
    expect(sent.get("matchName")).toBe("A");
    expect(sent.get("slug")).toBe("acme");
    expect(sent.get("tournamentId")).toBe("t1");
    expect(sent.get("divisionId")).toBe("d1");
  });

  it("位置の文言が空の行（リーグ）は対戦カードで入力欄を名付け、位置の行を出さない", () => {
    renderList([
      {
        matchId: "r1-0",
        template: "第{{OverallSeq}}試合",
        matchName: "第3試合",
        label: "",
        card: "山田 vs 田中",
      },
    ]);

    expect(screen.getByLabelText("山田 vs 田中の試合名")).toHaveValue(
      "第{{OverallSeq}}試合",
    );
    // 行の中の段落は対戦カードの 1 つだけ（プレビューは段落ではない）。
    expect(screen.getByRole("listitem").querySelectorAll("p")).toHaveLength(1);
  });

  it("並べ替えの操作を出さない", () => {
    renderList(rows);

    expect(screen.queryByRole("button", { name: /並べ替え/ })).toBeNull();
    expect(screen.queryByText(/ドラッグ/)).toBeNull();
  });

  it("使える変数は {{OverallSeq}} だけを説明する", () => {
    renderList(rows);

    expect(screen.getByText(/\{\{OverallSeq\}\}/)).toBeInTheDocument();
    expect(screen.queryByText(/DivisionSeq/)).toBeNull();
  });

  it("行が無ければ渡された文言を出す", () => {
    renderList([]);

    expect(screen.getByText("まだ組み合わせがありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
```

`src/components/division/DivisionSetup.test.tsx` の「overallSeq から展開した試合名を実施順の入力欄に出す」のテストを、名前と期待値を変えて差し替える:

```tsx
  it("試合名の入力欄にはテンプレートを、隣には overallSeq で展開した名前を出す", () => {
    // {{OverallSeq}} は大会全体を見ないと決まらないので、resolveMatchNames が
    // overallSeq props から展開した結果が MatchOrderList まで届くことを確かめる。
    render(
      <DivisionSetup
        {...props}
        overallSeq={new Map([[overallSeqKey("d1", "m1-0"), 3]])}
        division={division({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m1-0",
                bracket: "winners",
                round: 1,
                order: 0,
                matchName: "第{{OverallSeq}}試合",
                slots: [{ kind: "bye" }, { kind: "bye" }],
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByLabelText("1回戦 (1)の試合名")).toHaveValue(
      "第{{OverallSeq}}試合",
    );
    expect(screen.getByText("第3試合")).toBeInTheDocument();
  });
```

`src/components/division/LeagueSetup.test.tsx` — import に `import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";` を足し、1 つ目のテストの末尾の `expect(screen.getByLabelText("山田 vs 田中の試合名")).toHaveValue("第1試合");` を差し替える:

```tsx
    expect(screen.getByLabelText("山田 vs 田中の試合名")).toHaveValue(
      DEFAULT_MATCH_NAME,
    );
    // 星取表の左右対称な 2 マスと、編集行のプレビューに同じ名前が出る。
    expect(screen.getAllByText("第1試合")).toHaveLength(3);
```

Run: `pnpm exec vitest run src/features/division/match-name-view.test.ts src/components/division`
Expected: FAIL（`template` が無い、入力欄に展開後の名前が入る、変数の説明が無い）

- [ ] **Step 4: 行の型と組み立てを変える**

`src/features/division/match-name-view.ts` の `MatchNameRowView` と `toMatchOrderView` の返り値:

```ts
export type MatchNameRowView = {
  /** BracketMatch.id。保存時にこの id を送る */
  matchId: string;
  /** 保存されているテンプレート文字列。入力欄の初期値になる */
  template: string;
  /** 展開後の表示名。入力欄の隣にプレビューとして出す */
  matchName: string;
  /** 「1回戦 (1)」のような構造上の位置。リーグは空文字 */
  label: string;
  /** 「山田 vs 佐藤」のような対戦の表示 */
  card: string;
};
```

```ts
  return config.matches.map((match) => ({
    matchId: match.id,
    template: match.matchName,
    // 展開に失敗する経路は無いが、引けなければテンプレートをそのまま出す。
    matchName: matchNames.get(match.id) ?? match.matchName,
    label: matchPositionLabel(match, format),
    card: matchCardLabel(match, labelSlot),
  }));
```

- [ ] **Step 5: 入力欄にプレビューを足す**

`src/components/division/MatchNameRow.tsx` の `<form>` を差し替える:

```tsx
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <input type="hidden" name="matchId" value={row.matchId} />
        {/* 入力欄はテンプレートそのもの。展開後は隣に出して、変数を書いた
            結果がその場で分かるようにする。 */}
        <input
          type="text"
          name="matchName"
          defaultValue={row.template}
          aria-label={`${rowName}の試合名`}
          className="w-48 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <span className="whitespace-nowrap text-xs text-slate-500">
          {row.matchName}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
        >
          保存
        </button>
        {state.error !== null && (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        )}
      </form>
```

`src/components/division/MatchOrderList.tsx` の説明文を差し替える:

```tsx
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        試合名には {"{{OverallSeq}}"}
        を書けます。大会の進行順で何番目の試合かに置き換わり、進行順を並べ替えると番号も振り直されます
      </p>
      <p className="text-xs text-slate-500">
        組み合わせを作り直したときと、トーナメントで 1
        回戦の組み合わせを入れ替えたときは、試合名が既定に戻ります
      </p>
```

- [ ] **Step 6: テストと型を通す**

Run: `pnpm exec vitest run src/features/division src/components/division`
Expected: PASS

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add -A
```

```bash
git commit -m "feat(division): 試合名の保存を検証しプレビューを出す" -m "mustache として読めるかと 100 文字以内かを保存前に確かめる。編集行では入力欄にテンプレート、隣に展開後の名前を出し、使える変数 {{OverallSeq}} を説明する。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 全体の検証と設計資料の更新

**Files:**
- Modify: `docs/code-design/architecture.md`
- 問題が見つかれば該当ファイル

- [ ] **Step 1: 設計資料を更新する**

`docs/code-design/architecture.md` の `## features/schedule` の 2 段落目を差し替える:

変更前:

```markdown
このずれは読み出しの純粋関数 `buildScheduleView` が吸収する。保存された行を
`order` 昇順に並べ、実体の無い行を落とし、行を持たない試合を
「部門の order 昇順 → round 昇順 → order 昇順」で末尾へ足す。読み出しは
副作用を持たず、DB の掃除は次の保存（全行の書き直し）でまとめて片付く。
```

変更後:

```markdown
このずれは読み出しの純粋関数 `buildScheduleView` が吸収する。保存された行を
`order` 昇順に並べ、実体の無い行と二重の行を落とし、行を持たない試合を
「部門の order 昇順 → 部門内の `matches` 配列の順（`parseMatchingConfig` が
round → order に揃えた順）」で末尾へ足す。この並びの規則は
`src/lib/division/overall-order.ts` の `buildOverallSeq` 1 つにまとめてあり、
`buildScheduleView` もそこから並びを得る。読み出しは副作用を持たず、DB の掃除は
次の保存（全行の書き直し）でまとめて片付く。
```

`## features/schedule` の節の末尾（`<input type="datetime-local">` の段落の後、`## features/division/record-result` の前）に節を足す:

```markdown
## 試合名と通し番号

試合番号は大会の進行順の通し番号 `{{OverallSeq}}` だけである。部門の中の実施順は
持たない（`BracketMatch` に `sequence` は無く、部門内で試合を並べ替える操作も無い）。
通し番号は保存せず、`buildOverallSeq` が進行順から毎回算出する。区切り行は数えない。
進行順を並べ替えたり区切りを挿したりすると、表示される番号は自動で振り直される。

`BracketMatch.matchName` は mustache のテンプレートで、既定値は
`"第{{OverallSeq}}試合"`（`lib/division/match-name.ts` の `DEFAULT_MATCH_NAME`）。
部門内で重複してよい。展開は `renderMatchName` / `resolveMatchNames` に集めてあり、
知らない変数は mustache の既定どおり空文字になる。`{{OverallSeq}}` は大会全体を
見ないと決まらないので、試合名を出す画面は大会全体を読んで展開済みの文字列を
受け取る。部門の画面（編集・詳細・公開）は `features/division/repository.ts` の
`listOverallOrderSources`、進行順と結果入力は `features/schedule` の読み出しが
自分の材料から作る。スロットの文言（「第 3 試合の勝者」）も展開済みの名前から作る
（`createSlotLabeler` は展開済みの名前の表を受け取る）。

構造上の位置 `matchPositionLabel` は試合番号と紛れないよう、トーナメントで
`N回戦 (M)`（M はラウンド内の上からの位置）、リーグでは空文字にする。表示側は
`formatDivisionPosition` を通し、空文字なら区切りごと描かない。
```

- [ ] **Step 2: 型を通す**

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: 全テストを通す**

Run: `pnpm test`
Expected: 全件 PASS。実行結果の失敗件数が 0 であることを目で確かめる

- [ ] **Step 4: lint を通す**

Run: `pnpm lint`
Expected: 変更したファイルに内容由来のエラーなし（CRLF だけの指摘は無視）

- [ ] **Step 5: 取り残しが無いことを確かめる**

Run: `grep -rn "matchNumber\|MatchNumber\|match-number\|試合番号" src`
Expected: 何も出ない

Run: `grep -rn "DivisionSeq" src`
Expected: `src/lib/division/match-name.ts`（`MatchNameVars` のコメント）、`src/lib/division/match-name.test.ts`、`src/features/schedule/domain.test.ts`（空文字になることを確かめるテスト）だけ

Run: `grep -rn "sequence" src --include=*.ts --include=*.tsx | grep -v "^src/generated/"`
Expected: `src/lib/division/parse.ts`（捨てる理由のコメント）と `src/lib/division/parse.test.ts`（旧 `sequence` を捨てるテスト）だけ

Run: `grep -rn "reorder-matches\|reorderMatches\|DivisionMatchOrderError\|DivisionMatchNumberConflictError" src docs/code-design`
Expected: 何も出ない

Run: `grep -rn "第\${" src --include=*.ts --include=*.tsx`
Expected: 何も出ない（「第◯試合」を組み立てる箇所が残っていない）

- [ ] **Step 6: ビルドを通す**

Run: `pnpm build`
Expected: 成功

- [ ] **Step 7: 手で動かして確かめる**

`BYPASS_AUTH=1` で `pnpm dev` を起動し、Cookie に `USER_ID=1` を設定する（seed 済みのユーザは組織 `aaaaa` に属する）。複数のワークツリーで dev サーバが動いていることがあるので、ポートは起動ログで確かめる（3000 とは限らない）。

| 画面 | 確認すること |
|---|---|
| 部門セットアップ `/orgs/aaaaa/tournaments/{id}/divisions/{id}/setup` | 見出しが「試合名」、ドラッグのハンドルが無い。入力欄に `第{{OverallSeq}}試合`、隣に「第N試合」。位置は「1回戦 (1)」 |
| 同上 | 1 件を `決勝` にして保存するとプレビューが「決勝」になり、ブラケットのプレビューで下流が「決勝の勝者」と読める |
| 同上 | `{{#a}}` を保存すると「試合名の書き方が正しくありません」が出る |
| リーグ `/orgs/aaaaa/tournaments/{id}/divisions/{id}/league` | 編集行に位置の段落が無く、星取表と編集行のプレビューに同じ試合名が出る |
| 進行順 `/orgs/aaaaa/tournaments/{id}/matches` | 番号が区切りを数えず 1 から並ぶ。行を並べ替えて保存すると番号が振り直される。リーグの行は「部門名」だけで「 / 」が残らない |
| 結果入力 `/orgs/aaaaa/tournaments/{id}/results` | 試合名が進行順と一致し、未確定のスロットが「第N試合の勝者」 |
| 部門詳細 `/orgs/aaaaa/tournaments/{id}/divisions/{id}` | トーナメントはカードに、リーグは結果表のマスに、進行順と同じ番号の試合名が出る |
| 公開の進行順 `/t/{id}/schedule`・公開の部門 `/t/{id}/divisions/{id}` | 管理画面と同じ試合名が出る |

> 進行順の画面がローカルで 500 になる場合、`ScheduleItem` テーブルがローカル DB に無い既知のずれ（マイグレーションは記録済みだがテーブルが無い）。`pnpm db:migrate` で解消する。

- [ ] **Step 8: 設計との突き合わせ**

[改訂の設計書](../specs/2026-09-17-overall-match-number-design.md)の「決定事項」の表と各節を上から読み、実装が一致していることを確かめる。ずれていれば直す。

- [ ] **Step 9: コミット**

```bash
git add -A
```

```bash
git commit -m "docs(architecture): 試合名と大会全体の通し番号を記す" -m "部門内の実施順を持たず、試合番号を進行順の通し番号 {{OverallSeq}} だけにしたことと、展開・位置の文言の置き場所を書く。" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: 完了の報告**

`pnpm exec tsc --noEmit` / `pnpm test` / `pnpm build` の実行結果（件数を含む）と Step 5 の grep の結果を添えて報告する。実行していない検証を「通った」と書かない。

---

## Self-Review

**1. 仕様の網羅**（改訂の設計書の各節 → タスク）

| 設計書の項目 | 実装するタスク |
|---|---|
| 進め方 1: `main` の取り込みと衝突の解消 | Task 1（名前揃え）、Task 2（結果表に展開済みの名前） |
| 進め方 2: 本書の変更と元の計画の Task 6〜9 | Task 2（元 Task 6）、Task 8（元 Task 7）、Task 9（元 Task 8）、Task 10（元 Task 9） |
| 決定事項: 変数は `{{OverallSeq}}` のみ | Task 4 |
| 決定事項: 既定値 `"第{{OverallSeq}}試合"` | Task 4（定数）、Task 8（生成・読み出し） |
| 決定事項: `BracketMatch.sequence` を削除 | Task 6 |
| 決定事項: `reorder-matches` をスライスごと削除 | Task 3 |
| 決定事項: 行を持たない試合は部門 `order` → `matches` 配列の順 | Task 4（テストとコメント）、Task 6（`parse` が round → order に揃える） |
| 通し番号: 保存せず毎回算出、区切りを数えない、並べ替えで振り直す | 元 Task 2・4（コミット済み）、Task 4（並べ替えで振り直すテスト） |
| 部門内の実施順の撤去: 型 / `parse` / `validate` / 生成 | Task 6 |
| 部門内の実施順の撤去: スライス削除、`MatchOrderList` のドラッグ撤去と説明文 | Task 3 |
| `{{DivisionSeq}}` は空文字、旧データは移行せず欠けていれば新しい既定値 | Task 4（空文字）、Task 8（`parse` の補完、旧 `matchNumber` を読まない） |
| `matchPositionLabel`: トーナメント `N回戦 (M)`、リーグ空文字、表示側は描かない | Task 5 |
| `LeagueCrossTable` の「第N試合」を展開済みの名前に | 元 Task 5（コミット 4209ff1 で `cell.matchName` をそのまま描く形に済み）。Task 10 Step 5 の grep で「第◯試合」の組み立てが残っていないことを確かめる |
| スロットの文言「{展開済みの試合名}の勝者／敗者」 | Task 8 |
| 画面: ブラケット | Task 2 |
| 画面: 管理と公開の進行順・結果入力 | 元 Task 4（コミット済み）、Task 5（位置の文言）、Task 8（スロット文言） |
| 画面: リーグの星取表と結果表 | 元 Task 5（星取表）、Task 1・2（結果表） |
| 画面: 部門の編集画面 | 元 Task 5（配線）、Task 3（並べ替え撤去）、Task 9（テンプレート入力とプレビュー） |
| テスト: `overall-order.test.ts`（並べ替えで番号が変わる・区切り・配列順） | Task 4 |
| テスト: `match-name.test.ts`（既定値の展開・`DivisionSeq` が空文字） | Task 4 |
| テスト: `parse.test.ts`（旧 `sequence` / `matchNumber` を無視・round → order） | Task 6、Task 8 |
| テスト: `validate.test.ts`（`sequence` の検査が無い） | Task 6（あわせて重複を許すテストを Task 7） |
| テスト: `label.test.ts`（`N回戦 (M)`・リーグで空文字） | Task 5（スロット文言は Task 8） |
| テスト: 生成に新しい既定値が入り `sequence` を持たない | Task 6（`sequence`）、Task 8（既定値） |
| テスト: `reorder-matches` のテスト削除 | Task 3 |
| テスト: 各コンポーネント・ページで展開済みの名前 | Task 2（結果表・ブラケット・部門ページ）、Task 5（位置の空文字）、Task 9（編集一覧） |
| 最後に `pnpm test`・型検査・lint | Task 10 |
| 元の設計の「保存時の検証（空文字・構文・100 文字）」 | Task 9 |
| 元の設計の「一意制約の撤廃」 | Task 7 |

漏れなし。

**2. プレースホルダの走査**

「適切に」「必要に応じて」「Task N と同様に」だけで済ませた手順は無い。機械的な置換は 3 箇所（Task 1 の `matchNumber` → `matchName`、Task 2 の結果表テストの試合名、Task 6 の `sequence` 行の削除）で、いずれも対象ファイルを列挙し、置換コマンドと、置換で拾えない形の手修正の表と、`pnpm exec tsc --noEmit` と grep による確認を置いている。Task 2 Step 8・9 の「全要素に `overallSeq={noSeq}` を足す」は規則が 1 つで、足し忘れは型検査が必須 props の欠落として報告する。

**3. 型と名前の整合**

- `overallSeqKey` / `buildOverallSeq` / `OverallOrderDivision` — 元 Task 2 で定義。本計画ではシグネチャを変えずコメントだけ直す（Task 4）。
- `DEFAULT_MATCH_NAME` / `MatchNameVars` / `renderMatchName` / `resolveMatchNames` — Task 4 で `MatchNameVars = { OverallSeq: number }` に変更。`resolveMatchNames(config, divisionId, overallSeq)` の引数順は Task 2（`DivisionBracket` / `DivisionMatchingView`）・Task 8（`schedule/domain.ts`）で同じ。
- `listOverallOrderSources(tournamentId): Promise<Map<string, number>>` — 元 Task 5 で定義。Task 2 の 2 ページが同じ形で呼ぶ。
- `toLeagueTableView(config, entries, results, participants, matchNames)` — Task 2 で第 5 引数を追加。呼び出しは `DivisionMatchingView` の 1 箇所で、同じ Task で直す。
- `FromDivisionInput.matchNames` / `DivisionBracket` の `overallSeq` / `DivisionMatchingView` の `overallSeq` — Task 2 で追加し、呼び出し元（`DivisionMatchingView`、`DivisionSetup`、2 ページ）を同じ Task で直す。
- `MatchOrderList` の props から `reorderAction` を外す、`DivisionSetupActions` / `LeagueSetupActions` から `reorderMatches` を外す — Task 3 で型・呼び出し元・テストを同時に直す。
- `matchPositionLabel` の戻り値（リーグ `""`）と `formatDivisionPosition(divisionName, label)` — Task 5 で定義し、同じ Task で表示側 4 部品と `MatchNameRow` を直す。
- `BracketMatch` から `sequence` を外す — Task 6。`sequence` の読み手（`reorder-matches`、`resolveMatchNames` / `buildMatchRows` の `DivisionSeq`、リーグの位置の文言）は Task 3〜5 で先に消えている。
- `createSlotLabeler(matchNames, entries, participants)` — Task 8 で変更。呼び出し 3 箇所（`match-name-view.ts` / `schedule/domain.ts` / `result-rows.ts`）を同じ Task で直す。`buildResultRows` のシグネチャは変えない。
- `DivisionError` から `DivisionMatchOrderError`（Task 3）と `DivisionMatchNumberConflictError`（Task 7）を外す — どちらも `divisionErrorTags` と `messages.ts` の `Match.exhaustive` を同じ Task で直す。
- `MatchNameRowView` — Task 9 で `template` を追加。`MatchNameRow.tsx` が `row.template`（入力欄）と `row.matchName`（プレビュー）を読み、テストの組み立て（`MatchOrderList.test.tsx`）も同じ Task で全件に `template` を持たせる。
- `setMatchNameSchema` — Task 9 で中身を変更。名前は元 Task 3 のまま。
