# 部門エントリーの新種別（他部門の結果を参照する枠）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** シングルエリミネーション部門の 1 回戦スロットに「他部門の試合の勝者/敗者」「他部門リーグの N 位」を置けるようにし、参照先の結果が出たら自動で実選手として表示する。

**Architecture:** `Division.entries`（Json）の 1 要素に省略可能な `source` を足し、誰なのかは保存せず表示のたびに参照先から引き直す。解決は `src/lib/division/entry-source.ts` の純関数に集め（`features/schedule` と `features/division` の両方が使うため、`docs/code-design/architecture.md` の層の規約に従って下位共通層に置く）、画面・公開・印刷・結果入力はそこから受け取った「entryId → 表示名」の表を既存の描画関数へ渡すだけにする。

**Tech Stack:** Next.js（App Router / Server Actions）、TypeScript strict、Prisma 7（PostgreSQL）、Effect（エラー表現）、Zod 4（入力検証）、Vitest + Testing Library、Biome。

## Global Constraints

- パッケージマネージャは **pnpm**。コマンドは `pnpm test` / `pnpm typecheck` / `pnpm lint`。
- 仕様書は `docs/superpowers/specs/2026-09-23-division-entry-source-design.md`。迷ったらこれが正。
- 参照できる範囲は**同じ大会の、自部門以外の部門**だけ。別大会は参照しない。
- 解決結果（誰なのか）は**保存しない**。毎回参照先から引き直す。
- **DB マイグレーションは無い。** `source` を持たない既存データは従来どおり動く。
- 読み出し系の関数は壊れたデータで**例外を投げない**（既存の `src/lib/division/resolve.ts` と同じ思想）。落とさず「未確定」「参照先が見つかりません」に倒す。
- 循環参照は**保存を止めない**。検知したら画面に警告を出すだけ。
- 文言はすべて日本語。仮名・警告文は `entry-source.ts` だけが作り、画面・公開・印刷で同じ文字列を出す。
- コメントは既存ファイルと同じ密度・同じ語り口（「なぜそうしたか」を書く）で日本語。
- 各タスクの最後にコミットする。コミットメッセージは `<type>(<scope>): <英語の要約>` で、末尾に空行 1 つを挟んで次の行を必ず付ける:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- コミットは `git commit -F -` にヒアドキュメントを渡す形で行い、BOM を付けない。

## 用語

- **参加者エントリー** … 従来の `{ id, participantId, seed }`。`source` を持たない。
- **参照エントリー** … `source` を持つエントリー。誰なのかは参照先次第。
- **仮名** … 参照エントリーが未確定のときに出す文字列（「予選リーグA 1位」）。

---

### Task 1: `DivisionEntry` に `source` を足し、読み出しを通す

