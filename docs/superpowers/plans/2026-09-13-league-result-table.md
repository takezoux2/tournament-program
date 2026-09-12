# リーグ戦の結果表（星取表＋順位表） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ROUND_ROBIN の部門について、勝敗込みの星取表と順位表を部門詳細ページと公開ページに出す。

**Architecture:** `features/division/round-robin/standings.ts` に純粋関数 `toLeagueTableView` を置き、`components/division/LeagueResultTable.tsx` がそれを table に描く。形式による振り分けは新設の `components/division/DivisionMatchingView.tsx` が担い、部門詳細ページと公開ページは `DivisionBracket` の代わりにこれを呼ぶ。`DivisionBracket` と編集画面の `LeagueCrossTable` は触らない。

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript, Vitest + Testing Library, Biome, Tailwind v4, pnpm。

Spec: `docs/superpowers/specs/2026-09-13-league-result-table-design.md`

## Global Constraints

- パッケージ操作・スクリプト実行は `pnpm`（`pnpm vitest run <path>`, `pnpm lint`, `pnpm typecheck`）
- 勝点は 勝 3・分 1・負 0。順位は 勝点 → 勝ち数 → 同点者どうしの直接対決の勝点 → 同順位。同順位は番号を飛ばす（1, 1, 3）
- 未実施の試合は集計に含めない。勝者 id がどちらのスロットにも居ない記録は未実施として読む
- 行・列とも順位順（同順位の中はシード昇順）。`headers` と各 `rows[].cells` は同じ並び・同じ長さ
- 名前を引けないエントリーは「（不明な参加者）」
- 文言（既存に合わせる）: 「組み合わせが未作成です」「この対戦表はリーグの形ではありません」「部門のデータを読み込めませんでした」「まだエントリーがありません」「「{形式名}」のブラケット表示はまだ対応していません」
- `DivisionBracket.tsx` と `LeagueCrossTable.tsx`、`round-robin/view.ts` は変更しない
- コメントは既存ファイルと同じく日本語で「なぜ」を書く
- コミットは `git commit` 末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` を付ける
- Windows のチェックアウトでは CRLF 由来の lint エラーが全体に出る。lint は内容で判断し、自分が触ったファイルは `pnpm biome check --write <path>` で整形する

## 実行前の準備（worktree を切ったあと）

- [ ] `.env` を本体チェックアウト（`E:\program\takezoux2\tournament-program\.env`）からコピーする
- [ ] `pnpm install` 済みでなければ実行する
- [ ] `pnpm exec next typegen` を実行する（`PageProps` などの型が無いと typecheck が落ちる）

---

### Task 1: 純粋ドメイン `toLeagueTableView`

**Files:**
- Create: `src/features/division/round-robin/standings.ts`
- Test: `src/features/division/round-robin/standings.test.ts`

**Interfaces:**
- Consumes: `MatchingConfig`, `DivisionEntries`, `DivisionResults` from `@/lib/division/types`
- Produces:
  ```ts
  export type LeagueOutcome = "win" | "loss" | "draw";
  export type LeagueTableCell =
    | { kind: "self" }
    | { kind: "match"; matchNumber: string; outcome: LeagueOutcome | null }
    | { kind: "none" };
  export type LeagueTableRow = {
    entryId: string; label: string; rank: number;
    wins: number; draws: number; losses: number; points: number;
    cells: LeagueTableCell[];
  };
  export type LeagueTableView = {
    headers: { entryId: string; label: string }[];
    rows: LeagueTableRow[];
  };
  export const toLeagueTableView: (
    config: MatchingConfig,
    entries: DivisionEntries,
    results: DivisionResults,
    participants: { id: string; name: string }[],
  ) => LeagueTableView;
  ```

- [ ] **Step 1: テストを書く**

`src/features/division/round-robin/standings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  BracketMatch,
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";
import { toLeagueTableView } from "./standings";

const entries: DivisionEntries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
    { id: "e4", participantId: "p4", seed: 3 },
  ],
};

const participants = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
  { id: "p4", name: "田中" },
];

const match = (
  order: number,
  left: string,
  right: string,
): BracketMatch => ({
  id: `r1-${order}`,
  bracket: "winners",
  round: 1,
  order,
  sequence: order,
  matchNumber: String(order + 1),
  slots: [
    { kind: "entry", entryId: left },
    { kind: "entry", entryId: right },
  ],
});

// buildRoundRobin(4 人) と同じ並び。第1試合 = e1 vs e4 ... 第6試合 = e3 vs e4
const config: MatchingConfig = {
  version: 1,
  matches: [
    match(0, "e1", "e4"),
    match(1, "e2", "e3"),
    match(2, "e1", "e3"),
    match(3, "e4", "e2"),
    match(4, "e1", "e2"),
    match(5, "e3", "e4"),
  ],
};

const results = (
  records: [matchId: string, winnerEntryId: string | null][],
): DivisionResults => ({
  version: 1,
  matches: records.map(([matchId, winnerEntryId]) => ({
    matchId,
    winnerEntryId,
  })),
});

const summary = (view: ReturnType<typeof toLeagueTableView>) =>
  view.rows.map((row) => [
    row.entryId,
    row.rank,
    row.wins,
    row.draws,
    row.losses,
    row.points,
  ]);