**Files:**
- Modify: `src/lib/division/types.ts`（`DivisionEntry` と新しい `EntrySource`）
- Modify: `src/lib/division/parse.ts`（`parseDivisionEntry` と検証ヘルパ）
- Modify: `src/lib/division/validate.ts:24-52`
- Modify: `src/lib/division/label.ts:30-37`
- Modify: `src/features/division/round-robin/view.ts:8-18`
- Modify: `src/features/division/round-robin/standings.ts:236-246`
- Modify: `src/features/division/single-elimination/view.ts:43-51`
- Modify: `src/features/bracket/from-division.ts:97-101`
- Modify: `src/features/participant/repository.ts:78-86`
- Modify: `src/components/division/EntryList.tsx:47`
- Modify: `src/components/division/BracketEditorSetup.tsx:79-83`
- Test: `src/lib/division/parse.test.ts`、`src/lib/division/validate.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `type EntrySource = { kind: "matchWinner"; divisionId: string; matchId: string } | { kind: "matchLoser"; divisionId: string; matchId: string } | { kind: "leagueRank"; divisionId: string; rank: number }`
  - `type DivisionEntry = { id: string; participantId?: string; seed: number; source?: EntrySource }`
  - `parseDivisionEntries` が `source` を検証して読む。`participantId` と `source` の両方が無い要素は `DivisionJsonError`。

- [ ] **Step 1: 失敗するテストを書く（parse）**

`src/lib/division/parse.test.ts` の末尾に足す。`DivisionJsonError` は既存の import にあるはずなので無ければ足す。

```ts
describe("parseDivisionEntries の source", () => {
  it("試合の勝者を参照するエントリーを読む", () => {
    const parsed = parseDivisionEntries({
      version: 1,
      entries: [
        {
          id: "e1",
          seed: 0,
          source: { kind: "matchWinner", divisionId: "d2", matchId: "m1" },
        },
      ],
    });

    expect(parsed.entries[0]).toEqual({
      id: "e1",
      seed: 0,
      source: { kind: "matchWinner", divisionId: "d2", matchId: "m1" },
    });
  });

  it("試合の敗者とリーグ順位も読む", () => {
    const parsed = parseDivisionEntries({
      version: 1,
      entries: [
        {
          id: "e1",
          seed: 0,
          source: { kind: "matchLoser", divisionId: "d2", matchId: "m1" },
        },
        {
          id: "e2",
          seed: 1,
          source: { kind: "leagueRank", divisionId: "d3", rank: 2 },
        },
      ],
    });

    expect(parsed.entries.map((entry) => entry.source?.kind)).toEqual([
      "matchLoser",
      "leagueRank",
    ]);
  });

  it("participantId と source のどちらも無い要素は読まない", () => {
    expect(() =>
      parseDivisionEntries({ version: 1, entries: [{ id: "e1", seed: 0 }] }),
    ).toThrow(DivisionJsonError);
  });

  it("知らない kind は読まない", () => {
    expect(() =>
      parseDivisionEntries({
        version: 1,
        entries: [
          { id: "e1", seed: 0, source: { kind: "coinToss", divisionId: "d2" } },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("rank が 0 以下なら読まない", () => {
    expect(() =>
      parseDivisionEntries({
        version: 1,
        entries: [
          {
            id: "e1",
            seed: 0,
            source: { kind: "leagueRank", divisionId: "d3", rank: 0 },
          },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("divisionId が空文字なら読まない", () => {
    expect(() =>
      parseDivisionEntries({
        version: 1,
        entries: [
          {
            id: "e1",
            seed: 0,
            source: { kind: "matchWinner", divisionId: "", matchId: "m1" },
          },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test src/lib/division/parse.test.ts`
Expected: FAIL。`source` が読まれず `toEqual` が合わない、`DivisionJsonError` が投げられない。

- [ ] **Step 3: 型を足す**

`src/lib/division/types.ts` の `DivisionEntry` を差し替える。

```ts
/**
 * エントリーが何に由来するか。未設定 = 従来どおり participantId が実在の
 * 参加者を指す。source 付きのエントリーは、参照先の結果が出るまで誰なのかが
 * 決まらない（決勝トーナメントに「予選リーグAの1位」を置く用途）。
 *
 * 誰なのかは保存しない。表示のたびに参照先から引き直す
 * （lib/division/entry-source.ts）。保存すると、参照先の結果を訂正したときにこちらが
 * 古いまま残るため。
 */
export type EntrySource =
  | { kind: "matchWinner"; divisionId: string; matchId: string }
  | { kind: "matchLoser"; divisionId: string; matchId: string }
  /** rank は 1 始まり。同順位で絞れないときは未確定として扱う */
  | { kind: "leagueRank"; divisionId: string; rank: number };

/** Division.entries の 1 要素。「誰がこの部門に何番シードで出るか」。 */
export type DivisionEntry = {
  /** 部門内で一意。matchingConfig / results はこの id で参照する */
  id: string;
  /** Participant.id。参照エントリー（source 付き）は持たない */
  participantId?: string;
  /** 部門内でのシード順。0 始まり */
  seed: number;
  /** 参照エントリーのときだけ持つ。participantId と両方無い形は parse が弾く */
  source?: EntrySource;
};
```

- [ ] **Step 4: parse を足す**

`src/lib/division/parse.ts` の型 import に `EntrySource` を足し、`asInt` の下に検証ヘルパを置く。

```ts
const asNonEmptyString = (value: unknown, path: string): string => {
  const raw = asString(value, path);
  return raw === "" ? fail(path, "空でない文字列") : raw;
};

/** リーグ順位。1 位から数える。 */
const asRank = (value: unknown, path: string): number => {
  const raw = asInt(value, path);
  return raw < 1 ? fail(path, "1 以上の整数") : raw;
};

const parseEntrySource = (value: unknown, path: string): EntrySource => {
  const record = asRecord(value, path);
  const kind = asString(record.kind, `${path}.kind`);
  switch (kind) {
    case "matchWinner":
    case "matchLoser":
      return {
        kind,
        divisionId: asNonEmptyString(record.divisionId, `${path}.divisionId`),
        matchId: asNonEmptyString(record.matchId, `${path}.matchId`),
      };
    case "leagueRank":
      return {
        kind,
        divisionId: asNonEmptyString(record.divisionId, `${path}.divisionId`),
        rank: asRank(record.rank, `${path}.rank`),
      };
    default:
      return fail(
        `${path}.kind`,
        "matchWinner / matchLoser / leagueRank のいずれか",
      );
  }
};
```

`parseDivisionEntry` を差し替える。

```ts
/**
 * 参加者エントリーと参照エントリーの両方を読む。どちらでもない
 * （participantId も source も無い）要素は、表示も解決もできないので弾く。
 */
const parseDivisionEntry = (value: unknown, path: string): DivisionEntry => {
  const record = asRecord(value, path);
  const entry: DivisionEntry = {
    id: asString(record.id, `${path}.id`),
    seed: asInt(record.seed, `${path}.seed`),
  };
  if (record.participantId !== undefined) {
    entry.participantId = asString(
      record.participantId,
      `${path}.participantId`,
    );
  }
  if (record.source !== undefined && record.source !== null) {
    entry.source = parseEntrySource(record.source, `${path}.source`);
  }
  if (entry.participantId === undefined && entry.source === undefined) {
    return fail(path, "participantId または source");
  }
  return entry;
};
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm test src/lib/division/parse.test.ts`
Expected: PASS

- [ ] **Step 6: 型エラーを一覧する**

Run: `pnpm typecheck`
Expected: FAIL。`participantId` が `string | undefined` になったため、Step 7 に挙げた箇所がエラーになる。ここで出る一覧が直す対象のすべて。

- [ ] **Step 7: 読み出し側を通す（挙動は変えない）**

参照エントリーは、このタスクでは「名前を引けないエントリー」と同じ扱いにする。仮名を出すのは Task 4 以降。

`src/lib/division/label.ts` の `nameByEntryId`:

```ts
  const nameByEntryId = new Map(
    entries.entries.map((entry) => [
      entry.id,
      // 参照エントリー（participantId を持たない）は名前を引けない。
      // 仮名は呼び出し側が entryLabels で渡す（Task 4 で足す）。
      entry.participantId === undefined
        ? null
        : participantById.get(entry.participantId) ?? null,
    ]),
  );
```

`src/features/division/round-robin/view.ts` の `labeledEntries`:

```ts
    .map((entry) => ({
      entryId: entry.id,
      // 名前を引けなくても行は出す。参加者一覧が古いだけで編集不能に
      // なるのは困る。文言は lib/division/label.ts と揃える。
      label:
        (entry.participantId === undefined
          ? undefined
          : nameById.get(entry.participantId)) ?? "（不明な参加者）",
    }));
```

`src/features/division/round-robin/standings.ts` の `labelByEntryId`:

```ts
  const labelByEntryId = new Map(
    sortedBySeed.map((entry) => [
      entry.id,
      (entry.participantId === undefined
        ? undefined
        : nameById.get(entry.participantId)) ?? UNKNOWN_PARTICIPANT_LABEL,
    ]),
  );
```

`src/features/division/single-elimination/view.ts` の `nameByEntryId`:

```ts
  const nameByEntryId = new Map(
    entries.entries.map((entry) => [
      entry.id,
      (entry.participantId === undefined
        ? undefined
        : participantById.get(entry.participantId)) ?? null,
    ]),
  );
```

`src/features/bracket/from-division.ts` の entries ループの先頭:

```ts
    const source =
      entry.participantId === undefined
        ? undefined
        : sourceById.get(entry.participantId);
    if (!source) {
      // エントリーの参照先が欠けている＝データ不整合。描かない。
      // 参照エントリーもここへ来る（名前が無い）。Task 5 で entryLabels を
      // 見るようにするまでは、ブラケットを描かず案内に倒す。
      return null;
    }
```

`src/features/participant/repository.ts` の entries ループの先頭:

```ts
    for (const entry of entries.entries) {
      // 参照エントリーは「この参加者が出る部門」の逆引きに載らない。
      // 誰なのかは参照先次第で、参加者一覧から辿れる関係ではないため。
      if (entry.participantId === undefined) {
        continue;
      }
      const item = { id: division.id, name: division.name };
```

`src/components/division/EntryList.tsx`:

```ts
          const participant =
            entry.participantId === undefined
              ? undefined
              : participantById.get(entry.participantId);
```

`src/components/division/BracketEditorSetup.tsx` の `placedParticipantIds`:

```ts
  const placedParticipantIds = new Set(
    parsed.entries.entries
      .filter((entry) => placedEntryIds.has(entry.id))
      .flatMap((entry) =>
        // 参照エントリーは Member を持たないので候補の絞り込みには効かない
        entry.participantId === undefined ? [] : [entry.participantId],
      ),
  );
```

`src/lib/division/validate.ts` の `validateEntries`（`participantId` を見る 2 か所をまとめて差し替える）:

```ts
  // 参照エントリー（source 付き）は participantId を持たないので、重複検査と
  // 存在検査の対象から外す。同じ参照を二重に置くことの検査は保存側
  // （features/division/assign-slot）が行う。
  const participantIds = list.flatMap((entry) =>
    entry.participantId === undefined ? [] : [entry.participantId],
  );
  for (const participantId of duplicates(participantIds)) {
    errors.push(`同じ参加者が二重にエントリーしています: ${participantId}`);
  }
  for (const seed of duplicates(list.map((entry) => entry.seed))) {
    errors.push(`entries[].seed が重複しています: ${seed}`);
  }

  const known = new Set(existingParticipantIds);
  for (const participantId of participantIds) {
    if (!known.has(participantId)) {
      errors.push(`participantId がこの大会に存在しません: ${participantId}`);
    }
  }
```

- [ ] **Step 8: validate のテストを足す**

`src/lib/division/validate.test.ts` の `validateEntries` の describe に足す。

```ts
  it("参照エントリーは participantId が無くても通す", () => {
    const errors = validateEntries(
      {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          {
            id: "e2",
            seed: 1,
            source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
          },
        ],
      },
      ["p1"],
    );

    expect(errors).toEqual([]);
  });
```

- [ ] **Step 9: 全体を確認する**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: すべて PASS。`pnpm lint` は CRLF 由来の既存の指摘が出ることがある。**このタスクで触ったファイルの中身に対する指摘だけ**を直す。

- [ ] **Step 10: コミット**

```bash
git add src/lib/division src/features src/components
git commit -F - <<'EOF'
feat(division): allow entries to carry a source instead of a participant

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: 順位付けを下位共通層へ下ろし、順位だけを返す関数を足す

`docs/code-design/architecture.md` の「features 同列への依存は禁止」に従う。`features/schedule`（結果入力）と `features/division`（設定画面）の両方が参照の解決を使うため、解決ロジックは `src/lib/division/` に置く。解決はリーグの順位を必要とするので、順位付けの純粋部分もここで下ろす。表示（星取表）は `features` に残す。

**Files:**
- Create: `src/lib/division/standings.ts`（`features/division/round-robin/standings.ts` から純粋部分を移す）
- Create: `src/lib/division/standings.test.ts`
- Modify: `src/features/division/round-robin/standings.ts`（`toLeagueTableView` だけを残し、移した部分は lib から import）

**Interfaces:**
- Consumes: Task 1 の `DivisionEntry`
- Produces（`src/lib/division/standings.ts`）:
  - `type LeagueOutcome = "win" | "loss" | "draw"`
  - `type PlayedMatch = { matchName: string; left: string; right: string; outcome: LeagueOutcome | null }`
  - `type Standing = { entryId: string; seed: number; tally: Tally; headToHead: number; rank: number }`（`Tally = { wins: number; draws: number; losses: number; points: number }`）
  - `flip(outcome: LeagueOutcome): LeagueOutcome`
  - `readMatches(config: MatchingConfig, results: DivisionResults, matchNames: ReadonlyMap<string, string>): PlayedMatch[]`
  - `rankStandings(sortedBySeed: { entryId: string; seed: number }[], matches: PlayedMatch[]): Standing[]`
  - `type LeagueRankRow = { entryId: string; rank: number }`
  - `leagueRankOrder(config: MatchingConfig, entries: DivisionEntries, results: DivisionResults): LeagueRankRow[]`
- `features/division/round-robin/standings.ts` は `LeagueOutcome` を今までどおり export し続ける（`src/components/division/LeagueResultTable.tsx` がそこから import している）。

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/standings.test.ts` を新規作成する。

```ts
import { describe, expect, it } from "vitest";
import { leagueRankOrder } from "./standings";
import type { BracketMatch, MatchResultRecord } from "./types";

const entryMatch = (id: string, left: string, right: string): BracketMatch => ({
  id,
  bracket: "winners",
  round: 1,
  order: 0,
  matchName: id,
  slots: [
    { kind: "entry", entryId: left },
    { kind: "entry", entryId: right },
  ],
});

const entries = {
  version: 1 as const,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
  ],
};

const config = {
  version: 1 as const,
  matches: [
    entryMatch("m1", "e1", "e2"),
    entryMatch("m2", "e1", "e3"),
    entryMatch("m3", "e2", "e3"),
  ],
};

const results = (matches: MatchResultRecord[]) => ({
  version: 1 as const,
  matches,
});

describe("leagueRankOrder", () => {
  it("勝ち数の多い順に順位を付ける", () => {
    expect(
      leagueRankOrder(
        config,
        entries,
        results([
          { matchId: "m1", winnerEntryId: "e1" },
          { matchId: "m2", winnerEntryId: "e1" },
          { matchId: "m3", winnerEntryId: "e2" },
        ]),
      ),
    ).toEqual([
      { entryId: "e1", rank: 1 },
      { entryId: "e2", rank: 2 },
      { entryId: "e3", rank: 3 },
    ]);
  });

  it("勝点・勝ち数・直接対決が並ぶと同順位になる", () => {
    // 1 試合も行われていなければ全員 0 勝で並ぶ
    expect(leagueRankOrder(config, entries, results([]))).toEqual([
      { entryId: "e1", rank: 1 },
      { entryId: "e2", rank: 1 },
      { entryId: "e3", rank: 1 },
    ]);
  });

  it("巴戦は 3 人とも同順位になる", () => {
    expect(
      leagueRankOrder(
        config,
        entries,
        results([
          { matchId: "m1", winnerEntryId: "e1" },
          { matchId: "m2", winnerEntryId: "e3" },
          { matchId: "m3", winnerEntryId: "e2" },
        ]),
      ),
    ).toEqual([
      { entryId: "e1", rank: 1 },
      { entryId: "e2", rank: 1 },
      { entryId: "e3", rank: 1 },
    ]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test src/lib/division/standings.test.ts`
Expected: FAIL。`Cannot find module './standings'`。

- [ ] **Step 3: 純粋部分を lib へ移す**

`src/lib/division/standings.ts` を新規作成し、`src/features/division/round-robin/standings.ts` から次をそのまま移す（**コメントも含めてそのまま運ぶ**）。

- 型 `LeagueOutcome` / `PlayedMatch` / `Tally` / `Standing`
- 定数 `POINTS`
- 関数 `emptyTally` / `flip` / `readMatches` / `tallyAll` / `rankStandings`

移すときに変える点は 2 つだけ。

1. ファイル先頭の import を相対に直す:

```ts
import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "./types";
```

2. `features` 側から使う 5 つを export にする（`LeagueOutcome`、`PlayedMatch`、`Standing`、`flip`、`readMatches`、`rankStandings`）。`POINTS` / `emptyTally` / `tallyAll` / `Tally` はこのファイルの中だけで使うので export しない。ただし `Standing` が `Tally` を含むため `Tally` も export する。

ファイル先頭にこのファイルの役割を書く:

```ts
/**
 * リーグの勝敗集計と順位付け。表示名を扱わない純粋部分だけを置く。
 *
 * 星取表（features/division/round-robin/standings.ts の toLeagueTableView）と、
 * エントリーの参照（「リーグの N 位」）の解決が同じ順位付けを使う必要がある。
 * 後者は features/schedule からも呼ばれ、features どうしは依存できないため、
 * 両方から参照できるここへ下ろしている（lib/division/resolve.ts と同じ向き）。
 */
```

同じファイルの末尾に順位だけを返す関数を足す:

```ts
/** 順位順に並べたエントリー。同順位は同じ rank を持つ（1, 1, 3）。 */
export type LeagueRankRow = { entryId: string; rank: number };

/**
 * 星取表を作らず順位だけを返す。エントリーの参照（「リーグの N 位」）が使う。
 * 表示名は要らないので参加者も試合名も受け取らない。順位付けそのものは
 * 結果表と同じ rankStandings を通すので、画面に出ている順位とずれない。
 */
export const leagueRankOrder = (
  config: MatchingConfig,
  entries: DivisionEntries,
  results: DivisionResults,
): LeagueRankRow[] => {
  const sortedBySeed = [...entries.entries]
    .sort((left, right) => left.seed - right.seed)
    .map((entry) => ({ entryId: entry.id, seed: entry.seed }));
  // 試合名は順位に影響しないので空の表を渡す
  const matches = readMatches(config, results, new Map<string, string>());
  return rankStandings(sortedBySeed, matches).map((standing) => ({
    entryId: standing.entryId,
    rank: standing.rank,
  }));
};
```

- [ ] **Step 4: `features` 側を lib に向ける**

`src/features/division/round-robin/standings.ts` から移した定義を削除し、先頭の import を差し替える。残すのは `LeagueTableCell` / `LeagueTableRow` / `LeagueTableView` / `UNKNOWN_PARTICIPANT_LABEL` / `toLeagueTableView`。

```ts
import {
  flip,
  type LeagueOutcome,
  readMatches,
  rankStandings,
} from "@/lib/division/standings";
import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";

// LeagueResultTable がこのファイルから型を引いているので、そのまま通す。
export type { LeagueOutcome };
```

`toLeagueTableView` の中身は変えない（`readMatches` / `rankStandings` / `flip` の呼び出しはそのまま動く）。

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm test src/lib/division/standings.test.ts src/features/division/round-robin && pnpm typecheck`
Expected: PASS。既存の `src/features/division/round-robin/standings.test.ts` も無修正で通る（公開している `toLeagueTableView` の振る舞いは変えていない）。

- [ ] **Step 6: コミット**

```bash
git add src/lib/division/standings.ts src/lib/division/standings.test.ts src/features/division/round-robin/standings.ts
git commit -F - <<'EOF'
refactor(league): move standings ranking down to lib and expose the order

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```
---

### Task 3: 解決ロジック（この機能の本体）

`features/schedule` からも使うため `src/lib/division/` に置く（Task 2 と同じ理由）。DB は触らず、渡された値だけで決まる純関数にする。

**Files:**
- Create: `src/lib/division/entry-source.ts`
- Test: `src/lib/division/entry-source.test.ts`

**Interfaces:**
- Consumes: Task 1 の `EntrySource` / `DivisionEntry`、Task 2 の `leagueRankOrder`（`src/lib/division/standings.ts`）、既存の `resolveMatchSlots`（`src/lib/division/resolve.ts`）と `matchPositionLabel`（`src/lib/division/label.ts`）
- Produces:
  - `type EntrySourceDivision = { id: string; name: string; format: DivisionFormat; entries: DivisionEntries; matchingConfig: MatchingConfig; results: DivisionResults; matchNames?: ReadonlyMap<string, string> }`
  - `type ResolvedEntry = { state: "resolved"; participantId: string; label: string } | { state: "pending"; label: string } | { state: "ambiguous"; label: string; reason: "tie" | "cycle" } | { state: "broken"; label: string }`
  - `resolveEntrySources(divisions: EntrySourceDivision[]): Map<string, Map<string, ResolvedEntry>>` … 外側のキーが `divisionId`、内側が `entryId`。**参照エントリーだけ**を含む。
  - `entrySourceLabels(resolved: ReadonlyMap<string, ResolvedEntry>, participantNameById: ReadonlyMap<string, string>): Map<string, string>` … entryId → 画面に出す名前。
  - `unresolvedEntryIds(resolved: ReadonlyMap<string, ResolvedEntry>): Set<string>`
  - `entrySourceWarnings(entries: DivisionEntries, resolved: ReadonlyMap<string, ResolvedEntry>, participantNameById: ReadonlyMap<string, string>): string[]`
  - `const BROKEN_SOURCE_LABEL = "（参照先が見つかりません）"`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/entry-source.test.ts` を新規作成する。

```ts
import { describe, expect, it } from "vitest";
import type { DivisionFormat } from "@/generated/prisma/enums";
import type {
  BracketMatch,
  DivisionEntry,
  MatchResultRecord,
} from "./types";
import {
  BROKEN_SOURCE_LABEL,
  type EntrySourceDivision,
  entrySourceLabels,
  entrySourceWarnings,
  resolveEntrySources,
  unresolvedEntryIds,
} from "./entry-source";

const entryMatch = (
  id: string,
  left: string,
  right: string,
  round = 1,
  order = 0,
): BracketMatch => ({
  id,
  bracket: "winners",
  round,
  order,
  matchName: id,
  slots: [
    { kind: "entry", entryId: left },
    { kind: "entry", entryId: right },
  ],
});

const division = (
  id: string,
  name: string,
  format: DivisionFormat,
  entries: DivisionEntry[],
  matches: BracketMatch[],
  records: MatchResultRecord[] = [],
): EntrySourceDivision => ({
  id,
  name,
  format,
  entries: { version: 1, entries },
  matchingConfig: { version: 1, matches },
  results: { version: 1, matches: records },
});

/** 予選トーナメント: e1 vs e2 の 1 試合だけ。 */
const qualifier = (records: MatchResultRecord[] = []) =>
  division(
    "d1",
    "予選トーナメント",
    "SINGLE_ELIMINATION",
    [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
    [entryMatch("m1", "e1", "e2")],
    records,
  );

/** 予選リーグA: 3 人総当たり。 */
const league = (records: MatchResultRecord[] = []) =>
  division(
    "d2",
    "予選リーグA",
    "ROUND_ROBIN",
    [
      { id: "l1", participantId: "p1", seed: 0 },
      { id: "l2", participantId: "p2", seed: 1 },
      { id: "l3", participantId: "p3", seed: 2 },
    ],
    [
      entryMatch("n1", "l1", "l2"),
      entryMatch("n2", "l1", "l3"),
      entryMatch("n3", "l2", "l3"),
    ],
    records,
  );

/** 決勝トーナメント: 参照エントリーだけを持つ。 */
const finalDivision = (entries: DivisionEntry[]) =>
  division("d9", "決勝トーナメント", "SINGLE_ELIMINATION", entries, [
    entryMatch("f1", entries[0].id, entries[1].id),
  ]);

describe("resolveEntrySources", () => {
  it("試合の勝者が決まっていれば参加者に解決する", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      qualifier([{ matchId: "m1", winnerEntryId: "e2" }]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "resolved",
      participantId: "p2",
      label: "予選トーナメント m1の勝者",
    });
    // 参加者エントリーは表に載せない
    expect(resolved.get("d9")?.has("x2")).toBe(false);
  });

  it("勝者が未記録なら pending で仮名を返す", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);
    const resolved = resolveEntrySources([qualifier(), final]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "pending",
      label: "予選トーナメント m1の勝者",
    });
  });

  it("敗者も解決する", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchLoser", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      qualifier([{ matchId: "m1", winnerEntryId: "e1" }]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toMatchObject({
      state: "resolved",
      participantId: "p2",
    });
  });

  it("BYE を含む試合には敗者が生まれないので broken にする", () => {
    const withBye = division(
      "d1",
      "予選トーナメント",
      "SINGLE_ELIMINATION",
      [{ id: "e1", participantId: "p1", seed: 0 }],
      [
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "m1",
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
      ],
    );
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchLoser", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);

    expect(resolveEntrySources([withBye, final]).get("d9")?.get("x1")).toEqual({
      state: "broken",
      label: "予選トーナメント m1の敗者",
    });
  });

  it("リーグの全試合が終わっていれば N 位を解決する", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      league([
        { matchId: "n1", winnerEntryId: "l1" },
        { matchId: "n2", winnerEntryId: "l1" },
        { matchId: "n3", winnerEntryId: "l2" },
      ]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "resolved",
      participantId: "p1",
      label: "予選リーグA 1位",
    });
  });

  it("リーグの試合が残っていれば pending にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      league([{ matchId: "n1", winnerEntryId: "l1" }]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "pending",
      label: "予選リーグA 1位",
    });
  });

  it("同順位で絞れなければ ambiguous にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    // 全員 1 勝 1 敗で巴戦になり 3 人が同じ 1 位になる
    const resolved = resolveEntrySources([
      league([
        { matchId: "n1", winnerEntryId: "l1" },
        { matchId: "n2", winnerEntryId: "l3" },
        { matchId: "n3", winnerEntryId: "l2" },
      ]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "ambiguous",
      label: "予選リーグA 1位",
      reason: "tie",
    });
  });

  it("エントリー数より大きい順位は broken にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 9 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      league([
        { matchId: "n1", winnerEntryId: "l1" },
        { matchId: "n2", winnerEntryId: "l1" },
        { matchId: "n3", winnerEntryId: "l2" },
      ]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")?.state).toBe("broken");
  });

  it("参照先の部門が無ければ broken にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "missing", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);

    expect(resolveEntrySources([final]).get("d9")?.get("x1")).toEqual({
      state: "broken",
      label: BROKEN_SOURCE_LABEL,
    });
  });

  it("参照先がリーグでなければ順位を引けないので broken にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d1", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);

    expect(
      resolveEntrySources([qualifier(), final]).get("d9")?.get("x1")?.state,
    ).toBe("broken");
  });

  it("多段の参照（予選 → 中間 → 決勝）を辿る", () => {
    const middle = division(
      "d5",
      "中間トーナメント",
      "SINGLE_ELIMINATION",
      [
        {
          id: "y1",
          seed: 0,
          source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
        },
        { id: "y2", participantId: "p7", seed: 1 },
      ],
      [entryMatch("g1", "y1", "y2")],
      [{ matchId: "g1", winnerEntryId: "y1" }],
    );
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d5", matchId: "g1" },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      qualifier([{ matchId: "m1", winnerEntryId: "e1" }]),
      middle,
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "resolved",
      participantId: "p1",
      label: "中間トーナメント g1の勝者",
    });
  });

  it("循環していても止まらず cycle を返す", () => {
    const a = division(
      "da",
      "部門A",
      "SINGLE_ELIMINATION",
      [
        {
          id: "a1",
          seed: 0,
          source: { kind: "matchWinner", divisionId: "db", matchId: "mb" },
        },
        { id: "a2", participantId: "p1", seed: 1 },
      ],
      [entryMatch("ma", "a1", "a2")],
      [{ matchId: "ma", winnerEntryId: "a1" }],
    );
    const b = division(
      "db",
      "部門B",
      "SINGLE_ELIMINATION",
      [
        {
          id: "b1",
          seed: 0,
          source: { kind: "matchWinner", divisionId: "da", matchId: "ma" },
        },
        { id: "b2", participantId: "p2", seed: 1 },
      ],
      [entryMatch("mb", "b1", "b2")],
      [{ matchId: "mb", winnerEntryId: "b1" }],
    );

    const resolved = resolveEntrySources([a, b]);

    expect(resolved.get("da")?.get("a1")).toEqual({
      state: "ambiguous",
      label: "部門B mbの勝者",
      reason: "cycle",
    });
  });

  it("展開済みの試合名があれば仮名に使う", () => {
    const named: EntrySourceDivision = {
      ...qualifier([{ matchId: "m1", winnerEntryId: "e1" }]),
      matchNames: new Map([["m1", "第5試合"]]),
    };
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);

    expect(resolveEntrySources([named, final]).get("d9")?.get("x1")?.label).toBe(
      "予選トーナメント 第5試合の勝者",
    );
  });
});

describe("entrySourceLabels", () => {
  it("解決済みは参加者名、未確定は仮名を返す", () => {
    const resolved = new Map([
      [
        "x1",
        { state: "resolved" as const, participantId: "p1", label: "仮名1" },
      ],
      ["x2", { state: "pending" as const, label: "予選リーグA 2位" }],
    ]);

    expect(
      entrySourceLabels(resolved, new Map([["p1", "山田太郎"]])),
    ).toEqual(
      new Map([
        ["x1", "山田太郎"],
        ["x2", "予選リーグA 2位"],
      ]),
    );
  });
});

describe("unresolvedEntryIds", () => {
  it("解決できていない entryId だけを返す", () => {
    const resolved = new Map([
      [
        "x1",
        { state: "resolved" as const, participantId: "p1", label: "仮名1" },
      ],
      ["x2", { state: "pending" as const, label: "仮名2" }],
      ["x3", { state: "broken" as const, label: "仮名3" }],
    ]);

    expect(unresolvedEntryIds(resolved)).toEqual(new Set(["x2", "x3"]));
  });
});

describe("entrySourceWarnings", () => {
  it("同順位・循環・参照先なしを文言にする", () => {
    const entries = {
      version: 1 as const,
      entries: [
        {
          id: "x1",
          seed: 0,
          source: {
            kind: "leagueRank" as const,
            divisionId: "d2",
            rank: 1,
          },
        },
        {
          id: "x2",
          seed: 1,
          source: {
            kind: "matchWinner" as const,
            divisionId: "d3",
            matchId: "m1",
          },
        },
      ],
    };
    const resolved = new Map([
      [
        "x1",
        {
          state: "ambiguous" as const,
          label: "予選リーグA 1位",
          reason: "tie" as const,
        },
      ],
      ["x2", { state: "broken" as const, label: BROKEN_SOURCE_LABEL }],
    ]);

    expect(entrySourceWarnings(entries, resolved, new Map())).toEqual([
      "予選リーグA 1位 は同順位のため決まりません",
      "参照先が見つからない枠があります",
    ]);
  });

  it("同じ人が 2 つの枠に入っていたら知らせる", () => {
    const entries = {
      version: 1 as const,
      entries: [
        { id: "x1", participantId: "p1", seed: 0 },
        {
          id: "x2",
          seed: 1,
          source: {
            kind: "leagueRank" as const,
            divisionId: "d2",
            rank: 1,
          },
        },
      ],
    };
    const resolved = new Map([
      [
        "x2",
        { state: "resolved" as const, participantId: "p1", label: "予選リーグA 1位" },
      ],
    ]);

    expect(
      entrySourceWarnings(entries, resolved, new Map([["p1", "山田太郎"]])),
    ).toEqual(["山田太郎 が 2 つの枠に入っています"]);
  });

  it("問題が無ければ空を返す", () => {
    expect(
      entrySourceWarnings({ version: 1, entries: [] }, new Map(), new Map()),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test src/lib/division/entry-source.test.ts`
Expected: FAIL。`Cannot find module './entry-source'`。

- [ ] **Step 3: 実装する**

`src/lib/division/entry-source.ts` を新規作成する。

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
import { matchPositionLabel } from "./label";
import { type ResolvedMatch, resolveMatchSlots } from "./resolve";
import { type LeagueRankRow, leagueRankOrder } from "./standings";
import type {
  DivisionEntries,
  DivisionResults,
  EntrySource,
  MatchingConfig,
} from "./types";

/**
 * 解決に使う 1 部門ぶんのスナップショット。DB は触らず、渡された値だけで決まる。
 * 同じ大会の全部門を配列で渡すこと（参照は大会の中だけで閉じる）。
 */
export type EntrySourceDivision = {
  id: string;
  name: string;
  format: DivisionFormat;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
  results: DivisionResults;
  /** 展開済みの試合名（試合 id → 表示名）。無ければ位置ラベルで代用する */
  matchNames?: ReadonlyMap<string, string>;
};

/**
 * 参照エントリー 1 件の解決結果。resolved 以外は「まだ誰でもない」。
 * label はそのまま画面に出す文字列で、状態によらず「この枠が何か」を表す。
 */
export type ResolvedEntry =
  | { state: "resolved"; participantId: string; label: string }
  | { state: "pending"; label: string }
  | { state: "ambiguous"; label: string; reason: "tie" | "cycle" }
  | { state: "broken"; label: string };

/** 参照先の部門・試合が消えている枠の表示。 */
export const BROKEN_SOURCE_LABEL = "（参照先が見つかりません）";

// 文言は label.ts と揃える
const UNKNOWN_PARTICIPANT_LABEL = "（不明な参加者）";

/**
 * 仮名。画面・公開・印刷・結果入力が同じ文字列を出すよう、ここだけが作る。
 *
 * 試合名は展開済みのもの（{{OverallSeq}} 入り）を優先する。無ければ位置
 * （「2回戦 (1)」）、位置を持たないリーグではテンプレートをそのまま出す。
 */
const sourceLabel = (
  source: EntrySource,
  target: EntrySourceDivision,
): string => {
  if (source.kind === "leagueRank") {
    return `${target.name} ${source.rank}位`;
  }
  const match = target.matchingConfig.matches.find(
    (item) => item.id === source.matchId,
  );
  if (match === undefined) {
    return BROKEN_SOURCE_LABEL;
  }
  const position = matchPositionLabel(match, target.format);
  const name =
    target.matchNames?.get(source.matchId) ??
    (position === "" ? match.matchName : position);
  return `${target.name} ${name}の${
    source.kind === "matchWinner" ? "勝者" : "敗者"
  }`;
};

/**
 * 参照エントリーを実在の参加者まで辿る。
 *
 * 部門をまたぐ参照はこの関数の中で再帰する（予選 → 中間 → 決勝）。訪問中の
 * エントリーへ戻ってきたら循環として打ち切る。読み出しで止まらないことが
 * 第一で、循環しているデータそのものは保存を拒否しない（警告だけ出す）。
 */
export const resolveEntrySources = (
  divisions: EntrySourceDivision[],
): Map<string, Map<string, ResolvedEntry>> => {
  const divisionById = new Map(
    divisions.map((division) => [division.id, division]),
  );
  // 部門ごとに 1 度だけ作って使い回す。エントリーごとに作り直すと
  // 試合数に対して二乗に近い計算量になる。
  const matchResolutions = new Map<string, Map<string, ResolvedMatch>>();
  const leagueRanks = new Map<string, LeagueRankRow[]>();
  const memo = new Map<string, ResolvedEntry>();
  const visiting = new Set<string>();

  const cacheKey = (divisionId: string, entryId: string): string =>
    `${divisionId}:${entryId}`;

  const matchResolution = (
    target: EntrySourceDivision,
  ): Map<string, ResolvedMatch> => {
    const cached = matchResolutions.get(target.id);
    if (cached !== undefined) {
      return cached;
    }
    const resolved = resolveMatchSlots(target.matchingConfig, target.results);
    matchResolutions.set(target.id, resolved);
    return resolved;
  };

  const leagueRank = (target: EntrySourceDivision): LeagueRankRow[] => {
    const cached = leagueRanks.get(target.id);
    if (cached !== undefined) {
      return cached;
    }
    const rows = leagueRankOrder(
      target.matchingConfig,
      target.entries,
      target.results,
    );
    leagueRanks.set(target.id, rows);
    return rows;
  };

  /**
   * リーグの順位は全試合が終わるまで暫定。途中の順位で確定させると、
   * 残りの試合でひっくり返ったときに決勝の組み合わせが黙って変わる。
   */
  const leagueFinished = (target: EntrySourceDivision): boolean => {
    const recorded = new Set(
      target.results.matches.map((record) => record.matchId),
    );
    return target.matchingConfig.matches.every((match) =>
      recorded.has(match.id),
    );
  };

  /**
   * 辿り着いた先のエントリーを participantId まで開く。先が参照エントリー
   * ならさらに再帰する。label は呼び出し元の枠の仮名で、先が未確定でも
   * 「この枠が何か」の説明は変えない。
   */
  const followEntry = (
    target: EntrySourceDivision,
    entryId: string,
    label: string,
  ): ResolvedEntry => {
    const entry = target.entries.entries.find((item) => item.id === entryId);
    if (entry === undefined) {
      return { state: "broken", label };
    }
    if (entry.source === undefined) {
      return entry.participantId === undefined
        ? { state: "broken", label }
        : { state: "resolved", participantId: entry.participantId, label };
    }
    const inner = resolveSourceEntry(target, entry.id, entry.source);
    switch (inner.state) {
      case "resolved":
        return {
          state: "resolved",
          participantId: inner.participantId,
          label,
        };
      case "ambiguous":
        return { state: "ambiguous", label, reason: inner.reason };
      case "pending":
        return { state: "pending", label };
      case "broken":
        return { state: "broken", label };
    }
  };

  const computeSourceEntry = (source: EntrySource): ResolvedEntry => {
    const target = divisionById.get(source.divisionId);
    if (target === undefined) {
      // 参照先の部門が削除された、または大会をまたぐ壊れた参照
      return { state: "broken", label: BROKEN_SOURCE_LABEL };
    }
    const label = sourceLabel(source, target);

    if (source.kind === "leagueRank") {
      // /edit で形式を書き換えた部門。順位という概念が無い
      if (target.format !== "ROUND_ROBIN") {
        return { state: "broken", label };
      }
      if (
        target.matchingConfig.matches.length === 0 ||
        !leagueFinished(target)
      ) {
        return { state: "pending", label };
      }
      const hits = leagueRank(target).filter((row) => row.rank === source.rank);
      if (hits.length === 0) {
        // エントリー数より大きい順位を指している
        return { state: "broken", label };
      }
      if (hits.length > 1) {
        return { state: "ambiguous", label, reason: "tie" };
      }
      return followEntry(target, hits[0].entryId, label);
    }

    const resolved = matchResolution(target).get(source.matchId);
    if (resolved === undefined) {
      return { state: "broken", label };
    }
    if (source.kind === "matchWinner") {
      return resolved.winnerEntryId === null
        ? { state: "pending", label }
        : followEntry(target, resolved.winnerEntryId, label);
    }
    // 敗者。BYE を含む試合は不戦勝なので敗者が生まれない
    if (resolved.slots.some((slot) => slot.state === "bye")) {
      return { state: "broken", label };
    }
    if (resolved.winnerEntryId === null) {
      return { state: "pending", label };
    }
    const loser = resolved.slots.find(
      (slot) =>
        slot.state === "entry" && slot.entryId !== resolved.winnerEntryId,
    );
    return loser === undefined || loser.state !== "entry"
      ? { state: "pending", label }
      : followEntry(target, loser.entryId, label);
  };

  const resolveSourceEntry = (
    division: EntrySourceDivision,
    entryId: string,
    source: EntrySource,
  ): ResolvedEntry => {
    const key = cacheKey(division.id, entryId);
    const cached = memo.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(key)) {
      // 自分へ戻ってきた。label は呼び出し元が自分の仮名で上書きする
      return { state: "ambiguous", label: BROKEN_SOURCE_LABEL, reason: "cycle" };
    }
    visiting.add(key);
    const result = computeSourceEntry(source);
    visiting.delete(key);
    memo.set(key, result);
    return result;
  };

  const byDivision = new Map<string, Map<string, ResolvedEntry>>();
  for (const division of divisions) {
    const resolved = new Map<string, ResolvedEntry>();
    for (const entry of division.entries.entries) {
      // 参加者エントリーは解決するものが無いので表に載せない。
      // 呼び出し側は「表に無い entryId は従来どおり参加者から名前を引く」で済む。
      if (entry.source === undefined) {
        continue;
      }
      resolved.set(
        entry.id,
        resolveSourceEntry(division, entry.id, entry.source),
      );
    }
    byDivision.set(division.id, resolved);
  }
  return byDivision;
};

/**
 * 画面に出す名前の表（entryId → 名前）。参照エントリーだけを含む。
 * 解決済みなら実選手の名前、未確定なら仮名。描画側はこの 1 つを受け取れば
 * 状態を意識せず描ける。
 */
export const entrySourceLabels = (
  resolved: ReadonlyMap<string, ResolvedEntry>,
  participantNameById: ReadonlyMap<string, string>,
): Map<string, string> =>
  new Map(
    [...resolved].map(([entryId, entry]) => [
      entryId,
      entry.state === "resolved"
        ? participantNameById.get(entry.participantId) ?? entry.label
        : entry.label,
    ]),
  );

/** まだ誰でもない枠の entryId。結果入力を伏せるのに使う。 */
export const unresolvedEntryIds = (
  resolved: ReadonlyMap<string, ResolvedEntry>,
): Set<string> =>
  new Set(
    [...resolved]
      .filter(([, entry]) => entry.state !== "resolved")
      .map(([entryId]) => entryId),
  );

/**
 * 運営に見せる注意書き。保存は止めない方針なので、おかしな状態はここで
 * 文言にして画面へ出す（仕様書「警告」節）。
 */
export const entrySourceWarnings = (
  entries: DivisionEntries,
  resolved: ReadonlyMap<string, ResolvedEntry>,
  participantNameById: ReadonlyMap<string, string>,
): string[] => {
  const warnings: string[] = [];
  let hasCycle = false;
  let hasBroken = false;

  for (const entry of entries.entries) {
    const item = resolved.get(entry.id);
    if (item === undefined) {
      continue;
    }
    if (item.state === "ambiguous") {
      if (item.reason === "cycle") {
        hasCycle = true;
      } else {
        warnings.push(`${item.label} は同順位のため決まりません`);
      }
    }
    if (item.state === "broken") {
      hasBroken = true;
    }
  }
  // 循環と参照切れは何件あっても原因は 1 つなので 1 行にまとめる
  if (hasCycle) {
    warnings.push("参照が循環しているため、選手が決まりません");
  }
  if (hasBroken) {
    warnings.push("参照先が見つからない枠があります");
  }

  // 別々の参照が同じ人を指すことも、参照と直接エントリーが重なることもある。
  // データは書けてしまうので、気づけるように名前で知らせる。
  const counts = new Map<string, number>();
  for (const entry of entries.entries) {
    const item = resolved.get(entry.id);
    const participantId =
      item === undefined
        ? entry.participantId
        : item.state === "resolved"
          ? item.participantId
          : undefined;
    if (participantId === undefined) {
      continue;
    }
    counts.set(participantId, (counts.get(participantId) ?? 0) + 1);
  }
  for (const [participantId, count] of counts) {
    if (count > 1) {
      const name =
        participantNameById.get(participantId) ?? UNKNOWN_PARTICIPANT_LABEL;
      warnings.push(`${name} が ${count} つの枠に入っています`);
    }
  }

  return warnings;
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/lib/division/entry-source.test.ts`
Expected: PASS（全 17 件）

- [ ] **Step 5: 型と lint を確認する**

Run: `pnpm typecheck && pnpm lint src/lib/division/entry-source.ts src/lib/division/entry-source.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/lib/division/entry-source.ts src/lib/division/entry-source.test.ts
git commit -F - <<'EOF'
feat(division): resolve entry sources against the other divisions

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: スロットの文言と試合名一覧に仮名を通す

**Files:**
- Modify: `src/lib/division/label.ts`（`createSlotLabeler` に 4 つ目の引数）
- Modify: `src/features/division/match-name-view.ts`（`toMatchOrderView` に 6 つ目の引数）
- Modify: `src/components/division/MatchNameSection.tsx`（props に `entryLabels` を足して渡す）
- Test: `src/lib/division/label.test.ts`、`src/features/division/match-name-view.test.ts`

**Interfaces:**
- Consumes: Task 3 の `entrySourceLabels` の戻り値の形（`ReadonlyMap<string, string>`）
- Produces:
  - `createSlotLabeler(matchNames, entries, participants, entryLabels?: ReadonlyMap<string, string>): SlotLabeler`
  - `toMatchOrderView(config, entries, participants, format, matchNames, entryLabels?: ReadonlyMap<string, string>): MatchNameRowView[]`
  - `MatchNameSection` の props に `entryLabels?: ReadonlyMap<string, string>`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/label.test.ts` の `createSlotLabeler` の describe に足す。

```ts
  it("参照エントリーは渡された仮名で呼ぶ", () => {
    const labelSlot = createSlotLabeler(
      new Map(),
      {
        version: 1,
        entries: [
          {
            id: "x1",
            seed: 0,
            source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
          },
        ],
      },
      [],
      new Map([["x1", "予選リーグA 1位"]]),
    );

    expect(labelSlot({ kind: "entry", entryId: "x1" })).toBe("予選リーグA 1位");
  });

  it("仮名が無ければ従来どおり「（不明な参加者）」にする", () => {
    const labelSlot = createSlotLabeler(
      new Map(),
      {
        version: 1,
        entries: [
          {
            id: "x1",
            seed: 0,
            source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
          },
        ],
      },
      [],
    );

    expect(labelSlot({ kind: "entry", entryId: "x1" })).toBe("（不明な参加者）");
  });
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test src/lib/division/label.test.ts`
Expected: FAIL。4 つ目の引数が受け取られず「（不明な参加者）」が返る。

- [ ] **Step 3: `createSlotLabeler` を直す**

`src/lib/division/label.ts`。JSDoc の末尾に 1 段落足し、引数と `entry` の分岐を差し替える。

```ts
/**
 * （既存のコメントの末尾に足す）
 *
 * entryLabels は参照エントリー（他部門の結果で決まる枠）の表示名。参加者から
 * 名前を引けないため、呼び出し側が lib/division/entry-source.ts の
 * entrySourceLabels で作って渡す。解決済みなら実選手の名前、未確定なら
 * 「予選リーグA 1位」のような仮名が入っている。
 */
export const createSlotLabeler = (
  matchNames: ReadonlyMap<string, string>,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
  entryLabels: ReadonlyMap<string, string> = new Map(),
): SlotLabeler => {
```

`entry` の分岐:

```ts
      case "entry":
        return (
          nameByEntryId.get(slot.entryId) ??
          entryLabels.get(slot.entryId) ??
          "（不明な参加者）"
        );
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/lib/division/label.test.ts`
Expected: PASS

- [ ] **Step 5: 試合名一覧に通す（テストから）**

`src/features/division/match-name-view.test.ts` に足す。

```ts
  it("参照エントリーの仮名を対戦の表示に使う", () => {
    const rows = toMatchOrderView(
      {
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "第1試合",
            slots: [
              { kind: "entry", entryId: "x1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      {
        version: 1,
        entries: [
          {
            id: "x1",
            seed: 0,
            source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
          },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      [{ id: "p2", name: "佐藤" }],
      "SINGLE_ELIMINATION",
      new Map([["m1", "第1試合"]]),
      new Map([["x1", "予選リーグA 1位"]]),
    );

    expect(rows[0].card).toBe("予選リーグA 1位 vs 佐藤");
  });
```

Run: `pnpm test src/features/division/match-name-view.test.ts`
Expected: FAIL

- [ ] **Step 6: `toMatchOrderView` に引数を足す**

```ts
export const toMatchOrderView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
  format: DivisionFormat,
  /** 展開済みの試合名。{{OverallSeq}} は大会全体を見ないと決まらないので上で作って渡す */
  matchNames: ReadonlyMap<string, string>,
  /** 参照エントリーの表示名。entry-source.ts の entrySourceLabels で作る */
  entryLabels?: ReadonlyMap<string, string>,
): MatchNameRowView[] => {
  const labelSlot = createSlotLabeler(
    matchNames,
    entries,
    participants,
    entryLabels,
  );
```

- [ ] **Step 7: `MatchNameSection` に props を足す**

props の型に足す:

```ts
  /** 参照エントリーの表示名（entryId → 名前）。呼び出し側が entry-source から作る */
  entryLabels?: ReadonlyMap<string, string>;
```

`toMatchOrderView` の呼び出しの最後に `entryLabels` を渡す:

```ts
          rows={toMatchOrderView(
            matchingConfig,
            entries,
            participants,
            division.format,
            resolveMatchNames(matchingConfig, division.id, overallSeq),
            entryLabels,
          )}
```

- [ ] **Step 8: 通し確認**

Run: `pnpm test src/lib/division src/features/division src/components/division && pnpm typecheck`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/lib/division src/features/division/match-name-view.ts src/components/division/MatchNameSection.tsx
git commit -F - <<'EOF'
feat(division): let slot labels fall back to entry source labels

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: ブラケットに仮名を描く

**Files:**
- Modify: `src/features/bracket/from-division.ts`（`FromDivisionInput` に `entryLabels`、entries ループ）
- Modify: `src/components/division/prepare-bracket.ts`（`PrepareBracketOptions` に `entryLabels`）
- Test: `src/features/bracket/from-division.test.ts`、`src/components/division/prepare-bracket.test.ts`

**Interfaces:**
- Consumes: Task 3 の `entrySourceLabels` の戻り値
- Produces:
  - `FromDivisionInput` に `entryLabels?: ReadonlyMap<string, string>`
  - `PrepareBracketOptions` に `entryLabels?: ReadonlyMap<string, string>`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/bracket/from-division.test.ts` に足す。既存テストのヘルパ（部門を組み立てる関数）があればそれに合わせ、無ければ下のようにインラインで組む。

```ts
  it("参照エントリーは entryLabels の名前で描く", () => {
    const converted = fromDivision({
      id: "d9",
      name: "決勝トーナメント",
      format: "SINGLE_ELIMINATION",
      entries: {
        version: 1,
        entries: [
          {
            id: "x1",
            seed: 0,
            source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
          },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "第1試合",
            slots: [
              { kind: "entry", entryId: "x1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
      resultConfig: DEFAULT_DIVISION_RESULT_CONFIG,
      participants: [{ id: "p2", name: "佐藤" }],
      matchNames: new Map([["m1", "第1試合"]]),
      entryLabels: new Map([["x1", "予選リーグA 1位"]]),
    });

    expect(converted?.participants).toEqual([
      { id: "x1", name: "予選リーグA 1位", seed: 0, team: undefined },
      { id: "e2", name: "佐藤", seed: 1, team: undefined },
    ]);
  });

  it("参照エントリーに名前が無ければ描かない", () => {
    const converted = fromDivision({
      id: "d9",
      name: "決勝トーナメント",
      format: "SINGLE_ELIMINATION",
      entries: {
        version: 1,
        entries: [
          {
            id: "x1",
            seed: 0,
            source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
          },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "第1試合",
            slots: [
              { kind: "entry", entryId: "x1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
      resultConfig: DEFAULT_DIVISION_RESULT_CONFIG,
      participants: [{ id: "p2", name: "佐藤" }],
      matchNames: new Map([["m1", "第1試合"]]),
    });

    expect(converted).toBeNull();
  });
```

`DEFAULT_DIVISION_RESULT_CONFIG` の import が無ければ `@/lib/division/types` から足す。既存テストが別の書き方で `resultConfig` を渡しているならそれに合わせる。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test src/features/bracket/from-division.test.ts`
Expected: FAIL。1 件目が `null`（`entryLabels` を見ていない）。

- [ ] **Step 3: `from-division.ts` を直す**

`FromDivisionInput` に足す:

```ts
  /**
   * 参照エントリー（他部門の結果で決まる枠）の表示名。entryId → 名前。
   * 参加者から名前を引けないため、呼び出し側が lib/division/entry-source.ts の
   * entrySourceLabels で作って渡す。
   */
  entryLabels?: ReadonlyMap<string, string>;
```

entries のループを差し替える:

```ts
  for (const entry of input.entries.entries) {
    const source =
      entry.participantId === undefined
        ? undefined
        : sourceById.get(entry.participantId);
    // 参照エントリーは参加者を持たないので仮名で描く。名前がどちらからも
    // 引けないのはデータ不整合なので、従来どおり描かない。
    const name = source?.name ?? input.entryLabels?.get(entry.id);
    if (name === undefined) {
      return null;
    }
    entryIds.add(entry.id);
    participants.push({
      id: entry.id,
      name,
      // 部門内シード。大会全体の Participant.seed ではない。
      seed: entry.seed,
      team: source?.team,
    });
  }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/features/bracket/from-division.test.ts`
Expected: PASS

- [ ] **Step 5: `prepare-bracket.ts` に通す（テストから）**

`src/components/division/prepare-bracket.test.ts` に足す。既存テストの部門の作り方（`division` 相当のヘルパ）に合わせて、参照エントリーを 1 件持つ SE 部門を作る。

```ts
  it("参照エントリーの仮名をブラケットに載せる", () => {
    const prepared = prepareBracket(
      {
        id: "d9",
        name: "決勝トーナメント",
        order: 0,
        format: "SINGLE_ELIMINATION",
        createdAt: new Date(),
        entries: {
          version: 1,
          entries: [
            {
              id: "x1",
              seed: 0,
              source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
            },
            { id: "e2", participantId: "p2", seed: 1 },
          ],
        },
        matchingConfig: {
          version: 1,
          matches: [
            {
              id: "m1",
              bracket: "winners",
              round: 1,
              order: 0,
              matchName: "第1試合",
              slots: [
                { kind: "entry", entryId: "x1" },
                { kind: "entry", entryId: "e2" },
              ],
            },
          ],
        },
        results: { version: 1, matches: [] },
        resultConfig: DEFAULT_DIVISION_RESULT_CONFIG,
      },
      [
        {
          id: "p2",
          name: "佐藤",
          nameKana: "さとう",
          playerNumber: "2",
        },
      ],
      new Map(),
      { entryLabels: new Map([["x1", "予選リーグA 1位"]]) },
    );

    expect(prepared.kind).toBe("ready");
  });
```

Run: `pnpm test src/components/division/prepare-bracket.test.ts`
Expected: FAIL（`notice` が返る）

- [ ] **Step 6: `prepare-bracket.ts` を直す**

`PrepareBracketOptions` に足す:

```ts
  /** 参照エントリーの表示名。entry-source.ts の entrySourceLabels で作って渡す */
  entryLabels?: ReadonlyMap<string, string>;
```

分割代入と `fromDivision` の呼び出しに渡す:

```ts
  const {
    withResults = true,
    withPlayerNumber = false,
    entryLabels,
  } = options;
```

```ts
    matchNames: resolveMatchNames(
      parsed.matchingConfig,
      division.id,
      overallSeq,
    ),
    // 仮名には選手番号を付けない（まだ誰でもないので番号が無い）
    entryLabels,
  });
```

- [ ] **Step 7: テストが通ることを確認する**

Run: `pnpm test src/components/division src/features/bracket && pnpm typecheck`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add src/features/bracket src/components/division/prepare-bracket.ts src/components/division/prepare-bracket.test.ts
git commit -F - <<'EOF'
feat(bracket): draw source entries with their placeholder label

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: 全部門を読んで画面・印刷へ仮名を届ける

**Files:**
- Modify: `src/features/division/repository.ts`（`loadEntrySourceContext` を追加）
- Modify: `src/components/division/DivisionBracket.tsx`（props に `entryLabels`）
- Modify: `src/components/division/DivisionMatchingView.tsx`（props に `entryLabels`、`DivisionBracket` へ）
- Modify: `src/components/division/BracketEditorSetup.tsx`（props に `entryLabels`、`DivisionBracket` と `MatchNameSection` へ）
- Modify: `src/components/division/DivisionSetup.tsx`（props に `entryLabels`、`DivisionBracket` と `MatchNameSection` へ）
- Modify: `src/components/print/PrintDivisionSection.tsx`（props に `entryLabels`、`prepareBracket` へ）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Modify: `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`
- Modify: `src/app/t/[tournamentId]/print/page.tsx`
- Test: `src/features/division/repository.test.ts`、および上記 4 ページの `page.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `resolveEntrySources` / `entrySourceLabels` / `entrySourceWarnings`、Task 5 の `entryLabels` オプション
- Produces:
  - `type EntrySourceView = { labels: Map<string, string>; warnings: string[] }`
  - `type EntrySourceContext = { views: Map<string, EntrySourceView>; divisions: EntrySourceDivision[] }`
  - `loadEntrySourceContext(organizationId: string, tournamentId: string, overallSeq: ReadonlyMap<string, number>, participants: { id: string; name: string }[]): Promise<EntrySourceContext>` … `views` のキーは `divisionId`。`divisions` は解決に使ったスナップショット（order 昇順）で、Task 9 が選択肢を組むのに使う。
  - `DivisionBracket` / `DivisionMatchingView` / `BracketEditorSetup` / `DivisionSetup` / `PrintDivisionSection` の props に `entryLabels?: ReadonlyMap<string, string>`

- [ ] **Step 1: 失敗するテストを書く（loader）**

`src/features/division/repository.test.ts` に足す。既存テストの Prisma のモック方法に必ず合わせること（`vi.mock("@/shared/db/prisma", ...)` を使っているはず）。

```ts
describe("loadEntrySourceViews", () => {
  it("部門ごとの仮名と警告を返す", async () => {
    // 予選リーグA（全試合終了）と、その 1 位を参照する決勝トーナメント
    findManyDivisions.mockResolvedValue([
      {
        id: "d2",
        name: "予選リーグA",
        order: 0,
        format: "ROUND_ROBIN",
        createdAt: new Date(),
        entries: {
          version: 1,
          entries: [
            { id: "l1", participantId: "p1", seed: 0 },
            { id: "l2", participantId: "p2", seed: 1 },
          ],
        },
        matchingConfig: {
          version: 1,
          matches: [
            {
              id: "n1",
              bracket: "winners",
              round: 1,
              order: 0,
              matchName: "第1試合",
              slots: [
                { kind: "entry", entryId: "l1" },
                { kind: "entry", entryId: "l2" },
              ],
            },
          ],
        },
        results: { version: 1, matches: [{ matchId: "n1", winnerEntryId: "l1" }] },
        resultConfig: { version: 1, winReason: { enabled: false, options: [] }, score: { enabled: false, count: 3, aggregation: "sum" }, note: { enabled: false } },
      },
      {
        id: "d9",
        name: "決勝トーナメント",
        order: 1,
        format: "SINGLE_ELIMINATION",
        createdAt: new Date(),
        entries: {
          version: 1,
          entries: [
            {
              id: "x1",
              seed: 0,
              source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
            },
          ],
        },
        matchingConfig: { version: 1, matches: [] },
        results: { version: 1, matches: [] },
        resultConfig: { version: 1, winReason: { enabled: false, options: [] }, score: { enabled: false, count: 3, aggregation: "sum" }, note: { enabled: false } },
      },
    ]);

    const { views } = await loadEntrySourceContext("o1", "t1", new Map(), [
      { id: "p1", name: "山田太郎" },
      { id: "p2", name: "佐藤" },
    ]);

    expect(views.get("d9")?.labels).toEqual(new Map([["x1", "山田太郎"]]));
    expect(views.get("d9")?.warnings).toEqual([]);
  });
});
```

`findManyDivisions` は既存テストで使っているモック名に合わせること（`prisma.division.findMany` のモック）。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test src/features/division/repository.test.ts`
Expected: FAIL。`loadEntrySourceContext` が無い。

- [ ] **Step 3: loader を実装する**

`src/features/division/repository.ts` の末尾に足す。import に次を加える。

```ts
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import {
  type EntrySourceDivision,
  entrySourceLabels,
  entrySourceWarnings,
  resolveEntrySources,
} from "@/lib/division/entry-source";
```

```ts
/** 1 部門ぶんの、参照エントリーの表示名と運営に見せる注意書き。 */
export type EntrySourceView = {
  /** entryId → 画面に出す名前。参照エントリーだけを含む */
  labels: Map<string, string>;
  /** 同順位・循環・参照切れ・重複の注意書き。無ければ空配列 */
  warnings: string[];
};

/**
 * 参照エントリーを解決して、部門ごとの表示名と注意書きにする。
 *
 * 参照は大会の中で閉じるので、1 部門を描くページでも大会の全部門を 1 度
 * 読む。部門ごとに引くとクエリが部門数だけ増えるため、印刷ページと同じ
 * listDivisionDetailsInTournament を使う。
 *
 * 壊れた Json を持つ部門はその部門だけ除いて続ける（他の部門の表示は
 * 出したい）。除かれた部門を参照している枠は「参照先が見つかりません」に
 * なる。
 */
export type EntrySourceContext = {
  views: Map<string, EntrySourceView>;
  /** 解決に使ったスナップショット。スロット編集の選択肢作りが使い回す */
  divisions: EntrySourceDivision[];
};

export const loadEntrySourceContext = async (
  organizationId: string,
  tournamentId: string,
  overallSeq: ReadonlyMap<string, number>,
  participants: { id: string; name: string }[],
): Promise<EntrySourceContext> => {
  const rows = await listDivisionDetailsInTournament(
    organizationId,
    tournamentId,
  );

  const divisions: EntrySourceDivision[] = [];
  for (const row of rows) {
    try {
      const matchingConfig = parseMatchingConfig(row.matchingConfig);
      divisions.push({
        id: row.id,
        name: row.name,
        format: row.format,
        entries: parseDivisionEntries(row.entries),
        matchingConfig,
        results: parseDivisionResults(row.results),
        matchNames: resolveMatchNames(matchingConfig, row.id, overallSeq),
      });
    } catch {
      continue;
    }
  }

  const participantNameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const resolved = resolveEntrySources(divisions);

  const views = new Map(
    divisions.map((division) => {
      const entries = resolved.get(division.id) ?? new Map();
      return [
        division.id,
        {
          labels: entrySourceLabels(entries, participantNameById),
          warnings: entrySourceWarnings(
            division.entries,
            entries,
            participantNameById,
          ),
        },
      ];
    }),
  );

  return { views, divisions };
};
```

`resolveMatchNames` の第 3 引数が `ReadonlyMap<string, number>` を受けない場合は、`overallSeq` の型をその関数の要求に合わせる（既存の呼び出し箇所と同じ型で渡す）。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/features/division/repository.test.ts`
Expected: PASS

- [ ] **Step 5: コンポーネントに props を足す**

`src/components/division/DivisionBracket.tsx` — props の型に足す:

```ts
  /** 参照エントリーの表示名（entryId → 名前）。ページが entry-source から作る */
  entryLabels?: ReadonlyMap<string, string>;
```

分割代入に `entryLabels` を足し、`prepareBracket` に渡す:

```ts
  const prepared = prepareBracket(division, participants, overallSeq, {
    entryLabels,
  });
```

`src/components/division/DivisionMatchingView.tsx` — props に同じ 1 行を足し、`DivisionBracket` に `entryLabels={entryLabels}` を渡す（`LeagueSection` には渡さない。リーグの結果表は Task 11 の対象外で、参照エントリーを持ちうるのは SE だけ）。

`src/components/division/BracketEditorSetup.tsx` — props に同じ 1 行を足し、`DivisionBracket` と `MatchNameSection` の両方に `entryLabels={entryLabels}` を渡す。

`src/components/division/DivisionSetup.tsx` — props に同じ 1 行を足し、`DivisionBracket` と `MatchNameSection` に `entryLabels={entryLabels}` を渡す。

`src/components/print/PrintDivisionSection.tsx` — `BodyProps` と公開されているコンポーネントの props に同じ 1 行を足し、`prepareBracket` の options に `entryLabels` を加える:

```ts
  const prepared = prepareBracket(division, participants, overallSeq, {
    withResults,
    withPlayerNumber: true,
    entryLabels,
  });
```

- [ ] **Step 6: ページで読んで渡す**

4 ページとも、`overallSeq` と参加者を読んだ**後**に呼ぶ（`overallSeq` を引数に取るため）。

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx` — `participants` を読む行の下に足す:

```ts
  // 参照エントリー（他部門の結果で決まる枠）の表示名。参照は大会の中で
  // 閉じるので、この部門だけを描くページでも全部門を 1 度読む。
  const entrySources = await loadEntrySourceContext(
    organization.id,
    tournamentId,
    overallSeq,
    participants,
  );
```

`DivisionMatchingView` に渡す:

```tsx
          <DivisionMatchingView
            division={division}
            participants={participants}
            overallSeq={overallSeq}
            entryLabels={entrySources.views.get(division.id)?.labels}
          />
```

`src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx` — `Promise.all` の下に同じ形で足す（`organizationId` は `tournament.organizationId`）。`DivisionMatchingView` に `entryLabels={entrySources.views.get(division.id)?.labels}` を渡す。

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx` — `Promise.all` の下に同じ形で足し、`BracketEditorSetup` と `DivisionSetup` の両方に `entryLabels={entrySources.views.get(division.id)?.labels}` を渡す。

`src/app/t/[tournamentId]/print/page.tsx` — `Promise.all` の下に足す:

```ts
  // 印刷は既に全部門を読んでいるが、解決には parse 済みの形が要るため
  // 同じ関数を通す（クエリ 1 本ぶんの重複は許す。文言を 1 箇所に保つ方を採る）。
  const entrySources = await loadEntrySourceContext(
    tournament.organizationId,
    tournament.id,
    overallSeq,
    participants,
  );
```

`PrintDivisionSection` を描いている箇所（`divisions.map(...)`）で `entryLabels={entrySources.views.get(division.id)?.labels}` を渡す。

- [ ] **Step 7: ページのテストを直す**

4 つの `page.test.tsx` は `@/features/division/repository` をモックしている。`loadEntrySourceViews` をモックに足し、既定で空の Map を返させる。

```ts
  loadEntrySourceContext: () =>
    Promise.resolve({ views: new Map(), divisions: [] }),
```

Run: `pnpm test src/app`
Expected: PASS

- [ ] **Step 8: 通し確認**

Run: `pnpm test && pnpm typecheck`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/features/division/repository.ts src/features/division/repository.test.ts src/components src/app
git commit -F - <<'EOF'
feat(division): feed resolved entry source labels into every view

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```
---

### Task 7: 進行順と結果入力に仮名を出し、未確定の試合は入力を伏せる

**Files:**
- Modify: `src/features/schedule/domain.ts`（`buildMatchRows`）
- Modify: `src/features/schedule/result-rows.ts`（`rowState` / `context` / `slotView`）
- Test: `src/features/schedule/domain.test.ts`、`src/features/schedule/result-rows.test.ts`

**Interfaces:**
- Consumes: Task 3 の `resolveEntrySources` / `entrySourceLabels` / `unresolvedEntryIds`、Task 4 の `createSlotLabeler` の 4 つ目の引数
- Produces: `buildScheduleView` / `buildResultRows` の**シグネチャは変えない**（`ScheduleDivision[]` が既に全部門ぶん渡ってくるので、解決はこの中で完結する）。未確定の枠を含む試合は `state: "waiting"`、そのスロットは `entryId: null` で仮名だけを持つ。

- [ ] **Step 1: 失敗するテストを書く（結果入力）**

`src/features/schedule/result-rows.test.ts` に足す。既存テストの部門・行の作り方（ヘルパ）に合わせること。下は「予選リーグA の 1 位を参照する決勝の 1 試合」を作る例。

```ts
  it("未確定の参照エントリーは押せず、行は waiting になる", () => {
    const league = {
      id: "d2",
      name: "予選リーグA",
      order: 0,
      format: "ROUND_ROBIN" as const,
      entries: {
        version: 1 as const,
        entries: [
          { id: "l1", participantId: "p1", seed: 0 },
          { id: "l2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: {
        version: 1 as const,
        matches: [
          {
            id: "n1",
            bracket: "winners" as const,
            round: 1,
            order: 0,
            matchName: "第1試合",
            slots: [
              { kind: "entry" as const, entryId: "l1" },
              { kind: "entry" as const, entryId: "l2" },
            ] as const,
          },
        ],
      },
      // まだ 1 試合も終わっていないので順位は決まらない
      results: { version: 1 as const, matches: [] },
      resultConfig: DEFAULT_DIVISION_RESULT_CONFIG,
    };
    const final = {
      id: "d9",
      name: "決勝トーナメント",
      order: 1,
      format: "SINGLE_ELIMINATION" as const,
      entries: {
        version: 1 as const,
        entries: [
          {
            id: "x1",
            seed: 0,
            source: {
              kind: "leagueRank" as const,
              divisionId: "d2",
              rank: 1,
            },
          },
          { id: "x2", participantId: "p3", seed: 1 },
        ],
      },
      matchingConfig: {
        version: 1 as const,
        matches: [
          {
            id: "f1",
            bracket: "winners" as const,
            round: 1,
            order: 0,
            matchName: "決勝",
            slots: [
              { kind: "entry" as const, entryId: "x1" },
              { kind: "entry" as const, entryId: "x2" },
            ] as const,
          },
        ],
      },
      results: { version: 1 as const, matches: [] },
      resultConfig: DEFAULT_DIVISION_RESULT_CONFIG,
    };

    const rows = buildResultRows(
      buildScheduleView([league, final], participants, items),
      [league, final],
      participants,
    );
    const row = rows.find(
      (item) => item.kind === "match" && item.matchId === "f1",
    );

    expect(row).toMatchObject({
      kind: "match",
      state: "waiting",
      slots: [
        { label: "予選リーグA 1位", entryId: null },
        { label: "鈴木", entryId: "x2" },
      ],
    });
  });
```

`participants` は `[{ id: "p1", name: "山田" }, { id: "p2", name: "佐藤" }, { id: "p3", name: "鈴木" }]`、`items` は既存テストと同じ形の `ScheduleItemRecord[]`（空配列でも `buildScheduleView` が全試合の行を作る）。既存テストの呼び出し方に合わせること。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test src/features/schedule/result-rows.test.ts`
Expected: FAIL。スロットの label が「（不明な参加者）」、`entryId` が `"x1"`、`state` が `"ready"`。

- [ ] **Step 3: `result-rows.ts` を直す**

import に足す:

```ts
import {
  entrySourceLabels,
  resolveEntrySources,
  unresolvedEntryIds,
} from "@/lib/division/entry-source";
```

`rowState` を差し替える（判定に、作ったスロットの表示を使う）:

```ts
/**
 * BYE を先に見るのは、片側が不戦勝の試合は記録の有無にかかわらず
 * 入力させないため（勝者は自動で決まる）。
 *
 * waiting は「押せるスロットが揃っていない」ことを表す。前の試合の結果待ち
 * （pending）と、他部門の結果で決まる枠がまだ誰でもない場合の両方が入る。
 * 記録済みを先に見るのは、あとから参照先が未確定に戻っても入力済みの記録を
 * 隠さないため（記録は消さないという方針に合わせる）。
 */
const rowState = (
  resolved: ResolvedMatch,
  slots: [ResultSlotView, ResultSlotView],
  isRecorded: boolean,
): ResultRowState => {
  if (resolved.slots.some((slot) => slot.state === "bye")) {
    return "bye";
  }
  if (isRecorded) {
    return "recorded";
  }
  if (slots.some((slot) => slot.entryId === null)) {
    return "waiting";
  }
  return "ready";
};
```

`buildResultRows` の中、`context` を作る直前に足す:

```ts
  // 参照エントリー（他部門の結果で決まる枠）の解決。全部門を見ないと作れない
  // ので、行ごとではなくここで 1 度だけ作る。
  const participantNameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const resolvedSources = resolveEntrySources(
    divisions.map((division) => ({
      ...division,
      matchNames: namesByDivision.get(division.id),
    })),
  );
```

`context` の中身を 2 か所変える:

```ts
        labelSlot: createSlotLabeler(
          namesByDivision.get(division.id) ?? new Map<string, string>(),
          division.entries,
          participants,
          entrySourceLabels(
            resolvedSources.get(division.id) ?? new Map(),
            participantNameById,
          ),
        ),
        // まだ誰でもない枠。押せるスロットから外す
        unresolved: unresolvedEntryIds(
          resolvedSources.get(division.id) ?? new Map(),
        ),
```

`slotView` の `entry` の分岐を差し替える:

```ts
      if (slot.state === "entry") {
        const label = current.labelSlot({
          kind: "entry",
          entryId: slot.entryId,
        });
        // 参照先が未確定の枠は、誰か分からないまま勝敗を付けてしまわないよう
        // 押せなくする。仮名（「予選リーグA 1位」）だけを出す。
        return current.unresolved.has(slot.entryId)
          ? { label, entryId: null }
          : { label, entryId: slot.entryId };
      }
```

スロットを組んでから状態を決める形に直す（`return [...]` の直前）:

```ts
    const slots: [ResultSlotView, ResultSlotView] = [slotView(0), slotView(1)];
```

そして行の組み立てを `slots,` と `state: rowState(resolved, slots, record !== undefined),` に差し替える。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/features/schedule/result-rows.test.ts`
Expected: PASS

- [ ] **Step 5: 進行順の一覧にも通す（テストから）**

`src/features/schedule/domain.test.ts` に足す。部門は Step 1 と同じ 2 つを使う。

```ts
  it("参照エントリーの仮名を対戦の表示に使う", () => {
    const rows = buildScheduleView([league, final], participants, []);
    const row = rows.find(
      (item) => item.kind === "match" && item.matchId === "f1",
    );

    expect(row).toMatchObject({ card: "予選リーグA 1位 vs 鈴木" });
  });
```

Run: `pnpm test src/features/schedule/domain.test.ts`
Expected: FAIL（`（不明な参加者） vs 鈴木`）

- [ ] **Step 6: `domain.ts` を直す**

import に足す:

```ts
import {
  entrySourceLabels,
  resolveEntrySources,
} from "@/lib/division/entry-source";
```

`buildMatchRows` の先頭を差し替える（試合名を先にまとめて作り、それを解決にも使う）:

```ts
const buildMatchRows = (
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
  overallSeq: Map<string, number>,
): ScheduleRowView[] => {
  const rows: { row: ScheduleRowView; seq: number }[] = [];

  // 行の試合名とカードの「◯◯の勝者」が同じ展開結果を使うよう、部門ごとに 1 回だけ作る。
  // 参照エントリーの解決にも同じ表を渡す（仮名の中の試合名がずれないため）。
  const matchNamesByDivision = new Map(
    divisions.map((division) => [
      division.id,
      resolveMatchNames(division.matchingConfig, division.id, overallSeq),
    ]),
  );
  const participantNameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const resolvedSources = resolveEntrySources(
    divisions.map((division) => ({
      ...division,
      matchNames: matchNamesByDivision.get(division.id),
    })),
  );

  for (const division of divisions) {
    const matchNames =
      matchNamesByDivision.get(division.id) ?? new Map<string, string>();
    const labelSlot = createSlotLabeler(
      matchNames,
      division.entries,
      participants,
      entrySourceLabels(
        resolvedSources.get(division.id) ?? new Map(),
        participantNameById,
      ),
    );
```

以降のループ本体は変えない。

- [ ] **Step 7: 通し確認**

Run: `pnpm test src/features/schedule && pnpm typecheck`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add src/features/schedule
git commit -F - <<'EOF'
feat(schedule): show source entry labels and hide input until decided

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: 参照エントリーを保存する（サーバー側）

**Files:**
- Modify: `src/features/division/errors.ts`（`DivisionEntrySourceInvalidError` を追加、union と `divisionErrorTags` にも）
- Modify: `src/features/division/messages.ts`
- Modify: `src/features/division/add-entry/schema.ts`（枝を個別に export）
- Modify: `src/features/division/assign-slot/schema.ts`
- Modify: `src/features/division/assign-slot/handler.ts`
- Modify: `src/features/division/assign-slot/repository.ts`
- Test: `src/features/division/assign-slot/repository.test.ts`、`src/features/division/assign-slot/handler.test.ts`、`src/features/division/messages.test.ts`

**Interfaces:**
- Consumes: Task 1 の `EntrySource`
- Produces:
  - `existingMemberSchema` / `newMemberSchema`（`add-entry/schema.ts` から export。`addEntrySchema` はこの 2 つの `discriminatedUnion` のまま）
  - `slotOccupantSchema` と `type SlotOccupantInput`（`assign-slot/schema.ts`）。`mode` は `"existing" | "new" | "matchResult" | "leagueRank"`
  - `type AssignSlotInput = SlotTarget & { occupant: SlotOccupantInput }` … **`member` から `occupant` に名前が変わる**
  - `class DivisionEntrySourceInvalidError` … `reason: "notFound" | "sameDivision" | "notLeague" | "matchNotFound"`

- [ ] **Step 1: 失敗するテストを書く（repository）**

`src/features/division/assign-slot/repository.test.ts` に足す。既存テストの `runFirstRoundEdit` / Prisma のモック方法にそのまま合わせること。既存テストは `input` に `member` を渡しているので、**このタスクで `occupant` に書き換える**（既存テスト全件）。

```ts
  it("リーグ順位の参照をエントリーとして置く", async () => {
    findFirstDivision.mockResolvedValue({
      id: "d2",
      format: "ROUND_ROBIN",
      matchingConfig: { version: 1, matches: [] },
    });

    await run(
      assignSlotInDb(ids, {
        matchId: "m1",
        slotIndex: 0,
        occupant: { mode: "leagueRank", sourceDivisionId: "d2", rank: 1 },
      }),
    );

    // Member も Participant も作らない
    expect(createMember).not.toHaveBeenCalled();
    const saved = savedEntries();
    expect(saved).toEqual([
      expect.objectContaining({
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
      }),
    ]);
  });

  it("試合の勝者の参照をエントリーとして置く", async () => {
    findFirstDivision.mockResolvedValue({
      id: "d2",
      format: "SINGLE_ELIMINATION",
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "q1",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "第1試合",
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      },
    });

    await run(
      assignSlotInDb(ids, {
        matchId: "m1",
        slotIndex: 0,
        occupant: {
          mode: "matchResult",
          sourceDivisionId: "d2",
          sourceMatchId: "q1",
          outcome: "loser",
        },
      }),
    );

    expect(savedEntries()).toEqual([
      expect.objectContaining({
        source: { kind: "matchLoser", divisionId: "d2", matchId: "q1" },
      }),
    ]);
  });

  it("自部門を参照先にしたら拒否する", async () => {
    const exit = await runExit(
      assignSlotInDb(ids, {
        matchId: "m1",
        slotIndex: 0,
        occupant: {
          mode: "leagueRank",
          sourceDivisionId: ids.divisionId,
          rank: 1,
        },
      }),
    );

    // 既存テストが失敗の中身を取り出すヘルパを持っているなら、
    // DivisionEntrySourceInvalidError と reason: "sameDivision" まで assert する。
    expect(exit._tag).toBe("Failure");
    expect(findFirstDivision).not.toHaveBeenCalled();
  });

  it("リーグでない部門の順位は拒否する", async () => {
    findFirstDivision.mockResolvedValue({
      id: "d2",
      format: "SINGLE_ELIMINATION",
      matchingConfig: { version: 1, matches: [] },
    });

    const exit = await runExit(
      assignSlotInDb(ids, {
        matchId: "m1",
        slotIndex: 0,
        occupant: { mode: "leagueRank", sourceDivisionId: "d2", rank: 1 },
      }),
    );

    expect(exit._tag).toBe("Failure");
  });

  it("同じ参照が既に 1 回戦に置かれていたら拒否する", async () => {
    // current.entries に同じ source を持つエントリーがあり、スロットに
    // 置かれている状態をモックで作る
    findFirstDivision.mockResolvedValue({
      id: "d2",
      format: "ROUND_ROBIN",
      matchingConfig: { version: 1, matches: [] },
    });

    const exit = await runExit(
      assignSlotInDb(ids, {
        matchId: "m1",
        slotIndex: 1,
        occupant: { mode: "leagueRank", sourceDivisionId: "d2", rank: 1 },
      }),
    );

    expect(exit._tag).toBe("Failure");
  });
```

`findFirstDivision` は `prisma.division.findFirst` のモック、`savedEntries()` は保存された `entries.entries` を取り出す既存のヘルパに合わせる。`run` / `runExit` は既存テストが使っている Effect の実行ヘルパに合わせる。失敗の中身まで見られる形になっているなら `DivisionEntrySourceInvalidError` と `reason` も assert すること。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test src/features/division/assign-slot`
Expected: FAIL（型エラー、または `occupant` を見ていない）

- [ ] **Step 3: エラーと文言を足す**

`src/features/division/errors.ts` に足す（`DivisionShapeMismatchError` の下）:

```ts
/**
 * エントリーの参照先（他部門の試合・リーグ順位）が使えないことを表す。
 * 画面は選択肢を絞るが、Server Action は直接叩ける別の入口なので保存時にも見る。
 */
export class DivisionEntrySourceInvalidError extends Data.TaggedError(
  "DivisionEntrySourceInvalidError",
)<{
  readonly reason: "notFound" | "sameDivision" | "notLeague" | "matchNotFound";
}> {}
```

`DivisionError` の union に `| DivisionEntrySourceInvalidError` を足し、`divisionErrorTags` に `DivisionEntrySourceInvalidError: true,` を足す（どちらも足さないとコンパイルが通らない）。

`src/features/division/messages.ts` — import に型を足し、ファイル先頭に文言表を置く:

```ts
/** 参照先が使えない理由ごとの文言。 */
const ENTRY_SOURCE_INVALID_MESSAGES: Record<
  DivisionEntrySourceInvalidError["reason"],
  string
> = {
  notFound: "参照先の部門が見つかりません",
  sameDivision: "同じ部門の結果は参照できません",
  notLeague: "順位を参照できるのはリーグの部門だけです",
  matchNotFound: "参照先の試合が見つかりません。画面を再読み込みしてください",
};
```

`Match.tag` を 1 つ足す:

```ts
    Match.tag("DivisionEntrySourceInvalidError", (error) =>
      ENTRY_SOURCE_INVALID_MESSAGES[error.reason],
    ),
```

`src/features/division/messages.test.ts` に 1 件足す:

```ts
  it("参照先が使えない理由ごとの文言を返す", () => {
    expect(
      divisionErrorMessage(
        new DivisionEntrySourceInvalidError({ reason: "notLeague" }),
      ),
    ).toBe("順位を参照できるのはリーグの部門だけです");
  });
```

- [ ] **Step 4: スキーマを分けて足す**

`src/features/division/add-entry/schema.ts` の `addEntrySchema` を差し替える（枝を名前付きにするだけで、`addEntrySchema` の形と文言は変えない）:

```ts
/** 既存の Member を選ぶ枝。1 回戦のスロット編集からも使う。 */
export const existingMemberSchema = z.object({
  mode: z.literal("existing"),
  memberId: z.string().min(1, "メンバーを選択してください"),
});

/** その場で Member を作る枝。1 回戦のスロット編集からも使う。 */
export const newMemberSchema = z.object({
  mode: z.literal("new"),
  name: trimmedName("氏名"),
  nameKana: trimmedName("氏名（かな）"),
});

/**
 * 既存 Member を選ぶか、新しく登録するかの二択。フォームのラジオ mode が
 * どちらかを決める。discriminatedUnion にすることで、mode ごとに
 * 必要な項目だけを要求できる。
 *
 * 他部門の結果を参照する枝はここに入れない。参照を置けるのは 1 回戦の
 * スロット編集だけで、リーグ・ダブルエリミのエントリー追加では受け付けない
 * （assign-slot/schema.ts の slotOccupantSchema が足している）。
 */
export const addEntrySchema = z.discriminatedUnion("mode", [
  existingMemberSchema,
  newMemberSchema,
]);
```

`src/features/division/assign-slot/schema.ts` を差し替える:

```ts
import { z } from "zod";
import { existingMemberSchema, newMemberSchema } from "../add-entry/schema";
import type { SlotTarget } from "../first-round-schema";

/** 他部門の試合の勝者・敗者を置く枝。 */
const matchResultSchema = z.object({
  mode: z.literal("matchResult"),
  sourceDivisionId: z.string().min(1, "参照する部門を選択してください"),
  sourceMatchId: z.string().min(1, "参照する試合を選択してください"),
  outcome: z.enum(["winner", "loser"], {
    error: "勝者か敗者を選択してください",
  }),
});

/** 他部門（リーグ）の N 位を置く枝。 */
const leagueRankSchema = z.object({
  mode: z.literal("leagueRank"),
  sourceDivisionId: z.string().min(1, "参照する部門を選択してください"),
  rank: z.coerce
    .number({ error: "順位は数字で入力してください" })
    .int("順位は整数で入力してください")
    .min(1, "順位は 1 以上で入力してください"),
});

/**
 * どのスロットに何を置くか。誰の部分は add-entry と同じ 2 枝を使い回し、
 * 他部門の結果を参照する 2 枝をここで足す。handler が slotTargetSchema と
 * 別々に検証して組み合わせる。
 */
export const slotOccupantSchema = z.discriminatedUnion("mode", [
  existingMemberSchema,
  newMemberSchema,
  matchResultSchema,
  leagueRankSchema,
]);

export type SlotOccupantInput = z.infer<typeof slotOccupantSchema>;

export type AssignSlotInput = SlotTarget & { occupant: SlotOccupantInput };
```

- [ ] **Step 5: handler を直す**

`src/features/division/assign-slot/handler.ts` の import を `addEntrySchema` から `slotOccupantSchema`（`./schema` から）に替え、検証の箇所を差し替える:

```ts
  const occupant = slotOccupantSchema.safeParse({
    mode: String(formData.get("mode") ?? ""),
    memberId: String(formData.get("memberId") ?? ""),
    name: String(formData.get("name") ?? ""),
    nameKana: String(formData.get("nameKana") ?? ""),
    sourceDivisionId: String(formData.get("sourceDivisionId") ?? ""),
    sourceMatchId: String(formData.get("sourceMatchId") ?? ""),
    outcome: String(formData.get("outcome") ?? ""),
    rank: String(formData.get("rank") ?? ""),
  });
  if (!occupant.success) {
    return { error: occupant.error.issues[0].message };
  }
  const input = { ...target.data, occupant: occupant.data };
```

`src/features/division/assign-slot/handler.test.ts` の既存の期待値（`{ member: ... }`）を `{ occupant: ... }` に直し、参照モードの 1 件を足す:

```ts
  it("リーグ順位の指定をポートへ渡す", async () => {
    await assignSlotAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({
        matchId: "m1",
        slotIndex: "0",
        mode: "leagueRank",
        sourceDivisionId: "d2",
        rank: "2",
      }),
    );

    expect(assignSlotInDb).toHaveBeenCalledWith(expect.anything(), {
      matchId: "m1",
      slotIndex: 0,
      occupant: { mode: "leagueRank", sourceDivisionId: "d2", rank: 2 },
    });
  });
```

- [ ] **Step 6: repository を直す**

`src/features/division/assign-slot/repository.ts` を次の形にする。

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import { parseMatchingConfig } from "@/lib/division/parse";
import type { DivisionEntry, EntrySource } from "@/lib/division/types";
import { resolveMemberId, resolveParticipantId } from "../entry-member";
import {
  DivisionDuplicateEntryError,
  DivisionEntrySourceInvalidError,
  type DivisionError,
  DivisionMatchNotFoundError,
} from "../errors";
import { runFirstRoundEdit } from "../first-round-store";
import type {
  DivisionIds,
  DivisionSetupOutcome,
  DivisionSetupTx,
} from "../setup-store";
import {
  firstRoundPairs,
  removeEntries,
  setFirstRoundSlot,
} from "../single-elimination/first-round";
import type { AssignSlotInput, SlotOccupantInput } from "./schema";

export type AssignSlotPort = (
  ids: DivisionIds,
  input: AssignSlotInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/** 同じ参照を指しているか。同じ枠を 2 つ置かせないための比較。 */
const sameSource = (left: EntrySource, right: EntrySource): boolean => {
  if (left.kind !== right.kind || left.divisionId !== right.divisionId) {
    return false;
  }
  if (left.kind === "leagueRank" && right.kind === "leagueRank") {
    return left.rank === right.rank;
  }
  if (left.kind !== "leagueRank" && right.kind !== "leagueRank") {
    return left.matchId === right.matchId;
  }
  return false;
};

/**
 * 参照先が使えるものかを確かめて EntrySource にする。
 *
 * 画面は選択肢を絞るが、Server Action は直接叩ける別の入口なのでここでも見る。
 * 見るのは「同じ大会にある」「自部門ではない」「順位はリーグだけ」「試合が
 * 実在する」の 4 つ。結果が出ているかは見ない（未確定のまま置けるのが目的）。
 */
const toEntrySource = async (
  tx: DivisionSetupTx,
  ids: DivisionIds,
  occupant: Extract<
    SlotOccupantInput,
    { mode: "matchResult" } | { mode: "leagueRank" }
  >,
): Promise<EntrySource> => {
  if (occupant.sourceDivisionId === ids.divisionId) {
    throw new DivisionEntrySourceInvalidError({ reason: "sameDivision" });
  }
  const target = await tx.division.findFirst({
    where: { id: occupant.sourceDivisionId, tournamentId: ids.tournamentId },
    select: { id: true, format: true, matchingConfig: true },
  });
  if (target === null) {
    throw new DivisionEntrySourceInvalidError({ reason: "notFound" });
  }

  if (occupant.mode === "leagueRank") {
    if (target.format !== "ROUND_ROBIN") {
      throw new DivisionEntrySourceInvalidError({ reason: "notLeague" });
    }
    return { kind: "leagueRank", divisionId: target.id, rank: occupant.rank };
  }

  // 試合の実在だけを確かめる。壊れた Json は DivisionJsonError から
  // DivisionDataError に写像される（errors.ts の toDivisionError）。
  const hasMatch = parseMatchingConfig(target.matchingConfig).matches.some(
    (match) => match.id === occupant.sourceMatchId,
  );
  if (!hasMatch) {
    throw new DivisionEntrySourceInvalidError({ reason: "matchNotFound" });
  }
  return {
    kind: occupant.outcome === "winner" ? "matchWinner" : "matchLoser",
    divisionId: target.id,
    matchId: occupant.sourceMatchId,
  };
};

export const assignSlotInDb: AssignSlotPort = (ids, input) =>
  runFirstRoundEdit<null>(ids, async (tx, current) => {
    // Member を作ってから試合が無いと分かると、トランザクションは巻き戻るが
    // 無駄な書き込みになる。先に試合の存在を確かめる。
    const exists = current.matchingConfig.matches.some(
      (match) =>
        match.bracket === "winners" &&
        match.round === 1 &&
        match.id === input.matchId,
    );
    if (!exists) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }

    // 同じ人・同じ参照が 2 つのスロットに居るとトーナメントが成り立たない。
    // 同じスロットに同じものを選び直した場合も、エラーで知らせて何もしない。
    // スロットに置かれていないエントリー（試合の削除で外れたものや旧画面で
    // 登録したもの）はそのまま使い回し、エントリーを重複させない。
    const rejectIfPlaced = (candidate: DivisionEntry | undefined): void => {
      if (candidate === undefined) {
        return;
      }
      const isPlaced = firstRoundPairs(current.matchingConfig).some((pair) =>
        pair.some(
          (slot) => slot.kind === "entry" && slot.entryId === candidate.id,
        ),
      );
      if (isPlaced) {
        throw new DivisionDuplicateEntryError({ divisionId: ids.divisionId });
      }
    };

    const maxSeed = current.entries.entries.reduce(
      (max, entry) => Math.max(max, entry.seed),
      -1,
    );

    let entry: DivisionEntry;
    let reused: boolean;
    if (input.occupant.mode === "existing" || input.occupant.mode === "new") {
      const memberId = await resolveMemberId(
        tx,
        ids.organizationId,
        input.occupant,
      );
      const participantId = await resolveParticipantId(
        tx,
        ids.tournamentId,
        memberId,
      );
      const found = current.entries.entries.find(
        (item) => item.participantId === participantId,
      );
      rejectIfPlaced(found);
      entry = found ?? { id: randomUUID(), participantId, seed: maxSeed + 1 };
      reused = found !== undefined;
    } else {
      const source = await toEntrySource(tx, ids, input.occupant);
      const found = current.entries.entries.find(
        (item) => item.source !== undefined && sameSource(item.source, source),
      );
      rejectIfPlaced(found);
      entry = found ?? { id: randomUUID(), seed: maxSeed + 1, source };
      reused = found !== undefined;
    }

    const placed = setFirstRoundSlot(
      current.matchingConfig,
      input.matchId,
      input.slotIndex,
      { kind: "entry", entryId: entry.id },
    );
    if (placed === null) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }

    const pushedOut =
      placed.replaced.kind === "entry" ? [placed.replaced.entryId] : [];
    const entries = removeEntries(
      {
        version: 1,
        entries: reused
          ? current.entries.entries
          : [...current.entries.entries, entry],
      },
      pushedOut,
    );

    return {
      next: { format: current.format, entries, matchingConfig: placed.config },
      value: null,
    };
  });
```

- [ ] **Step 7: テストが通ることを確認する**

Run: `pnpm test src/features/division && pnpm typecheck`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add src/features/division
git commit -F - <<'EOF'
feat(division): save slot entries that reference another division

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: スロット編集のモーダルに 2 つのモードを足す

**Files:**
- Create: `src/features/division/slot-source-options.ts`
- Create: `src/features/division/slot-source-options.test.ts`
- Modify: `src/components/division/SlotEditDialog.tsx`
- Modify: `src/components/division/EditableBracket.tsx`（`BracketEditor` に `sourceOptions`）
- Modify: `src/components/division/BracketEditorSetup.tsx`（props で受けて editor へ）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Test: `src/components/division/SlotEditDialog.test.tsx`

**Interfaces:**
- Consumes: Task 6 の `loadEntrySourceContext` の `divisions`、Task 8 の `slotOccupantSchema` が受け取るフィールド名（`mode` / `sourceDivisionId` / `sourceMatchId` / `outcome` / `rank`）
- Produces:
  - `type SlotSourceOption = { divisionId: string; divisionName: string; format: DivisionFormat; matches: { matchId: string; label: string }[]; maxRank: number }`
  - `buildSlotSourceOptions(divisions: EntrySourceDivision[], currentDivisionId: string): SlotSourceOption[]`
  - `BracketEditor` に `sourceOptions: SlotSourceOption[]`、`SlotEditDialog` の props に `sourceOptions: SlotSourceOption[]`

- [ ] **Step 1: 失敗するテストを書く（選択肢）**

`src/features/division/slot-source-options.test.ts` を新規作成する。

```ts
import { describe, expect, it } from "vitest";
import type { EntrySourceDivision } from "@/lib/division/entry-source";
import { buildSlotSourceOptions } from "./slot-source-options";

const division = (
  id: string,
  name: string,
  format: EntrySourceDivision["format"],
  entryCount: number,
  matchIds: string[],
): EntrySourceDivision => ({
  id,
  name,
  format,
  entries: {
    version: 1,
    entries: Array.from({ length: entryCount }, (_, index) => ({
      id: `${id}-e${index}`,
      participantId: `${id}-p${index}`,
      seed: index,
    })),
  },
  matchingConfig: {
    version: 1,
    matches: matchIds.map((matchId, order) => ({
      id: matchId,
      bracket: "winners",
      round: 1,
      order,
      matchName: matchId,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    })),
  },
  results: { version: 1, matches: [] },
});

describe("buildSlotSourceOptions", () => {
  it("自部門を除き、試合と順位の上限を返す", () => {
    const options = buildSlotSourceOptions(
      [
        division("d1", "予選トーナメント", "SINGLE_ELIMINATION", 2, ["q1"]),
        division("d2", "予選リーグA", "ROUND_ROBIN", 3, ["n1", "n2", "n3"]),
        division("d9", "決勝トーナメント", "SINGLE_ELIMINATION", 0, []),
      ],
      "d9",
    );

    expect(options).toEqual([
      {
        divisionId: "d1",
        divisionName: "予選トーナメント",
        format: "SINGLE_ELIMINATION",
        matches: [{ matchId: "q1", label: "1回戦 (1)" }],
        maxRank: 0,
      },
      {
        divisionId: "d2",
        divisionName: "予選リーグA",
        format: "ROUND_ROBIN",
        matches: [
          { matchId: "n1", label: "n1" },
          { matchId: "n2", label: "n2" },
          { matchId: "n3", label: "n3" },
        ],
        maxRank: 3,
      },
    ]);
  });

  it("展開済みの試合名があればそれを使う", () => {
    const withNames: EntrySourceDivision = {
      ...division("d1", "予選トーナメント", "SINGLE_ELIMINATION", 2, ["q1"]),
      matchNames: new Map([["q1", "第3試合"]]),
    };

    expect(buildSlotSourceOptions([withNames], "d9")[0].matches).toEqual([
      { matchId: "q1", label: "第3試合" },
    ]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test src/features/division/slot-source-options.test.ts`
Expected: FAIL。`Cannot find module './slot-source-options'`。

- [ ] **Step 3: 実装する**

`src/features/division/slot-source-options.ts` を新規作成する。

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
import type { EntrySourceDivision } from "@/lib/division/entry-source";
import { matchPositionLabel } from "@/lib/division/label";

/** スロット編集で選べる参照先の 1 部門。 */
export type SlotSourceOption = {
  divisionId: string;
  divisionName: string;
  format: DivisionFormat;
  /** 勝者・敗者に選べる試合。並びは保存順 */
  matches: { matchId: string; label: string }[];
  /** リーグのときに選べる順位の上限（エントリー数）。リーグ以外は 0 */
  maxRank: number;
};

/**
 * 参照先の選択肢。自部門は除く（自分の結果で自分の枠は決まらない）。
 *
 * 試合の名前は展開済みのもの（{{OverallSeq}} 入り）を優先し、無ければ位置
 * （「1回戦 (1)」）、位置を持たないリーグではテンプレートをそのまま出す。
 * 文言の決め方を lib/division/entry-source.ts の仮名と揃えてあるので、
 * 選んだ直後に画面に出る文字列と選択肢の文字列がそろう。
 */
export const buildSlotSourceOptions = (
  divisions: EntrySourceDivision[],
  currentDivisionId: string,
): SlotSourceOption[] =>
  divisions
    .filter((division) => division.id !== currentDivisionId)
    .map((division) => ({
      divisionId: division.id,
      divisionName: division.name,
      format: division.format,
      matches: division.matchingConfig.matches.map((match) => {
        const position = matchPositionLabel(match, division.format);
        return {
          matchId: match.id,
          label:
            division.matchNames?.get(match.id) ??
            (position === "" ? match.matchName : position),
        };
      }),
      maxRank:
        division.format === "ROUND_ROBIN" ? division.entries.entries.length : 0,
    }));
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/features/division/slot-source-options.test.ts`
Expected: PASS

- [ ] **Step 5: モーダルのテストを書く**

`src/components/division/SlotEditDialog.test.tsx` に足す。既存テストの `render` の呼び方に合わせ、`sourceOptions` を渡す（既存テスト全件に `sourceOptions={[]}` を足す必要がある）。

```ts
  const sourceOptions = [
    {
      divisionId: "d1",
      divisionName: "予選トーナメント",
      format: "SINGLE_ELIMINATION" as const,
      matches: [{ matchId: "q1", label: "第1試合" }],
      maxRank: 0,
    },
    {
      divisionId: "d2",
      divisionName: "予選リーグA",
      format: "ROUND_ROBIN" as const,
      matches: [{ matchId: "n1", label: "第2試合" }],
      maxRank: 3,
    },
  ];

  it("他部門の試合を選ぶモードでは試合と勝者・敗者を選べる", async () => {
    render(<SlotEditDialog {...baseProps} sourceOptions={sourceOptions} />);

    await userEvent.click(
      screen.getByRole("radio", { name: "他部門の試合の結果" }),
    );

    expect(screen.getByLabelText("参照する部門")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "第1試合" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "勝者" })).toBeChecked();
  });

  it("リーグ順位モードではリーグの部門だけが選べる", async () => {
    render(<SlotEditDialog {...baseProps} sourceOptions={sourceOptions} />);

    await userEvent.click(
      screen.getByRole("radio", { name: "他部門のリーグ順位" }),
    );

    const select = screen.getByLabelText("参照するリーグ");
    expect(select).toHaveValue("d2");
    expect(
      screen.queryByRole("option", { name: "予選トーナメント" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("順位")).toHaveAttribute("max", "3");
  });

  it("参照先が無ければモードのラジオを出さない", () => {
    render(<SlotEditDialog {...baseProps} sourceOptions={[]} />);

    expect(
      screen.queryByRole("radio", { name: "他部門の試合の結果" }),
    ).not.toBeInTheDocument();
  });
```

Run: `pnpm test src/components/division/SlotEditDialog.test.tsx`
Expected: FAIL

- [ ] **Step 6: モーダルを直す**

`src/components/division/SlotEditDialog.tsx`。import に型を足す:

```ts
import type { SlotSourceOption } from "@/features/division/slot-source-options";
```

props に足す:

```ts
  /** 参照できる他部門。自部門は呼び出し側で除いておく */
  sourceOptions: SlotSourceOption[],
```

（props は分割代入なので `sourceOptions` を引数リストと型の両方に足す。型は `sourceOptions: SlotSourceOption[];`）

`mode` の state を差し替え、参照用の state を足す:

```ts
type SlotMode = "existing" | "new" | "matchResult" | "leagueRank";
```

```ts
  // 試合を持たない部門は勝者・敗者の参照先にならない。順位はリーグだけ。
  const matchOptions = sourceOptions.filter(
    (option) => option.matches.length > 0,
  );
  const leagueOptions = sourceOptions.filter((option) => option.maxRank > 0);

  const [mode, setMode] = useState<SlotMode>(
    members.length === 0 ? "new" : "existing",
  );
  const [matchDivisionId, setMatchDivisionId] = useState(
    matchOptions[0]?.divisionId ?? "",
  );
  const [leagueDivisionId, setLeagueDivisionId] = useState(
    leagueOptions[0]?.divisionId ?? "",
  );
  const selectedMatches =
    matchOptions.find((option) => option.divisionId === matchDivisionId)
      ?.matches ?? [];
  const selectedLeague = leagueOptions.find(
    (option) => option.divisionId === leagueDivisionId,
  );
```

ラジオの行を差し替える（`members.length > 0 &&` の条件は外し、常に出す。ただし選べる枝が 1 つしか無いときは出さない）:

```tsx
          {[
            members.length > 0 ? { value: "existing" as const, label: "既存のメンバーから選ぶ" } : null,
            { value: "new" as const, label: "新しく登録する" },
            matchOptions.length > 0
              ? { value: "matchResult" as const, label: "他部門の試合の結果" }
              : null,
            leagueOptions.length > 0
              ? { value: "leagueRank" as const, label: "他部門のリーグ順位" }
              : null,
          ].filter((item) => item !== null).length > 1 && (
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              {members.length > 0 && (
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="modeChoice"
                    checked={mode === "existing"}
                    onChange={() => setMode("existing")}
                  />
                  既存のメンバーから選ぶ
                </label>
              )}
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="modeChoice"
                  checked={mode === "new"}
                  onChange={() => setMode("new")}
                />
                新しく登録する
              </label>
              {matchOptions.length > 0 && (
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="modeChoice"
                    checked={mode === "matchResult"}
                    onChange={() => setMode("matchResult")}
                  />
                  他部門の試合の結果
                </label>
              )}
              {leagueOptions.length > 0 && (
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="modeChoice"
                    checked={mode === "leagueRank"}
                    onChange={() => setMode("leagueRank")}
                  />
                  他部門のリーグ順位
                </label>
              )}
            </div>
          )}
```

入力欄の分岐は、既存の `mode === "existing" ? (...) : (...)` を 4 分岐に広げる。既存の 2 つは中身を変えず、新しい 2 つを足す:

```tsx
          {mode === "matchResult" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-match-division`}
                  className="block text-sm font-medium text-slate-700"
                >
                  参照する部門
                </label>
                <select
                  id={`${titleId}-match-division`}
                  name="sourceDivisionId"
                  value={matchDivisionId}
                  onChange={(event) => setMatchDivisionId(event.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {matchOptions.map((option) => (
                    <option key={option.divisionId} value={option.divisionId}>
                      {option.divisionName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-match`}
                  className="block text-sm font-medium text-slate-700"
                >
                  参照する試合
                </label>
                <select
                  id={`${titleId}-match`}
                  name="sourceMatchId"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {selectedMatches.map((match) => (
                    <option key={match.matchId} value={match.matchId}>
                      {match.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="outcome"
                    value="winner"
                    defaultChecked
                  />
                  勝者
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" name="outcome" value="loser" />
                  敗者
                </label>
              </div>
            </div>
          )}

          {mode === "leagueRank" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-league`}
                  className="block text-sm font-medium text-slate-700"
                >
                  参照するリーグ
                </label>
                <select
                  id={`${titleId}-league`}
                  name="sourceDivisionId"
                  value={leagueDivisionId}
                  onChange={(event) => setLeagueDivisionId(event.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {leagueOptions.map((option) => (
                    <option key={option.divisionId} value={option.divisionId}>
                      {option.divisionName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={`${titleId}-rank`}
                  className="block text-sm font-medium text-slate-700"
                >
                  順位
                </label>
                <input
                  id={`${titleId}-rank`}
                  name="rank"
                  type="number"
                  min={1}
                  max={selectedLeague?.maxRank ?? 1}
                  defaultValue={1}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {/* 決まる条件を先に知らせる。同順位のときは空欄のままになる */}
              <p className="text-xs text-slate-500">
                リーグの全試合が終わると選手が決まります
              </p>
            </div>
          )}
```

既存の `mode === "existing" ? (…メンバー選択…) : (…新規登録…)` は `mode === "existing" && (…)` と `mode === "new" && (…)` の 2 つに分ける（4 モードあるため三項では書けない）。

送信ボタンの文言は「この選手にする」のまま変えない（参照でも「この枠をこれにする」意味で通じる。既存テストの文言を壊さない）。

- [ ] **Step 7: 受け渡しをつなぐ**

`src/components/division/EditableBracket.tsx` の `BracketEditor` に足す:

```ts
  /** 参照できる他部門。SlotEditDialog がモードの選択肢に使う */
  sourceOptions: SlotSourceOption[];
```

`SlotEditDialog` を描いている箇所に `sourceOptions={sourceOptions}` を渡す（`BracketEditor` を分割代入している引数リストにも足す）。import は `import type { SlotSourceOption } from "@/features/division/slot-source-options";`。

`src/components/division/BracketEditorSetup.tsx` — props に足す:

```ts
  /** 参照できる他部門。ページが buildSlotSourceOptions で作って渡す */
  sourceOptions: SlotSourceOption[];
```

`editor` のオブジェクトに `sourceOptions,` を足す。

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx` — import に `buildSlotSourceOptions` を足し、`BracketEditorSetup` に渡す:

```tsx
            sourceOptions={buildSlotSourceOptions(
              entrySources.divisions,
              division.id,
            )}
```

- [ ] **Step 8: 通し確認**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS（`pnpm lint` の CRLF 由来の既存の指摘は対象外）

- [ ] **Step 9: コミット**

```bash
git add src/features/division/slot-source-options.ts src/features/division/slot-source-options.test.ts src/components/division src/app
git commit -F - <<'EOF'
feat(division): let the slot dialog reference another division's result

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 10: 設定画面に警告を出す

**Files:**
- Modify: `src/components/division/BracketEditorSetup.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Test: `src/components/division/BracketEditorSetup.test.tsx`

**Interfaces:**
- Consumes: Task 6 の `loadEntrySourceContext` が返す `views.get(divisionId).warnings`（`string[]`）
- Produces: `BracketEditorSetup` の props に `warnings?: string[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/BracketEditorSetup.test.tsx` に足す。既存テストの `render` の引数に合わせること。

```ts
  it("参照の警告を 1 行ずつ出す", () => {
    render(
      <BracketEditorSetup
        {...baseProps}
        warnings={[
          "予選リーグA 1位 は同順位のため決まりません",
          "参照が循環しているため、選手が決まりません",
        ]}
      />,
    );

    expect(
      screen.getByText("予選リーグA 1位 は同順位のため決まりません"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("参照が循環しているため、選手が決まりません"),
    ).toBeInTheDocument();
  });
```

Run: `pnpm test src/components/division/BracketEditorSetup.test.tsx`
Expected: FAIL

- [ ] **Step 2: 実装する**

props に足す:

```ts
  /**
   * 参照エントリーについての注意書き（同順位・循環・参照切れ・重複）。
   * 保存は止めない方針なので、気づけるようここに出す。
   */
  warnings?: string[];
```

分割代入に `warnings = []` を足し、`{locked && <LockedNotice />}` の下に描く:

```tsx
      {warnings.map((warning) => (
        <Notice key={warning}>{warning}</Notice>
      ))}
```

- [ ] **Step 3: ページから渡す**

`setup/page.tsx` の `BracketEditorSetup` に足す:

```tsx
            warnings={entrySources.views.get(division.id)?.warnings}
```

- [ ] **Step 4: 通し確認**

Run: `pnpm test src/components/division src/app && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/division/BracketEditorSetup.tsx src/components/division/BracketEditorSetup.test.tsx src/app
git commit -F - <<'EOF'
feat(division): warn about ties, cycles and duplicate source entries

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 11: エントリー一覧でも仮名を出す

シングルエリミネーションの設定画面はエントリー一覧を出さない（ブラケット上で編集する）。ただし `/edit` で形式を書き換えた部門は、参照エントリーを持ったまま `DivisionSetup` の一覧に現れうる。そのときに「（不明な参加者）」と出るのを防ぐ。

**Files:**
- Modify: `src/components/division/EntryList.tsx`
- Modify: `src/components/division/DivisionSetup.tsx`（`entryLabels` を `EntryList` へ）
- Test: `src/components/division/EntryList.test.tsx`

**Interfaces:**
- Consumes: Task 6 で `DivisionSetup` に足した `entryLabels`
- Produces: `EntryList` の props に `entryLabels?: ReadonlyMap<string, string>`

- [ ] **Step 1: 失敗するテストを書く**

```ts
  it("参照エントリーは仮名を出し、選手番号の変更は出さない", () => {
    render(
      <EntryList
        {...baseProps}
        entries={[
          {
            id: "x1",
            seed: 0,
            source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
          },
        ]}
        participants={[]}
        entryLabels={new Map([["x1", "予選リーグA 1位"]])}
      />,
    );

    expect(screen.getByText("予選リーグA 1位")).toBeInTheDocument();
    expect(screen.queryByText("（不明な参加者）")).not.toBeInTheDocument();
  });
```

Run: `pnpm test src/components/division/EntryList.test.tsx`
Expected: FAIL

- [ ] **Step 2: 実装する**

`EntryList` の props に足す:

```ts
  /** 参照エントリーの表示名（entryId → 名前）。ページが entry-source から作る */
  entryLabels?: ReadonlyMap<string, string>;
```

行の名前を差し替える（`participant?.name ?? "（不明な参加者）"` の箇所）:

```tsx
                  {participant?.name ??
                    entryLabels?.get(entry.id) ??
                    "（不明な参加者）"}
```

選手番号フォームと読みの行は `participant !== undefined` の条件で既に出ないので、変更は不要。

- [ ] **Step 3: `DivisionSetup` から渡す**

`EntryList` に `entryLabels={entryLabels}` を渡す（props は Task 6 で追加済み）。

- [ ] **Step 4: 通し確認**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: すべて PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/division
git commit -F - <<'EOF'
feat(division): show placeholder names in the entry list

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## 実装後の手動確認

`BYPASS_AUTH=1` で開発サーバーを起動し、Cookie に `USER_ID=1` を入れて確認する（`AGENTS.md`）。

1. 大会にリーグ部門（3 人）と、シングルエリミネーションの「決勝トーナメント」を作る。
2. 決勝トーナメントの設定画面で「試合を追加」し、スロットの鉛筆から「他部門のリーグ順位」で 1 位を置く。
3. ブラケットに「予選リーグA 1位」と出ること。結果入力の画面でその試合の勝者ボタンが出ないこと。
4. リーグの全試合に結果を入れると、ブラケットの表示が実際の選手名に変わること。結果入力の勝者ボタンが出ること。
5. 巴戦（3 人が 1 勝 1 敗）にすると、設定画面に「同順位のため決まりません」が出て、ブラケットは仮名に戻ること。
6. 印刷ページ（`/t/<id>/print`）と公開ページでも同じ文字列が出ること。