describe("toLeagueTableView", () => {
  it("全試合済みなら勝点順に並び、順位は 1 から連番になる", () => {
    // e1 が全勝、e2 が e3・e4 に勝ち、e3 が e4 に勝つ
    const view = toLeagueTableView(
      config,
      entries,
      results([
        ["r1-0", "e1"],
        ["r1-1", "e2"],
        ["r1-2", "e1"],
        ["r1-3", "e2"],
        ["r1-4", "e1"],
        ["r1-5", "e3"],
      ]),
      participants,
    );

    expect(summary(view)).toEqual([
      ["e1", 1, 3, 0, 0, 9],
      ["e2", 2, 2, 0, 1, 6],
      ["e3", 3, 1, 0, 2, 3],
      ["e4", 4, 0, 0, 3, 0],
    ]);
  });

  it("見出しと各行のマスは順位順で、対角は self になる", () => {
    const view = toLeagueTableView(
      config,
      entries,
      results([
        ["r1-0", "e1"],
        ["r1-1", "e2"],
        ["r1-2", "e1"],
        ["r1-3", "e2"],
        ["r1-4", "e1"],
        ["r1-5", "e3"],
      ]),
      participants,
    );

    expect(view.headers).toEqual([
      { entryId: "e1", label: "山田" },
      { entryId: "e2", label: "佐藤" },
      { entryId: "e3", label: "鈴木" },
      { entryId: "e4", label: "田中" },
    ]);
    expect(view.rows[0].cells).toEqual([
      { kind: "self" },
      { kind: "match", matchNumber: "5", outcome: "win" },
      { kind: "match", matchNumber: "3", outcome: "win" },
      { kind: "match", matchNumber: "1", outcome: "win" },
    ]);
    // e2 の行。e1 には負け、e3・e4 には勝ち。表は左右対称になる
    expect(view.rows[1].cells).toEqual([
      { kind: "match", matchNumber: "5", outcome: "loss" },
      { kind: "self" },
      { kind: "match", matchNumber: "2", outcome: "win" },
      { kind: "match", matchNumber: "4", outcome: "win" },
    ]);
  });

  it("未実施の試合は集計せず、マスには試合番号だけ残す", () => {
    const view = toLeagueTableView(
      config,
      entries,
      results([["r1-0", "e1"]]),
      participants,
    );

    // e2・e3・e4 は勝点も勝ち数も 0 で、直接対決も未実施なので全員 2 位
    expect(summary(view)).toEqual([
      ["e1", 1, 1, 0, 0, 3],
      ["e2", 2, 0, 0, 0, 0],
      ["e3", 2, 0, 0, 0, 0],
      ["e4", 2, 0, 0, 1, 0],
    ]);
    expect(view.rows[1].cells[2]).toEqual({
      kind: "match",
      matchNumber: "2",
      outcome: null,
    });
  });

  it("引き分けは両者に 1 点で、両者とも draw になる", () => {
    const view = toLeagueTableView(
      config,
      entries,
      results([["r1-4", null]]),
      participants,
    );

    expect(summary(view)).toEqual([
      ["e1", 1, 0, 1, 0, 1],
      ["e2", 1, 0, 1, 0, 1],
      ["e3", 3, 0, 0, 0, 0],
      ["e4", 3, 0, 0, 0, 0],
    ]);
    expect(view.rows[0].cells[1]).toEqual({
      kind: "match",
      matchNumber: "5",
      outcome: "draw",
    });
    expect(view.rows[1].cells[0]).toEqual({
      kind: "match",
      matchNumber: "5",
      outcome: "draw",
    });
  });

  it("勝点と勝ち数が並んだら直接対決で上下を決める", () => {
    // e1: e3・e4 に勝ち e2 に負け（6 点）。e2: e1・e4 に勝ち e3 に負け（6 点）
    // e3: e2 に勝ち e1・e4 に負け（3 点）。e4: e3 に勝ち e1・e2 に負け（3 点）
    const view = toLeagueTableView(
      config,
      entries,
      results([
        ["r1-0", "e1"],
        ["r1-1", "e3"],
        ["r1-2", "e1"],
        ["r1-3", "e2"],
        ["r1-4", "e2"],
        ["r1-5", "e4"],
      ]),
      participants,
    );

    // シード順なら e1, e2 / e3, e4 だが、直接対決で e2 > e1、e4 > e3
    expect(summary(view)).toEqual([
      ["e2", 1, 2, 0, 1, 6],
      ["e1", 2, 2, 0, 1, 6],
      ["e4", 3, 1, 0, 2, 3],
      ["e3", 4, 1, 0, 2, 3],
    ]);
    expect(view.headers.map((header) => header.entryId)).toEqual([
      "e2",
      "e1",
      "e4",
      "e3",
    ]);
  });

  it("巴戦は同順位にし、次の順位は飛ばす", () => {
    // e1 > e2 > e3 > e1 の三すくみ。e4 は全敗
    const view = toLeagueTableView(
      config,
      entries,
      results([
        ["r1-0", "e1"],
        ["r1-1", "e2"],
        ["r1-2", "e3"],
        ["r1-3", "e2"],
        ["r1-4", "e1"],
        ["r1-5", "e3"],
      ]),
      participants,
    );

    expect(summary(view)).toEqual([
      ["e1", 1, 2, 0, 1, 6],
      ["e2", 1, 2, 0, 1, 6],
      ["e3", 1, 2, 0, 1, 6],
      ["e4", 4, 0, 0, 3, 0],
    ]);
  });

  it("勝者がどちらのスロットにも居ない記録は未実施として読む", () => {
    const view = toLeagueTableView(
      config,
      entries,
      results([["r1-0", "e9"]]),
      participants,
    );

    expect(summary(view)).toEqual([
      ["e1", 1, 0, 0, 0, 0],
      ["e2", 1, 0, 0, 0, 0],
      ["e3", 1, 0, 0, 0, 0],
      ["e4", 1, 0, 0, 0, 0],
    ]);
    expect(view.rows[0].cells[3]).toEqual({
      kind: "match",
      matchNumber: "1",
      outcome: null,
    });
  });

  it("entry 以外のスロットを持つ試合は無視して落ちない", () => {
    const broken: MatchingConfig = {
      version: 1,
      matches: [
        match(0, "e1", "e2"),
        {
          ...match(1, "e3", "e4"),
          slots: [
            { kind: "entry", entryId: "e3" },
            { kind: "winnerOf", matchId: "r1-0" },
          ],
        },
      ],
    };

    const view = toLeagueTableView(broken, entries, results([]), participants);

    expect(view.rows[2].cells[3]).toEqual({ kind: "none" });
    expect(view.rows[0].cells[1]).toEqual({
      kind: "match",
      matchNumber: "1",
      outcome: null,
    });
  });

  it("名前を引けないエントリーは（不明な参加者）にする", () => {
    const view = toLeagueTableView(config, entries, results([]), [
      participants[0],
    ]);

    expect(view.headers.map((header) => header.label)).toEqual([
      "山田",
      "（不明な参加者）",
      "（不明な参加者）",
      "（不明な参加者）",
    ]);
  });

  it("エントリーが無ければ見出しも行も空", () => {
    const view = toLeagueTableView(
      { version: 1, matches: [] },
      { version: 1, entries: [] },
      results([]),
      participants,
    );

    expect(view).toEqual({ headers: [], rows: [] });
  });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `pnpm vitest run src/features/division/round-robin/standings.test.ts`
Expected: FAIL — `./standings` が見つからない

- [ ] **Step 3: 実装する**

`src/features/division/round-robin/standings.ts`:

```ts
import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";

/** 1 試合の結果を片方の側から見た値。 */
export type LeagueOutcome = "win" | "loss" | "draw";

/** 結果表の 1 マス。outcome が null の対戦は未実施。 */
export type LeagueTableCell =
  | { kind: "self" }
  | { kind: "match"; matchNumber: string; outcome: LeagueOutcome | null }
  | { kind: "none" };

/** 結果表の 1 行。順位表の列（勝・分・敗・勝点・順位）も持つ。 */
export type LeagueTableRow = {
  entryId: string;
  label: string;
  rank: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  cells: LeagueTableCell[];
};

/** 結果表の全体。headers と各 rows[].cells は同じ並び・同じ長さ。 */
export type LeagueTableView = {
  headers: { entryId: string; label: string }[];
  rows: LeagueTableRow[];
};

/** 勝点。勝 3・分 1・負 0。 */
const POINTS: Record<LeagueOutcome, number> = { win: 3, draw: 1, loss: 0 };

/** 対戦を「左の側から見た結果」に読み替えたもの。outcome null は未実施。 */
type PlayedMatch = {
  matchNumber: string;
  left: string;
  right: string;
  outcome: LeagueOutcome | null;
};

type Tally = { wins: number; draws: number; losses: number; points: number };

const emptyTally = (): Tally => ({ wins: 0, draws: 0, losses: 0, points: 0 });

const flip = (outcome: LeagueOutcome): LeagueOutcome => {
  switch (outcome) {
    case "win":
      return "loss";
    case "loss":
      return "win";
    case "draw":
      return "draw";
  }
};

/**
 * 組み合わせと勝敗記録を突き合わせて、両方のスロットが entry の試合だけを返す。
 *
 * 勝者がどちらのスロットにも居ない記録は未実施として読む。例外を投げないのは
 * lib/division/resolve.ts と同じ思想で、壊れた記録 1 件で表全体が見えなく
 * なる方が困るため。entry 以外のスロットを持つ試合（形式違いの木）は
 * 呼び出し側が isRoundRobinShape で弾く前提だが、ここでも落ちないよう無視する。
 */
const readMatches = (
  config: MatchingConfig,
  results: DivisionResults,
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
      matchNumber: match.matchNumber,
      left: first.entryId,
      right: second.entryId,
      outcome,
    });
  }
  return played;
};

/** 指定したエントリーの集計。matches のうち未実施は数えない。 */
const tallyAll = (
  entryIds: Iterable<string>,
  matches: PlayedMatch[],
): Map<string, Tally> => {
  const tallies = new Map<string, Tally>();
  for (const entryId of entryIds) {
    tallies.set(entryId, emptyTally());
  }
  const add = (entryId: string, outcome: LeagueOutcome) => {
    const tally = tallies.get(entryId);
    if (tally === undefined) {
      return;
    }
    tally.points += POINTS[outcome];
    if (outcome === "win") {
      tally.wins += 1;
    } else if (outcome === "draw") {
      tally.draws += 1;
    } else {
      tally.losses += 1;
    }
  };
  for (const match of matches) {
    if (match.outcome === null) {
      continue;
    }
    add(match.left, match.outcome);
    add(match.right, flip(match.outcome));
  }
  return tallies;
};

type Standing = {
  entryId: string;
  seed: number;
  tally: Tally;
  /** 勝点・勝ち数が並んだ集団の中だけで数えた勝点。集団に居なければ 0 */
  headToHead: number;
  rank: number;
};

/**
 * 順位を付ける。勝点 → 勝ち数 → 直接対決の勝点 → 同順位。
 *
 * 直接対決は「勝点と勝ち数が同じ集団」の中の試合だけで勝点を数え直す。
 * 集団が 3 人以上で巴戦になっていれば全員同じ値になり、同順位に落ちる。
 * 同順位の番号は飛ばす（1, 1, 3）。
 */
const rankStandings = (
  sortedBySeed: { entryId: string; seed: number }[],
  matches: PlayedMatch[],
): Standing[] => {
  const totals = tallyAll(
    sortedBySeed.map((entry) => entry.entryId),
    matches,
  );
  const standings: Standing[] = sortedBySeed.map((entry) => ({
    entryId: entry.entryId,
    seed: entry.seed,
    tally: totals.get(entry.entryId) ?? emptyTally(),
    headToHead: 0,
    rank: 0,
  }));
  standings.sort(
    (left, right) =>
      right.tally.points - left.tally.points ||
      right.tally.wins - left.tally.wins ||
      left.seed - right.seed,
  );

  // 勝点・勝ち数が同じ連続区間を 1 集団として直接対決を見る
  const ordered: Standing[] = [];
  let start = 0;
  while (start < standings.length) {
    let end = start + 1;
    while (
      end < standings.length &&
      standings[end].tally.points === standings[start].tally.points &&
      standings[end].tally.wins === standings[start].tally.wins
    ) {
      end += 1;
    }
    const group = standings.slice(start, end);
    if (group.length > 1) {
      const ids = new Set(group.map((standing) => standing.entryId));
      const inner = tallyAll(
        ids,
        matches.filter((match) => ids.has(match.left) && ids.has(match.right)),
      );
      for (const standing of group) {
        standing.headToHead = inner.get(standing.entryId)?.points ?? 0;
      }
      group.sort(
        (left, right) =>
          right.headToHead - left.headToHead || left.seed - right.seed,
      );
    }
    ordered.push(...group);
    start = end;
  }

  // 順位番号。直前と 3 つの値がすべて同じなら同順位、違えば「自分より上の人数 + 1」
  ordered.forEach((standing, index) => {
    const previous = ordered[index - 1];
    const tied =
      previous !== undefined &&
      previous.tally.points === standing.tally.points &&
      previous.tally.wins === standing.tally.wins &&
      previous.headToHead === standing.headToHead;
    standing.rank = tied ? previous.rank : index + 1;
  });
  return ordered;
};

/**
 * 勝敗込みの星取表と順位表を 1 つの表にまとめて返す。
 * 行・列とも順位順（同順位の中はシード昇順）。
 */
export const toLeagueTableView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  results: DivisionResults,
  participants: { id: string; name: string }[],
): LeagueTableView => {
  const nameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const sortedBySeed = [...entries.entries].sort(
    (left, right) => left.seed - right.seed,
  );
  const labelByEntryId = new Map(
    sortedBySeed.map((entry) => [
      entry.id,
      // 文言は lib/division/label.ts と揃える
      nameById.get(entry.participantId) ?? "（不明な参加者）",
    ]),
  );

  const matches = readMatches(config, results);
  const standings = rankStandings(sortedBySeed, matches);

  // 「エントリー 2 つの組 → 対戦」の対照表。キーは順序を持たせない
  const pairKey = (left: string, right: string): string =>
    left < right ? `${left} ${right}` : `${right} ${left}`;
  const matchByPair = new Map(
    matches.map((match) => [pairKey(match.left, match.right), match]),
  );

  const headers = standings.map((standing) => ({
    entryId: standing.entryId,
    label: labelByEntryId.get(standing.entryId) ?? "（不明な参加者）",
  }));

  return {
    headers,
    rows: standings.map((standing) => ({
      entryId: standing.entryId,
      label: labelByEntryId.get(standing.entryId) ?? "（不明な参加者）",
      rank: standing.rank,
      wins: standing.tally.wins,
      draws: standing.tally.draws,
      losses: standing.tally.losses,
      points: standing.tally.points,
      cells: headers.map((column): LeagueTableCell => {
        if (column.entryId === standing.entryId) {
          return { kind: "self" };
        }
        const match = matchByPair.get(
          pairKey(standing.entryId, column.entryId),
        );
        if (match === undefined) {
          return { kind: "none" };
        }
        // 対戦は左の側から見た値なので、行が右側なら裏返す
        const outcome =
          match.outcome === null
            ? null
            : match.left === standing.entryId
              ? match.outcome
              : flip(match.outcome);
        return { kind: "match", matchNumber: match.matchNumber, outcome };
      }),
    })),
  };
};
```

- [ ] **Step 4: 通ることを確かめる**

Run: `pnpm vitest run src/features/division/round-robin/standings.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 5: 整形して typecheck**

Run: `pnpm biome check --write src/features/division/round-robin/standings.ts src/features/division/round-robin/standings.test.ts && pnpm typecheck`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/features/division/round-robin/standings.ts src/features/division/round-robin/standings.test.ts
git commit -m "feat(division): compute the league standings table

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `LeagueResultTable` コンポーネント

**Files:**
- Create: `src/components/division/LeagueResultTable.tsx`
- Test: `src/components/division/LeagueResultTable.test.tsx`

**Interfaces:**
- Consumes: `LeagueTableView`, `LeagueTableCell`, `LeagueOutcome` from `@/features/division/round-robin/standings`（Task 1）
- Produces: `export function LeagueResultTable({ table }: { table: LeagueTableView }): JSX.Element`

- [ ] **Step 1: テストを書く**

`src/components/division/LeagueResultTable.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LeagueTableView } from "@/features/division/round-robin/standings";
import { LeagueResultTable } from "./LeagueResultTable";

const table: LeagueTableView = {
  headers: [
    { entryId: "e1", label: "山田" },
    { entryId: "e2", label: "佐藤" },
    { entryId: "e3", label: "鈴木" },
  ],
  rows: [
    {
      entryId: "e1",
      label: "山田",
      rank: 1,
      wins: 1,
      draws: 1,
      losses: 0,
      points: 4,
      cells: [
        { kind: "self" },
        { kind: "match", matchNumber: "1", outcome: "win" },
        { kind: "match", matchNumber: "3", outcome: "draw" },
      ],
    },
    {
      entryId: "e2",
      label: "佐藤",
      rank: 2,
      wins: 0,
      draws: 0,
      losses: 1,
      points: 0,
      cells: [
        { kind: "match", matchNumber: "1", outcome: "loss" },
        { kind: "self" },
        { kind: "match", matchNumber: "2", outcome: null },
      ],
    },
    {
      entryId: "e3",
      label: "鈴木",
      rank: 2,
      wins: 0,
      draws: 1,
      losses: 0,
      points: 1,
      cells: [
        { kind: "match", matchNumber: "3", outcome: "draw" },
        { kind: "match", matchNumber: "2", outcome: null },
        { kind: "self" },
      ],
    },
  ],
};

describe("LeagueResultTable", () => {
  it("順位表の列見出しを出す", () => {
    render(<LeagueResultTable table={table} />);

    for (const label of ["順位", "勝", "分", "敗", "勝点"]) {
      expect(
        screen.getByRole("columnheader", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("エントリーを行と列の見出しに出す", () => {
    render(<LeagueResultTable table={table} />);

    // 行見出しと列見出しで 2 回ずつ出る
    expect(screen.getAllByText("山田")).toHaveLength(2);
    expect(screen.getAllByText("鈴木")).toHaveLength(2);
  });

  it("各行に順位・勝・分・敗・勝点を出す", () => {
    render(<LeagueResultTable table={table} />);

    const row = screen.getAllByRole("row")[1];
    const cells = within(row).getAllByRole("cell");
    // 順位 / 3 マス / 勝 / 分 / 敗 / 勝点 の順。名前は rowheader なので含まれない
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "1",
      "—",
      "○第1試合",
      "△第3試合",
      "1",
      "1",
      "0",
      "4",
    ]);
  });

  it("勝敗の印に読み上げ用の名前を付ける", () => {
    render(<LeagueResultTable table={table} />);

    expect(screen.getAllByLabelText("勝ち")).toHaveLength(1);
    expect(screen.getAllByLabelText("負け")).toHaveLength(1);
    expect(screen.getAllByLabelText("引き分け")).toHaveLength(2);
  });

  it("未実施のマスは試合番号だけを出す", () => {
    render(<LeagueResultTable table={table} />);

    const row = screen.getAllByRole("row")[2];
    const cell = within(row).getAllByRole("cell")[3];
    expect(cell).toHaveTextContent("第2試合");
    expect(within(cell).queryByRole("img")).toBeNull();
  });

  it("エントリーが無いときは案内を出す", () => {
    render(<LeagueResultTable table={{ headers: [], rows: [] }} />);

    expect(screen.getByText("まだエントリーがありません")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `pnpm vitest run src/components/division/LeagueResultTable.test.tsx`
Expected: FAIL — `./LeagueResultTable` が見つからない

- [ ] **Step 3: 実装する**

`src/components/division/LeagueResultTable.tsx`:

```tsx
import type {
  LeagueOutcome,
  LeagueTableCell,
  LeagueTableView,
} from "@/features/division/round-robin/standings";

/** ○●△ の印と、読み上げ用の名前。記号だけでは意味が伝わらないため。 */
const OUTCOME_MARKS: Record<LeagueOutcome, { mark: string; label: string }> =
  {
    win: { mark: "○", label: "勝ち" },
    loss: { mark: "●", label: "負け" },
    draw: { mark: "△", label: "引き分け" },
  };

const headerClassName =
  "whitespace-nowrap border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-500";

const numberClassName =
  "whitespace-nowrap border-b border-slate-100 px-3 py-2 text-center text-sm text-slate-800";

/**
 * 1 マスの中身。対戦済みは印を大きく、試合番号を小さく添える。
 * 未実施は試合番号だけを淡色で出し、「まだ」であることを見た目で分ける。
 */
const CellContent = ({ cell }: { cell: LeagueTableCell }) => {
  switch (cell.kind) {
    case "self":
      return <>—</>;
    case "none":
      return null;
    case "match": {
      const number = (
        <span className="block text-[10px] text-slate-400">
          第{cell.matchNumber}試合
        </span>
      );
      if (cell.outcome === null) {
        return number;
      }
      const { mark, label } = OUTCOME_MARKS[cell.outcome];
      return (
        <>
          <span
            role="img"
            aria-label={label}
            className="block text-base leading-tight text-slate-800"
          >
            {mark}
          </span>
          {number}
        </>
      );
    }
  }
};

/**
 * 勝敗込みの星取表と順位表を 1 つにまとめた表。
 * 行・列はどちらも順位順で渡ってくる（並べ替えはドメイン側の責務）。
 * 人数が増えると横に広がるので、横スクロールできる箱に入れる。
 */
export function LeagueResultTable({ table }: { table: LeagueTableView }) {
  if (table.headers.length === 0) {
    return <p className="text-sm text-slate-600">まだエントリーがありません</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={headerClassName}>
              順位
            </th>
            <th scope="col" className={`${headerClassName} text-left`}>
              名前
            </th>
            {table.headers.map((header) => (
              <th key={header.entryId} scope="col" className={headerClassName}>
                {header.label}
              </th>
            ))}
            <th scope="col" className={headerClassName}>
              勝
            </th>
            <th scope="col" className={headerClassName}>
              分
            </th>
            <th scope="col" className={headerClassName}>
              敗
            </th>
            <th scope="col" className={headerClassName}>
              勝点
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.entryId}>
              <td className={`${numberClassName} font-medium`}>{row.rank}</td>
              <th
                scope="row"
                className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-left font-medium text-slate-800"
              >
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  // 列の並びは headers と 1 対 1 なので、列の entryId を鍵にする
                  key={table.headers[index].entryId}
                  className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-center text-xs text-slate-600"
                >
                  <CellContent cell={cell} />
                </td>
              ))}
              <td className={numberClassName}>{row.wins}</td>
              <td className={numberClassName}>{row.draws}</td>
              <td className={numberClassName}>{row.losses}</td>
              <td className={`${numberClassName} font-medium`}>
                {row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `pnpm vitest run src/components/division/LeagueResultTable.test.tsx`
Expected: PASS（6 tests）

- [ ] **Step 5: 整形して typecheck**

Run: `pnpm biome check --write src/components/division/LeagueResultTable.tsx src/components/division/LeagueResultTable.test.tsx && pnpm typecheck`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/components/division/LeagueResultTable.tsx src/components/division/LeagueResultTable.test.tsx
git commit -m "feat(division): render the league result table

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `DivisionMatchingView` で形式を振り分ける

**Files:**
- Create: `src/components/division/DivisionMatchingView.tsx`
- Test: `src/components/division/DivisionMatchingView.test.tsx`

**Interfaces:**
- Consumes: `DivisionBracket`（既存）, `LeagueResultTable`（Task 2）, `toLeagueTableView`（Task 1）, `isRoundRobinShape` from `@/features/division/round-robin/build`, `parseDivisionEntries` / `parseMatchingConfig` / `parseDivisionResults` from `@/lib/division/parse`, `DIVISION_FORMAT_LABELS` from `@/features/division/format`, `Notice` from `./Notice`
- Produces:
  ```ts
  export const needsParticipants: (format: DivisionFormat) => boolean;
  export function DivisionMatchingView(props: {
    division: DivisionDetail;
    participants: DivisionParticipant[];
    heightClassName?: string;
  }): JSX.Element;
  ```

- [ ] **Step 1: テストを書く**

`src/components/division/DivisionMatchingView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";

// ブラケットの組み立ては DivisionBracket.test.tsx が見る。ここでは
// 「どの形式でどれを描くか」だけを確かめたいので、ブラケットは差し替える。
vi.mock("./DivisionBracket", () => ({
  DivisionBracket: ({ heightClassName }: { heightClassName?: string }) => (
    <div data-testid="bracket">{heightClassName ?? "default"}</div>
  ),
}));

const { DivisionMatchingView, needsParticipants } = await import(
  "./DivisionMatchingView"
);

const participants = [
  { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
  { id: "p2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ", playerNumber: "2" },
];

const buildDivision = (
  overrides: Partial<DivisionDetail> = {},
): DivisionDetail => ({
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "ROUND_ROBIN",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: {
    version: 1,
    matches: [
      {
        id: "r1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        sequence: 0,
        matchNumber: "1",
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [{ matchId: "r1-0", winnerEntryId: "e2" }] },
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("DivisionMatchingView", () => {
  it("SINGLE_ELIMINATION はブラケットに高さを渡して描く", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({ format: "SINGLE_ELIMINATION" })}
        participants={participants}
        heightClassName="h-[20rem]"
      />,
    );

    expect(screen.getByTestId("bracket")).toHaveTextContent("h-[20rem]");
  });

  it("ROUND_ROBIN は結果表を描く", () => {
    render(
      <DivisionMatchingView
        division={buildDivision()}
        participants={participants}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "順位" }),
    ).toBeInTheDocument();
    // 鈴木が勝ったので 1 位の行に来る
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("鈴木 陽菜");
    expect(screen.getByLabelText("勝ち")).toBeInTheDocument();
    expect(screen.queryByTestId("bracket")).toBeNull();
  });

  it("ROUND_ROBIN で組み合わせが未作成なら案内する", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({
          matchingConfig: { version: 1, matches: [] },
        })}
        participants={participants}
      />,
    );

    expect(screen.getByText("組み合わせが未作成です")).toBeInTheDocument();
  });

  it("ROUND_ROBIN でトーナメントの木が残っていれば形が違うと案内する", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m2-0",
                bracket: "winners",
                round: 2,
                order: 0,
                sequence: 0,
                matchNumber: "1",
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "winnerOf", matchId: "m1-0" },
                ],
              },
            ],
          },
        })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText("この対戦表はリーグの形ではありません"),
    ).toBeInTheDocument();
  });

  // Json は DB の列で、アプリの外から壊れた値が入りうる。ページ全体を
  // 落とさず、この区画だけで受け止める。
  it("ROUND_ROBIN で Json が壊れていてもページを落とさない", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({ matchingConfig: { version: 2 } })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText("部門のデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });

  it("対応していない形式は形式名を添えて案内する", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({ format: "DOUBLE_ELIMINATION_GRAND_FINAL" })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText(
        "「ダブルエリミネーション（優勝決定戦あり）」のブラケット表示はまだ対応していません",
      ),
    ).toBeInTheDocument();
  });

  it("参加者一覧が要るのはブラケットと結果表を描く 2 形式", () => {
    expect(needsParticipants("SINGLE_ELIMINATION")).toBe(true);
    expect(needsParticipants("ROUND_ROBIN")).toBe(true);
    expect(needsParticipants("DOUBLE_ELIMINATION_GRAND_FINAL")).toBe(false);
    expect(needsParticipants("DOUBLE_ELIMINATION_THIRD_PLACE")).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `pnpm vitest run src/components/division/DivisionMatchingView.test.tsx`
Expected: FAIL — `./DivisionMatchingView` が見つからない

- [ ] **Step 3: 実装する**

`src/components/division/DivisionMatchingView.tsx`:

```tsx
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isRoundRobinShape } from "@/features/division/round-robin/build";
import { toLeagueTableView } from "@/features/division/round-robin/standings";
import type { DivisionFormat } from "@/generated/prisma/enums";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { DivisionBracket } from "./DivisionBracket";
import { LeagueResultTable } from "./LeagueResultTable";
import { Notice } from "./Notice";

/**
 * 形式ごとに参加者一覧を使うか。使わない形式で毎回クエリを投げないよう、
 * ページ側がこれを見て読み出しを省く。Record で持つのは、形式を増やした
 * ときに書き忘れがコンパイルエラーになるようにするため。
 */
const USES_PARTICIPANTS: Record<DivisionFormat, boolean> = {
  SINGLE_ELIMINATION: true,
  ROUND_ROBIN: true,
  DOUBLE_ELIMINATION_GRAND_FINAL: false,
  DOUBLE_ELIMINATION_THIRD_PLACE: false,
};

export const needsParticipants = (format: DivisionFormat): boolean =>
  USES_PARTICIPANTS[format];

/** リーグの結果表。Json のパースと形の検査をこの区画で受け止める。 */
const LeagueSection = ({
  division,
  participants,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
}) => {
  // Json は DB の列で、アプリの外から壊れた値が入りうる。パースの失敗は
  // ここで受け止め、ページ全体は落とさない。
  let parsed: {
    entries: ReturnType<typeof parseDivisionEntries>;
    matchingConfig: ReturnType<typeof parseMatchingConfig>;
    results: ReturnType<typeof parseDivisionResults>;
  };
  try {
    parsed = {
      entries: parseDivisionEntries(division.entries),
      matchingConfig: parseMatchingConfig(division.matchingConfig),
      results: parseDivisionResults(division.results),
    };
  } catch {
    return <Notice>部門のデータを読み込めませんでした</Notice>;
  }

  if (parsed.matchingConfig.matches.length === 0) {
    return <Notice>組み合わせが未作成です</Notice>;
  }

  // /edit は format を無条件に書き換えられるので、トーナメントの木を
  // 持ったままリーグになった部門が存在しうる。その木を結果表として
  // 描くと嘘になるため、案内だけ出す（編集画面の LeagueSetup と同じ扱い）。
  if (!isRoundRobinShape(parsed.matchingConfig)) {
    return <Notice>この対戦表はリーグの形ではありません</Notice>;
  }

  return (
    <LeagueResultTable
      table={toLeagueTableView(
        parsed.matchingConfig,
        parsed.entries,
        parsed.results,
        participants,
      )}
    />
  );
};

/**
 * 部門の組み合わせを形式に応じて描く入口。部門詳細ページと公開ページが
 * 同じ props で呼ぶ。heightClassName はブラケットだけが使う（結果表は
 * 内容の高さに従う）。
 */
export function DivisionMatchingView({
  division,
  participants,
  heightClassName,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  heightClassName?: string;
}) {
  switch (division.format) {
    case "SINGLE_ELIMINATION":
      return (
        <DivisionBracket
          division={division}
          participants={participants}
          heightClassName={heightClassName}
        />
      );
    case "ROUND_ROBIN":
      return <LeagueSection division={division} participants={participants} />;
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      return (
        <Notice>
          「{DIVISION_FORMAT_LABELS[division.format]}
          」のブラケット表示はまだ対応していません
        </Notice>
      );
  }
}
```

注意: `DivisionBracket` の `heightClassName` は既定値付きの引数なので、
`undefined` を渡すと既定の `h-[28rem]` が使われる。

- [ ] **Step 4: 通ることを確かめる**

Run: `pnpm vitest run src/components/division/DivisionMatchingView.test.tsx`
Expected: PASS（7 tests）

- [ ] **Step 5: 整形して typecheck**

Run: `pnpm biome check --write src/components/division/DivisionMatchingView.tsx src/components/division/DivisionMatchingView.test.tsx && pnpm typecheck`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/components/division/DivisionMatchingView.tsx src/components/division/DivisionMatchingView.test.tsx
git commit -m "feat(division): dispatch the matching view by format

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 部門詳細ページ（管理画面）を結果表対応にする

**Files:**
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx`
- Test: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx`

**Interfaces:**
- Consumes: `DivisionMatchingView`, `needsParticipants` from `@/components/division/DivisionMatchingView`（Task 3）

- [ ] **Step 1: テストを直す**

`page.test.tsx` にある `DivisionBracket` の `vi.mock` を、次に置き換える:

```tsx
// DivisionMatchingView は組み合わせの組み立てまで踏み込むため、ページのテストでは
// division / participants をそのまま受け取っているかだけを見たいのでダミーへ差し替える。
// needsParticipants は本物を使う（参加者を引く条件がページの責務だから）。
vi.mock("@/components/division/DivisionMatchingView", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/division/DivisionMatchingView")
    >();
  return {
    needsParticipants: actual.needsParticipants,
    DivisionMatchingView: () => <div>matching</div>,
  };
});
```

既存のテスト「SINGLE_ELIMINATION 以外の部門では参加者一覧を取得しない」を
次の 2 つに置き換える:

```tsx
  it("ROUND_ROBIN の部門でも参加者一覧を取得する（結果表に名前が要る）", async () => {
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "ROUND_ROBIN",
    });

    await DivisionPage(pageProps("tennis", "t1", "d1"));

    expect(listParticipantsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("描画に参加者を使わない形式では参加者一覧を取得しない", async () => {
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
    });

    await DivisionPage(pageProps("tennis", "t1", "d1"));

    expect(listParticipantsInTournament).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `pnpm vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx"`
Expected: FAIL — ROUND_ROBIN のテストで `listParticipantsInTournament` が呼ばれない

- [ ] **Step 3: ページを直す**

`page.tsx` の import 群を次にする（`DivisionBracket` の import は削除）:

```tsx
import { notFound } from "next/navigation";
import { TrackCreated } from "@/components/analytics/TrackCreated";
import { DivisionDetailView } from "@/components/division/DivisionDetail";
import {
  DivisionMatchingView,
  needsParticipants,
} from "@/components/division/DivisionMatchingView";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  findDivisionInTournament,
  listParticipantsInTournament,
} from "@/features/division/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";
```

参加者を引く箇所を次にする:

```tsx
  // 描画に参加者名を使わない形式では、詳細ページ表示のたびに参加者一覧を
  // 引く必要はない。使う形式のときだけクエリを投げる。
  const participants = needsParticipants(division.format)
    ? await listParticipantsInTournament(organization.id, tournamentId)
    : [];
```

描画箇所を次にする:

```tsx
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-700">組み合わせ</h2>
          <DivisionMatchingView
            division={division}
            participants={participants}
          />
        </div>
```

- [ ] **Step 4: 通ることを確かめる**

Run: `pnpm vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: 整形して typecheck**

Run: `pnpm biome check --write "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx" && pnpm typecheck`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx"
git commit -m "feat(division): show the league result table on the division page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 公開ページを結果表対応にする

**Files:**
- Modify: `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`
- Test: `src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`

**Interfaces:**
- Consumes: `DivisionMatchingView`, `needsParticipants` from `@/components/division/DivisionMatchingView`（Task 3）

- [ ] **Step 1: テストを直す**

公開ページのテストは `DivisionBracket` をモックせず `TournamentFlow` だけ差し替えている。
この方針は変えず、既存の「SINGLE_ELIMINATION 以外では参加者を引かない」を次の 2 つに置き換える:

```tsx
  it("ROUND_ROBIN の部門では参加者一覧を引いて結果表を描く", async () => {
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
            sequence: 0,
            matchNumber: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: {
        version: 1,
        matches: [{ matchId: "r1-0", winnerEntryId: "e1" }],
      },
    });

    render(await Page(pageProps("t1", "d1")));

    expect(listParticipantsInTournament).toHaveBeenCalledWith("o1", "t1");
    expect(
      screen.getByRole("columnheader", { name: "順位" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("勝ち")).toBeInTheDocument();
    expect(screen.queryByTestId("flow")).toBeNull();
  });

  it("描画に参加者を使わない形式では参加者を引かない", async () => {
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "DOUBLE_ELIMINATION_GRAND_FINAL" as const,
    });

    await Page(pageProps("t1", "d1"));

    expect(listParticipantsInTournament).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `pnpm vitest run "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"`
Expected: FAIL — ROUND_ROBIN のテストで参加者が引かれず、結果表も出ない

- [ ] **Step 3: ページを直す**

`page.tsx` の `DivisionBracket` の import を次に差し替える:

```tsx
import {
  DivisionMatchingView,
  needsParticipants,
} from "@/components/division/DivisionMatchingView";
```

参加者を引く箇所を次にする:

```tsx
  // 描画に参加者名を使わない形式では参加者一覧を引かない。
  // 管理画面の部門詳細と同じ条件を needsParticipants で共有する。
  const participants = needsParticipants(division.format)
    ? await listParticipantsInTournament(
        tournament.organizationId,
        tournament.id,
      )
    : [];
```

描画箇所を次にする:

```tsx
        {/*
          ブラケットのときは枠に画面の大半を使う。dvh にするのは
          モバイルブラウザのアドレスバーの出入りで vh がずれるため。
          任意値クラスは Tailwind が走査できるよう文字列リテラルで渡す。
          リーグの結果表は内容の高さに従い、この値を使わない。
        */}
        <DivisionMatchingView
          division={division}
          participants={participants}
          heightClassName="h-[calc(100dvh-11rem)]"
        />
```

- [ ] **Step 4: 通ることを確かめる**

Run: `pnpm vitest run "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: 整形して typecheck**

Run: `pnpm biome check --write "src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx" "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx" && pnpm typecheck`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add "src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx" "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"
git commit -m "feat(public): show the league result table on the public division page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 全体検証と設計メモ

**Files:**
- Modify: `docs/code-design/architecture.md`（`round-robin/` の説明がある箇所に `standings.ts` を 1 行足す）

- [ ] **Step 1: 全テストと typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: すべて PASS、型エラーなし

- [ ] **Step 2: lint**

Run: `pnpm lint`
Expected: 自分が触ったファイルに CRLF 以外のエラーが無いこと（リポジトリ全体の CRLF エラーは既知）

- [ ] **Step 3: architecture.md に追記する**

`docs/code-design/architecture.md` の「features/division の共有ドメイン」節にある、
「誰が休みかは `round-robin/view.ts` が節ごとの差分から算出する。」で終わる段落の直後に、
次の段落を足す:

```
リーグの勝敗込み星取表と順位表は `round-robin/standings.ts` が組み立てる。
勝点は勝 3・分 1・負 0 で、勝点 → 勝ち数 → 同点者どうしの直接対決 → 同順位の順に
決める。閲覧ページ（管理画面の部門詳細と公開の部門ページ）は形式で描画を振り分ける
`components/division/DivisionMatchingView.tsx` を通してこれを使う。編集画面の
`LeagueCrossTable` は試合番号だけを出す別物で、閲覧用と役割を分けている。
```

- [ ] **Step 4: 手で確かめる（推奨）**

`.env` に `BYPASS_AUTH=1` がある状態で `pnpm dev` を起動し（ログに出た実ポートを使う。3000 は別の worktree が使っていることがある）、
Cookie に `USER_ID=1` を設定して、ROUND_ROBIN の部門の詳細ページと `/t/{tournamentId}/divisions/{divisionId}` を開く。
結果入力画面（`/orgs/{slug}/tournaments/{tournamentId}/results`）で勝敗を入れると表の ○● と順位が変わることを見る。

- [ ] **Step 5: Commit**

```bash
git add docs/code-design/architecture.md
git commit -m "docs(architecture): note the league standings module

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
