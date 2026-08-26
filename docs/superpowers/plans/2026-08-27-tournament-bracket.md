# シングルエリミネーション・トーナメント表 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mock データからシングルエリミネーションのトーナメント表を React Flow で描画する（表示専用）。

**Architecture:** 参加者 / ブラケット構造 / 勝敗の 3 つを独立した Mock データとして持ち、React Flow に依存しない 3 つの純粋関数（`resolveBracket` → `layoutBracket` → `toFlowElements`）で描画データへ畳み込む。合成は Server Component（`page.tsx`）で行い、Client Component（`TournamentFlow`）は受け取った nodes / edges を描画するだけにする。

**Tech Stack:** Next.js 16.3.3（App Router）/ React 19.2.8 / TypeScript（strict）/ @xyflow/react 12 / Tailwind CSS v4 / vitest 4 + @testing-library/react / Biome 2.4.2 / pnpm

**Spec:** `docs/superpowers/specs/2026-08-27-tournament-bracket-design.md`

## Global Constraints

- パッケージマネージャは **pnpm** のみ（`packageManager: pnpm@8.15.4`）。npm / yarn は使わない
- TypeScript は `strict: true`。`any` および `@ts-ignore` は使用禁止。型を絞り込む必要がある箇所は type predicate を使う
- import エイリアスは `@/*` → `./src/*`
- Lint / format は Biome。**コミット前に必ず `pnpm lint:fix` を実行**する
- Biome の React ドメインルールが有効。配列 index を JSX の `key` に使わない（`noArrayIndexKey`）
- テストは vitest。`pnpm test` が全テストを実行する。テストファイルは実装と同じディレクトリに `*.test.ts(x)` として置く
- UI に表示する文字列は日本語
- Next.js 固有のコードを書く前に `node_modules/next/dist/docs/` の該当ガイドを読むこと（`AGENTS.md` の指示）。このプロジェクトの Next.js は訓練データと挙動が異なる可能性がある
- 各タスクの最後にコミットする。コミットメッセージ末尾に空行を挟んで次の 1 行を付ける:

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

- シェルの heredoc でファイルを作らないこと。コマンド長の上限を超えて失敗する。ファイル作成は必ずエディタのファイル書き込み機能を使う

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `src/features/tournament/types.ts` | 全型定義。他ファイルはここからのみ型を import する |
| `src/features/tournament/mock/participants.ts` | 参加者 12 名のマスタ |
| `src/features/tournament/mock/bracket.ts` | 16 枠 4 ラウンドのブラケット構造 |
| `src/features/tournament/mock/results.ts` | 勝敗データ |
| `src/features/tournament/mock/mock.test.ts` | Mock 3 ファイルの整合性検証 |
| `src/features/tournament/lib/resolve-bracket.ts` | 3 データを突き合わせ、勝者を伝播（純粋関数） |
| `src/features/tournament/lib/layout-bracket.ts` | 各試合の座標算出とレイアウト定数（純粋関数） |
| `src/features/tournament/lib/to-flow-elements.ts` | React Flow の nodes / edges へ変換（純粋関数） |
| `src/features/tournament/components/MatchCard.tsx` | 試合 1 件の見た目。React Flow 非依存 |
| `src/features/tournament/components/MatchNode.tsx` | `MatchCard` + React Flow の Handle |
| `src/features/tournament/components/TournamentFlow.tsx` | `"use client"`。ReactFlow のセットアップ |
| `src/app/page.tsx` | Server Component。合成して `TournamentFlow` に渡す |

---

## Task 1: 型定義と Mock データ

**Files:**
- Modify: `package.json`（依存追加）
- Create: `src/features/tournament/types.ts`
- Create: `src/features/tournament/mock/participants.ts`
- Create: `src/features/tournament/mock/bracket.ts`
- Create: `src/features/tournament/mock/results.ts`
- Test: `src/features/tournament/mock/mock.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - 型 `Participant`, `SlotSource`, `Match`, `Bracket`, `MatchResult`, `SlotState`, `ResolvedSlot`, `MatchStatus`, `ResolvedMatch`（すべて `src/features/tournament/types.ts` から export）
  - 値 `mockParticipants: Participant[]`, `mockBracket: Bracket`, `mockResults: MatchResult[]`

- [ ] **Step 1: React Flow を追加する**

React Flow のパッケージ名は `reactflow` ではなく **`@xyflow/react`**（v12 系）。旧 `reactflow` パッケージを入れないこと。

```bash
pnpm add @xyflow/react
```

- [ ] **Step 2: 追加されたことを確認する**

Run: `pnpm list @xyflow/react`
Expected: `@xyflow/react 12.x.x` が表示される（12.11.5 以降）

- [ ] **Step 3: 型定義を書く**

Create `src/features/tournament/types.ts`:

```ts
/** 参加者マスタ。「誰が出るか」だけを持ち、勝敗は一切持たない。 */
export type Participant = {
  id: string;
  name: string;
  seed: number;
  team?: string;
};

/** 試合スロットが何によって埋まるか。 */
export type SlotSource =
  | { kind: "participant"; participantId: string }
  | { kind: "winnerOf"; matchId: string }
  | { kind: "bye" };

/** ブラケット構造上の 1 試合。「誰と誰がいつ当たるか」。 */
export type Match = {
  id: string;
  /** 1 = 1 回戦 */
  round: number;
  /** ラウンド内の上からの位置。0 始まり */
  order: number;
  slots: [SlotSource, SlotSource];
};

export type Bracket = {
  id: string;
  name: string;
  matches: Match[];
};

/** 勝敗データ。Participant / Bracket から完全に独立している。 */
export type MatchResult = {
  matchId: string;
  winnerId: string;
  /** "3-1" などの表示用文字列 */
  score?: string;
};

export type SlotState = "confirmed" | "pending" | "bye";

export type ResolvedSlot = {
  /** pending / bye のときは null */
  participant: Participant | null;
  state: SlotState;
  isWinner: boolean;
};

export type MatchStatus = "done" | "ready" | "waiting" | "bye";

/** 3 つのデータを突き合わせた、描画用の 1 試合。 */
export type ResolvedMatch = {
  id: string;
  round: number;
  order: number;
  slots: [ResolvedSlot, ResolvedSlot];
  winnerId: string | null;
  score: string | null;
  status: MatchStatus;
  /** 各スロットの供給元試合 id。エッジ生成とレイアウトに使う */
  sourceMatchIds: [string | null, string | null];
};
```

- [ ] **Step 4: 失敗するテストを書く**

Create `src/features/tournament/mock/mock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockBracket } from "./bracket";
import { mockParticipants } from "./participants";
import { mockResults } from "./results";

describe("mock data", () => {
  it("参加者 id が一意である", () => {
    const ids = mockParticipants.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("試合 id が一意である", () => {
    const ids = mockBracket.matches.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("participant スロットが実在する参加者を指している", () => {
    const participantIds = new Set(mockParticipants.map((p) => p.id));
    for (const match of mockBracket.matches) {
      for (const slot of match.slots) {
        if (slot.kind === "participant") {
          expect(participantIds).toContain(slot.participantId);
        }
      }
    }
  });

  it("winnerOf スロットが自分より前のラウンドの実在する試合を指している", () => {
    const matchById = new Map(mockBracket.matches.map((m) => [m.id, m]));
    for (const match of mockBracket.matches) {
      for (const slot of match.slots) {
        if (slot.kind === "winnerOf") {
          const source = matchById.get(slot.matchId);
          expect(source).toBeDefined();
          expect(source?.round).toBeLessThan(match.round);
        }
      }
    }
  });

  it("全参加者がちょうど 1 回だけ登場する", () => {
    const appearances = mockBracket.matches
      .flatMap((m) => m.slots)
      .flatMap((s) => (s.kind === "participant" ? [s.participantId] : []));
    expect(appearances).toHaveLength(mockParticipants.length);
    expect(new Set(appearances).size).toBe(mockParticipants.length);
  });

  it("勝敗データが実在する試合と参加者を指している", () => {
    const matchIds = new Set(mockBracket.matches.map((m) => m.id));
    const participantIds = new Set(mockParticipants.map((p) => p.id));
    for (const result of mockResults) {
      expect(matchIds).toContain(result.matchId);
      expect(participantIds).toContain(result.winnerId);
    }
  });

  it("勝敗データの試合 id が重複していない", () => {
    const ids = mockResults.map((r) => r.matchId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("決勝（最終ラウンド）の結果はまだ入っていない", () => {
    const lastRound = Math.max(...mockBracket.matches.map((m) => m.round));
    const finals = mockBracket.matches.filter((m) => m.round === lastRound);
    const resultMatchIds = new Set(mockResults.map((r) => r.matchId));
    for (const final of finals) {
      expect(resultMatchIds).not.toContain(final.id);
    }
  });
});
```

- [ ] **Step 5: テストが失敗することを確認する**

Run: `pnpm test src/features/tournament/mock/mock.test.ts`
Expected: FAIL。`Failed to resolve import "./bracket"` のようなモジュール解決エラーになる

- [ ] **Step 6: 参加者データを書く**

Create `src/features/tournament/mock/participants.ts`:

```ts
import type { Participant } from "../types";

/** シード順に並べた 12 名。id の数字はシード番号と一致させている。 */
export const mockParticipants: Participant[] = [
  { id: "p1", name: "佐藤 蓮", seed: 1, team: "青葉クラブ" },
  { id: "p2", name: "鈴木 陽菜", seed: 2, team: "朱雀ジム" },
  { id: "p3", name: "高橋 大和", seed: 3, team: "白鷺クラブ" },
  { id: "p4", name: "田中 結衣", seed: 4, team: "黒潮スポーツ" },
  { id: "p5", name: "伊藤 湊", seed: 5, team: "青葉クラブ" },
  { id: "p6", name: "渡辺 咲良", seed: 6, team: "朱雀ジム" },
  { id: "p7", name: "山本 陽翔", seed: 7, team: "白鷺クラブ" },
  { id: "p8", name: "中村 芽依", seed: 8, team: "黒潮スポーツ" },
  { id: "p9", name: "小林 悠真", seed: 9, team: "青葉クラブ" },
  { id: "p10", name: "加藤 凛", seed: 10, team: "朱雀ジム" },
  { id: "p11", name: "吉田 颯太", seed: 11, team: "白鷺クラブ" },
  { id: "p12", name: "山田 杏", seed: 12, team: "黒潮スポーツ" },
];
```

- [ ] **Step 7: ブラケット構造を書く**

16 枠の標準シーディング（1-16 / 8-9 / 5-12 / 4-13 / 3-14 / 6-11 / 7-10 / 2-15）で組む。参加者は 12 名なのでシード 13〜16 の枠が空き、シード 1・4・3・2 が 1 回戦 BYE になる。

Create `src/features/tournament/mock/bracket.ts`:

```ts
import type { Bracket, SlotSource } from "../types";

const p = (participantId: string): SlotSource => ({
  kind: "participant",
  participantId,
});
const w = (matchId: string): SlotSource => ({ kind: "winnerOf", matchId });
const bye: SlotSource = { kind: "bye" };

export const mockBracket: Bracket = {
  id: "b2026-summer",
  name: "2026 サマーカップ",
  matches: [
    // 1 回戦: 標準シーディング。シード 13〜16 が不在のため 4 試合が BYE
    { id: "r1-m1", round: 1, order: 0, slots: [p("p1"), bye] },
    { id: "r1-m2", round: 1, order: 1, slots: [p("p8"), p("p9")] },
    { id: "r1-m3", round: 1, order: 2, slots: [p("p5"), p("p12")] },
    { id: "r1-m4", round: 1, order: 3, slots: [p("p4"), bye] },
    { id: "r1-m5", round: 1, order: 4, slots: [p("p3"), bye] },
    { id: "r1-m6", round: 1, order: 5, slots: [p("p6"), p("p11")] },
    { id: "r1-m7", round: 1, order: 6, slots: [p("p7"), p("p10")] },
    { id: "r1-m8", round: 1, order: 7, slots: [p("p2"), bye] },
    // 準々決勝
    { id: "r2-m1", round: 2, order: 0, slots: [w("r1-m1"), w("r1-m2")] },
    { id: "r2-m2", round: 2, order: 1, slots: [w("r1-m3"), w("r1-m4")] },
    { id: "r2-m3", round: 2, order: 2, slots: [w("r1-m5"), w("r1-m6")] },
    { id: "r2-m4", round: 2, order: 3, slots: [w("r1-m7"), w("r1-m8")] },
    // 準決勝
    { id: "r3-m1", round: 3, order: 0, slots: [w("r2-m1"), w("r2-m2")] },
    { id: "r3-m2", round: 3, order: 1, slots: [w("r2-m3"), w("r2-m4")] },
    // 決勝
    { id: "r4-m1", round: 4, order: 0, slots: [w("r3-m1"), w("r3-m2")] },
  ],
};
```

- [ ] **Step 8: 勝敗データを書く**

準々決勝まで全て決着済み。準決勝は `r3-m1` だけ決着させ、`r3-m2` は未決着にする。これにより決勝が「片側だけ確定」の `waiting` 状態になり、`confirmed` / `pending` / `bye` の 3 状態が一画面に揃う。BYE 試合（`r1-m1` / `r1-m4` / `r1-m5` / `r1-m8`）はここに書かない。結果なしで自動的に勝ち上がる。

Create `src/features/tournament/mock/results.ts`:

```ts
import type { MatchResult } from "../types";

export const mockResults: MatchResult[] = [
  // 1 回戦（BYE 以外の 4 試合）
  { matchId: "r1-m2", winnerId: "p8", score: "2-0" },
  { matchId: "r1-m3", winnerId: "p12", score: "2-1" },
  { matchId: "r1-m6", winnerId: "p6", score: "2-0" },
  { matchId: "r1-m7", winnerId: "p10", score: "2-1" },
  // 準々決勝
  { matchId: "r2-m1", winnerId: "p1", score: "3-1" },
  { matchId: "r2-m2", winnerId: "p4", score: "3-0" },
  { matchId: "r2-m3", winnerId: "p6", score: "3-2" },
  { matchId: "r2-m4", winnerId: "p2", score: "3-1" },
  // 準決勝（片方のみ決着）
  { matchId: "r3-m1", winnerId: "p1", score: "3-2" },
];
```

- [ ] **Step 9: テストが通ることを確認する**

Run: `pnpm test src/features/tournament/mock/mock.test.ts`
Expected: PASS（8 tests passed）

- [ ] **Step 10: 型チェックと lint を通す**

Run: `pnpm typecheck && pnpm lint:fix`
Expected: どちらもエラーなし

- [ ] **Step 11: コミット**

```bash
git add package.json pnpm-lock.yaml src/features/tournament
git commit -m "feat: add tournament types and mock data

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: resolveBracket（3 データの合成）

**Files:**
- Create: `src/features/tournament/lib/resolve-bracket.ts`
- Test: `src/features/tournament/lib/resolve-bracket.test.ts`

**Interfaces:**
- Consumes: `src/features/tournament/types.ts` の `Bracket`, `MatchResult`, `MatchStatus`, `Participant`, `ResolvedMatch`, `ResolvedSlot`, `SlotSource`
- Produces: `resolveBracket(participants: Participant[], bracket: Bracket, results: MatchResult[]): ResolvedMatch[]`

- [ ] **Step 1: 失敗するテストを書く**

テストは Mock データに依存させない。Mock を変えるたびにテストが壊れるのを避けるため、テスト内に最小のフィクスチャを組む。

Create `src/features/tournament/lib/resolve-bracket.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Bracket, MatchResult, Participant, ResolvedMatch } from "../types";
import { resolveBracket } from "./resolve-bracket";

const participants: Participant[] = [
  { id: "p1", name: "Alice", seed: 1 },
  { id: "p2", name: "Bob", seed: 2 },
  { id: "p3", name: "Carol", seed: 3 },
];

/** 3 名を 4 枠に入れた最小ブラケット。p1 が 1 回戦 BYE。 */
const bracket: Bracket = {
  id: "b1",
  name: "Test Cup",
  matches: [
    {
      id: "m1",
      round: 1,
      order: 0,
      slots: [{ kind: "participant", participantId: "p1" }, { kind: "bye" }],
    },
    {
      id: "m2",
      round: 1,
      order: 1,
      slots: [
        { kind: "participant", participantId: "p2" },
        { kind: "participant", participantId: "p3" },
      ],
    },
    {
      id: "m3",
      round: 2,
      order: 0,
      slots: [
        { kind: "winnerOf", matchId: "m1" },
        { kind: "winnerOf", matchId: "m2" },
      ],
    },
  ],
};

const byId = (matches: ResolvedMatch[], id: string): ResolvedMatch => {
  const match = matches.find((m) => m.id === id);
  if (!match) throw new Error(`no match ${id}`);
  return match;
};

describe("resolveBracket", () => {
  it("試合数が変わらない", () => {
    expect(resolveBracket(participants, bracket, [])).toHaveLength(3);
  });

  it("BYE の相手は結果がなくても勝ち上がる", () => {
    const m1 = byId(resolveBracket(participants, bracket, []), "m1");
    expect(m1.winnerId).toBe("p1");
    expect(m1.status).toBe("bye");
    expect(m1.slots[0].state).toBe("confirmed");
    expect(m1.slots[0].isWinner).toBe(true);
    expect(m1.slots[1].state).toBe("bye");
    expect(m1.slots[1].participant).toBeNull();
  });

  it("結果が空なら通常の 1 回戦は ready のまま", () => {
    const m2 = byId(resolveBracket(participants, bracket, []), "m2");
    expect(m2.status).toBe("ready");
    expect(m2.winnerId).toBeNull();
    expect(m2.slots.every((s) => s.state === "confirmed")).toBe(true);
    expect(m2.slots.every((s) => s.isWinner === false)).toBe(true);
  });

  it("供給元が未決着のスロットは pending、試合は waiting になる", () => {
    const m3 = byId(resolveBracket(participants, bracket, []), "m3");
    expect(m3.slots[0].state).toBe("confirmed");
    expect(m3.slots[0].participant?.id).toBe("p1");
    expect(m3.slots[1].state).toBe("pending");
    expect(m3.slots[1].participant).toBeNull();
    expect(m3.status).toBe("waiting");
  });

  it("結果を入れると勝者が次ラウンドへ伝播する", () => {
    const results: MatchResult[] = [
      { matchId: "m2", winnerId: "p3", score: "2-1" },
    ];
    const resolved = resolveBracket(participants, bracket, results);

    const m2 = byId(resolved, "m2");
    expect(m2.status).toBe("done");
    expect(m2.winnerId).toBe("p3");
    expect(m2.score).toBe("2-1");
    expect(m2.slots[0].isWinner).toBe(false);
    expect(m2.slots[1].isWinner).toBe(true);

    const m3 = byId(resolved, "m3");
    expect(m3.slots[1].participant?.id).toBe("p3");
    expect(m3.status).toBe("ready");
  });

  it("score が無い結果では score が null になる", () => {
    const resolved = resolveBracket(participants, bracket, [
      { matchId: "m2", winnerId: "p2" },
    ]);
    expect(byId(resolved, "m2").score).toBeNull();
  });

  it("sourceMatchIds に供給元試合 id が入る", () => {
    const resolved = resolveBracket(participants, bracket, []);
    expect(byId(resolved, "m1").sourceMatchIds).toEqual([null, null]);
    expect(byId(resolved, "m3").sourceMatchIds).toEqual(["m1", "m2"]);
  });

  it("存在しない参加者 id を参照したら例外を投げる", () => {
    const broken: Bracket = {
      ...bracket,
      matches: [
        {
          id: "x1",
          round: 1,
          order: 0,
          slots: [
            { kind: "participant", participantId: "ghost" },
            { kind: "bye" },
          ],
        },
      ],
    };
    expect(() => resolveBracket(participants, broken, [])).toThrow(/ghost/);
  });

  it("存在しない試合 id を参照したら例外を投げる", () => {
    const broken: Bracket = {
      ...bracket,
      matches: [
        {
          id: "x1",
          round: 2,
          order: 0,
          slots: [{ kind: "winnerOf", matchId: "ghost" }, { kind: "bye" }],
        },
      ],
    };
    expect(() => resolveBracket(participants, broken, [])).toThrow(/ghost/);
  });

  it("勝者がどちらのスロットにも居なければ例外を投げる", () => {
    const results: MatchResult[] = [{ matchId: "m2", winnerId: "p1" }];
    expect(() => resolveBracket(participants, bracket, results)).toThrow(/p1/);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test src/features/tournament/lib/resolve-bracket.test.ts`
Expected: FAIL。`Failed to resolve import "./resolve-bracket"`

- [ ] **Step 3: 実装を書く**

Create `src/features/tournament/lib/resolve-bracket.ts`:

```ts
import type {
  Bracket,
  MatchResult,
  MatchStatus,
  Participant,
  ResolvedMatch,
  ResolvedSlot,
  SlotSource,
} from "../types";

/**
 * 参加者・ブラケット構造・勝敗の 3 データを突き合わせ、描画可能な形へ畳み込む。
 * ラウンド昇順に走査することで、前ラウンドの勝者を 1 パスで次ラウンドへ伝播できる。
 */
export function resolveBracket(
  participants: Participant[],
  bracket: Bracket,
  results: MatchResult[],
): ResolvedMatch[] {
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const resultByMatchId = new Map(results.map((r) => [r.matchId, r]));
  const matchIds = new Set(bracket.matches.map((m) => m.id));
  const winnerByMatchId = new Map<string, string>();

  const ordered = [...bracket.matches].sort(
    (a, b) => a.round - b.round || a.order - b.order,
  );

  return ordered.map((match) => {
    const slots: [ResolvedSlot, ResolvedSlot] = [
      resolveSlot(match.slots[0], participantById, matchIds, winnerByMatchId),
      resolveSlot(match.slots[1], participantById, matchIds, winnerByMatchId),
    ];
    const sourceMatchIds: [string | null, string | null] = [
      sourceMatchId(match.slots[0]),
      sourceMatchId(match.slots[1]),
    ];

    const hasBye = match.slots.some((slot) => slot.kind === "bye");
    const result = resultByMatchId.get(match.id);

    let winnerId: string | null = null;
    let score: string | null = null;

    if (hasBye) {
      // BYE の相手は結果がなくても自動的に勝ち上がる
      winnerId =
        slots.find((slot) => slot.state === "confirmed")?.participant?.id ??
        null;
    } else if (result) {
      winnerId = result.winnerId;
      score = result.score ?? null;
    }

    if (winnerId !== null) {
      if (!slots.some((slot) => slot.participant?.id === winnerId)) {
        throw new Error(
          `Match "${match.id}" has winnerId "${winnerId}" that is in neither slot`,
        );
      }
      winnerByMatchId.set(match.id, winnerId);
      for (const slot of slots) {
        slot.isWinner = slot.participant?.id === winnerId;
      }
    }

    return {
      id: match.id,
      round: match.round,
      order: match.order,
      slots,
      winnerId,
      score,
      status: toStatus(hasBye, winnerId, slots),
      sourceMatchIds,
    };
  });
}

function resolveSlot(
  source: SlotSource,
  participantById: Map<string, Participant>,
  matchIds: Set<string>,
  winnerByMatchId: Map<string, string>,
): ResolvedSlot {
  if (source.kind === "bye") {
    return { participant: null, state: "bye", isWinner: false };
  }

  if (source.kind === "participant") {
    return {
      participant: lookupParticipant(participantById, source.participantId),
      state: "confirmed",
      isWinner: false,
    };
  }

  if (!matchIds.has(source.matchId)) {
    throw new Error(`Slot references unknown matchId "${source.matchId}"`);
  }
  const winnerId = winnerByMatchId.get(source.matchId);
  if (winnerId === undefined) {
    return { participant: null, state: "pending", isWinner: false };
  }
  return {
    participant: lookupParticipant(participantById, winnerId),
    state: "confirmed",
    isWinner: false,
  };
}

function lookupParticipant(
  participantById: Map<string, Participant>,
  participantId: string,
): Participant {
  const participant = participantById.get(participantId);
  if (!participant) {
    throw new Error(`Unknown participantId "${participantId}"`);
  }
  return participant;
}

function sourceMatchId(source: SlotSource): string | null {
  return source.kind === "winnerOf" ? source.matchId : null;
}

function toStatus(
  hasBye: boolean,
  winnerId: string | null,
  slots: [ResolvedSlot, ResolvedSlot],
): MatchStatus {
  if (hasBye) return "bye";
  if (winnerId !== null) return "done";
  if (slots.every((slot) => slot.state === "confirmed")) return "ready";
  return "waiting";
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/features/tournament/lib/resolve-bracket.test.ts`
Expected: PASS（10 tests passed）

- [ ] **Step 5: 型チェックと lint を通す**

Run: `pnpm typecheck && pnpm lint:fix`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/features/tournament/lib
git commit -m "feat: resolve participants, bracket and results into renderable matches

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: layoutBracket（座標計算）

**Files:**
- Create: `src/features/tournament/lib/layout-bracket.ts`
- Test: `src/features/tournament/lib/layout-bracket.test.ts`

**Interfaces:**
- Consumes: なし（`types.ts` にも依存しない。構造的な最小型だけを受け取る）
- Produces:
  - 定数 `NODE_WIDTH = 220`, `NODE_HEIGHT = 76`, `GAP_X = 80`, `GAP_Y = 24`
  - 型 `Position = { x: number; y: number }`
  - 型 `LayoutInput = { id: string; round: number; order: number; sourceMatchIds: [string | null, string | null] }`
  - `layoutBracket(matches: LayoutInput[]): Map<string, Position>`
  - `ResolvedMatch[]` は `LayoutInput[]` に構造的に代入可能なのでそのまま渡せる

- [ ] **Step 1: 失敗するテストを書く**

Create `src/features/tournament/lib/layout-bracket.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  GAP_X,
  GAP_Y,
  type LayoutInput,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position,
  layoutBracket,
} from "./layout-bracket";

const round1 = (id: string, order: number): LayoutInput => ({
  id,
  round: 1,
  order,
  sourceMatchIds: [null, null],
});

const feeder = (
  id: string,
  round: number,
  order: number,
  sources: [string, string],
): LayoutInput => ({ id, round, order, sourceMatchIds: sources });

/** 4 試合 → 2 試合 → 1 試合の 3 ラウンド構成 */
const matches: LayoutInput[] = [
  round1("m1", 0),
  round1("m2", 1),
  round1("m3", 2),
  round1("m4", 3),
  feeder("m5", 2, 0, ["m1", "m2"]),
  feeder("m6", 2, 1, ["m3", "m4"]),
  feeder("m7", 3, 0, ["m5", "m6"]),
];

const at = (positions: Map<string, Position>, id: string): Position => {
  const position = positions.get(id);
  if (!position) throw new Error(`no position for ${id}`);
  return position;
};

describe("layoutBracket", () => {
  it("全試合の座標を返す", () => {
    expect(layoutBracket(matches).size).toBe(7);
  });

  it("1 回戦の y が order の等間隔になる", () => {
    const positions = layoutBracket(matches);
    const step = NODE_HEIGHT + GAP_Y;
    expect(at(positions, "m1").y).toBe(0);
    expect(at(positions, "m2").y).toBe(step);
    expect(at(positions, "m3").y).toBe(step * 2);
    expect(at(positions, "m4").y).toBe(step * 3);
  });

  it("x がラウンドごとに等間隔になる", () => {
    const positions = layoutBracket(matches);
    const step = NODE_WIDTH + GAP_X;
    expect(at(positions, "m1").x).toBe(0);
    expect(at(positions, "m5").x).toBe(step);
    expect(at(positions, "m7").x).toBe(step * 2);
  });

  it("2 回戦以降の y が供給元 2 試合の中点になる", () => {
    const positions = layoutBracket(matches);
    const step = NODE_HEIGHT + GAP_Y;
    expect(at(positions, "m5").y).toBe(step * 0.5);
    expect(at(positions, "m6").y).toBe(step * 2.5);
    expect(at(positions, "m7").y).toBe(step * 1.5);
  });

  it("供給元が 1 つだけならその y をそのまま使う", () => {
    const positions = layoutBracket([
      round1("a", 0),
      round1("b", 1),
      { id: "c", round: 2, order: 0, sourceMatchIds: ["b", null] },
    ]);
    expect(at(positions, "c").y).toBe(at(positions, "b").y);
  });

  it("入力の順序が崩れていてもラウンド順に解決できる", () => {
    // m5（2 回戦）を、供給元の m1 / m2 より前に置いた並び
    const shuffled = [matches[4], matches[1], matches[0]];
    const positions = layoutBracket(shuffled);
    expect(at(positions, "m5").y).toBe((NODE_HEIGHT + GAP_Y) * 0.5);
  });

  it("供給元の座標が決まらない参照があれば例外を投げる", () => {
    expect(() =>
      layoutBracket([
        { id: "z", round: 2, order: 0, sourceMatchIds: ["ghost", null] },
      ]),
    ).toThrow(/ghost/);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test src/features/tournament/lib/layout-bracket.test.ts`
Expected: FAIL。`Failed to resolve import "./layout-bracket"`

- [ ] **Step 3: 実装を書く**

Create `src/features/tournament/lib/layout-bracket.ts`:

```ts
/** ノードの実寸。MatchCard の style にも同じ値を使い、計算と描画をずらさない。 */
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 76;
export const GAP_X = 80;
export const GAP_Y = 24;

export type Position = { x: number; y: number };

/** layoutBracket が必要とする最小限の形。ResolvedMatch はこれに代入可能。 */
export type LayoutInput = {
  id: string;
  round: number;
  order: number;
  sourceMatchIds: [string | null, string | null];
};

/**
 * x はラウンド番号、y は供給元試合の中点で決める。
 * ラウンド昇順に走査するので、供給元の座標は必ず先に確定している。
 */
export function layoutBracket(matches: LayoutInput[]): Map<string, Position> {
  const ordered = [...matches].sort(
    (a, b) => a.round - b.round || a.order - b.order,
  );
  const positions = new Map<string, Position>();

  for (const match of ordered) {
    const sourceYs = match.sourceMatchIds
      .filter((id): id is string => id !== null)
      .map((id) => {
        const source = positions.get(id);
        if (!source) {
          throw new Error(
            `Match "${match.id}" references "${id}", which has no position yet`,
          );
        }
        return source.y;
      });

    const y =
      sourceYs.length > 0
        ? sourceYs.reduce((sum, value) => sum + value, 0) / sourceYs.length
        : match.order * (NODE_HEIGHT + GAP_Y);

    positions.set(match.id, { x: (match.round - 1) * (NODE_WIDTH + GAP_X), y });
  }

  return positions;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/features/tournament/lib/layout-bracket.test.ts`
Expected: PASS（7 tests passed）

- [ ] **Step 5: 型チェックと lint を通す**

Run: `pnpm typecheck && pnpm lint:fix`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/features/tournament/lib
git commit -m "feat: compute bracket node positions

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: toFlowElements（React Flow 形式への変換）

**Files:**
- Create: `src/features/tournament/lib/to-flow-elements.ts`
- Test: `src/features/tournament/lib/to-flow-elements.test.ts`

**Interfaces:**
- Consumes:
  - `../types` の `ResolvedMatch`
  - `./layout-bracket` の `Position`
  - `@xyflow/react` の `Edge`, `Node`
- Produces:
  - 型 `MatchNodeData = { match: ResolvedMatch }`
  - 型 `MatchFlowNode = Node<MatchNodeData, "match">`
  - `toFlowElements(matches: ResolvedMatch[], positions: Map<string, Position>): { nodes: MatchFlowNode[]; edges: Edge[] }`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/features/tournament/lib/to-flow-elements.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MatchStatus, ResolvedMatch, ResolvedSlot } from "../types";
import type { Position } from "./layout-bracket";
import { toFlowElements } from "./to-flow-elements";

const emptySlot: ResolvedSlot = {
  participant: null,
  state: "pending",
  isWinner: false,
};

const match = (
  id: string,
  round: number,
  order: number,
  sourceMatchIds: [string | null, string | null],
  status: MatchStatus,
  winnerId: string | null,
): ResolvedMatch => ({
  id,
  round,
  order,
  slots: [emptySlot, emptySlot],
  winnerId,
  score: null,
  status,
  sourceMatchIds,
});

const matches: ResolvedMatch[] = [
  match("m1", 1, 0, [null, null], "done", "p1"),
  match("m2", 1, 1, [null, null], "ready", null),
  match("m3", 2, 0, ["m1", "m2"], "waiting", null),
];

const positions = new Map<string, Position>([
  ["m1", { x: 0, y: 0 }],
  ["m2", { x: 0, y: 100 }],
  ["m3", { x: 300, y: 50 }],
]);

describe("toFlowElements", () => {
  it("試合数と同じ数のノードを作る", () => {
    expect(toFlowElements(matches, positions).nodes).toHaveLength(3);
  });

  it("ノードに type と座標と ResolvedMatch を載せる", () => {
    const node = toFlowElements(matches, positions).nodes[2];
    expect(node.id).toBe("m3");
    expect(node.type).toBe("match");
    expect(node.position).toEqual({ x: 300, y: 50 });
    expect(node.data.match.id).toBe("m3");
  });

  it("ノードはドラッグ不可にする", () => {
    const { nodes } = toFlowElements(matches, positions);
    expect(nodes.every((node) => node.draggable === false)).toBe(true);
  });

  it("winnerOf 参照 1 件につきエッジを 1 本作る", () => {
    const { edges } = toFlowElements(matches, positions);
    expect(edges).toHaveLength(2);
    expect(edges.map((edge) => edge.id)).toEqual(["m1->m3", "m2->m3"]);
    expect(edges[0].source).toBe("m1");
    expect(edges[0].target).toBe("m3");
  });

  it("決着済みの供給元から伸びるエッジを濃く、未決着を淡くする", () => {
    const { edges } = toFlowElements(matches, positions);
    const fromDecided = edges.find((edge) => edge.source === "m1");
    const fromUndecided = edges.find((edge) => edge.source === "m2");
    expect(fromDecided?.style?.stroke).toBeDefined();
    expect(fromDecided?.style?.stroke).not.toBe(fromUndecided?.style?.stroke);
  });

  it("座標が無い試合があれば例外を投げる", () => {
    expect(() => toFlowElements(matches, new Map())).toThrow(/m1/);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test src/features/tournament/lib/to-flow-elements.test.ts`
Expected: FAIL。`Failed to resolve import "./to-flow-elements"`

- [ ] **Step 3: 実装を書く**

Create `src/features/tournament/lib/to-flow-elements.ts`:

```ts
import type { Edge, Node } from "@xyflow/react";
import type { ResolvedMatch } from "../types";
import type { Position } from "./layout-bracket";

export type MatchNodeData = { match: ResolvedMatch };
export type MatchFlowNode = Node<MatchNodeData, "match">;

const DECIDED_STROKE = "#475569";
const UNDECIDED_STROKE = "#cbd5e1";

/** ResolvedMatch[] と座標表を React Flow の nodes / edges へ変換する。 */
export function toFlowElements(
  matches: ResolvedMatch[],
  positions: Map<string, Position>,
): { nodes: MatchFlowNode[]; edges: Edge[] } {
  const decidedMatchIds = new Set(
    matches.filter((match) => match.winnerId !== null).map((match) => match.id),
  );

  const nodes: MatchFlowNode[] = matches.map((match) => {
    const position = positions.get(match.id);
    if (!position) {
      throw new Error(`No position for match "${match.id}"`);
    }
    return {
      id: match.id,
      type: "match",
      position,
      data: { match },
      draggable: false,
    };
  });

  const edges: Edge[] = matches.flatMap((match) =>
    match.sourceMatchIds
      .filter((id): id is string => id !== null)
      .map((sourceId) => ({
        id: `${sourceId}->${match.id}`,
        source: sourceId,
        target: match.id,
        style: {
          strokeWidth: 2,
          stroke: decidedMatchIds.has(sourceId)
            ? DECIDED_STROKE
            : UNDECIDED_STROKE,
        },
      })),
  );

  return { nodes, edges };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/features/tournament/lib/to-flow-elements.test.ts`
Expected: PASS（6 tests passed）

- [ ] **Step 5: 全テスト・型チェック・lint を通す**

Run: `pnpm test && pnpm typecheck && pnpm lint:fix`
Expected: すべてエラーなし（既存の `src/app/page.test.tsx` も含めて PASS）

- [ ] **Step 6: コミット**

```bash
git add src/features/tournament/lib
git commit -m "feat: convert resolved matches into React Flow nodes and edges

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: MatchCard（試合カードの見た目）

React Flow の `Handle` はストアコンテキストを必要とし jsdom で単体レンダリングできない。そこで見た目だけを持つ `MatchCard` を分離し、こちらをテスト対象にする。

**Files:**
- Create: `src/features/tournament/components/MatchCard.tsx`
- Test: `src/features/tournament/components/MatchCard.test.tsx`

**Interfaces:**
- Consumes:
  - `../types` の `ResolvedMatch`, `ResolvedSlot`
  - `../lib/layout-bracket` の `NODE_HEIGHT`, `NODE_WIDTH`
- Produces: `MatchCard(props: { match: ResolvedMatch })`
  - ルート要素に `data-testid="match-<id>"` と `data-status="<status>"`
  - 各スロット行に `data-testid="slot-<id>-<0|1>"`、`data-slot-state`、`data-winner`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/features/tournament/components/MatchCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResolvedMatch, ResolvedSlot } from "../types";
import { MatchCard } from "./MatchCard";

const confirmed = (
  id: string,
  name: string,
  seed: number,
  isWinner: boolean,
): ResolvedSlot => ({
  participant: { id, name, seed },
  state: "confirmed",
  isWinner,
});

const pending: ResolvedSlot = {
  participant: null,
  state: "pending",
  isWinner: false,
};

const bye: ResolvedSlot = {
  participant: null,
  state: "bye",
  isWinner: false,
};

const doneMatch: ResolvedMatch = {
  id: "r2-m1",
  round: 2,
  order: 0,
  slots: [
    confirmed("p1", "佐藤 蓮", 1, true),
    confirmed("p8", "中村 芽依", 8, false),
  ],
  winnerId: "p1",
  score: "3-1",
  status: "done",
  sourceMatchIds: ["r1-m1", "r1-m2"],
};

describe("MatchCard", () => {
  it("両者の名前とシード番号を表示する", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByText("佐藤 蓮")).toBeInTheDocument();
    expect(screen.getByText("中村 芽依")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("スコアを表示する", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByText("3-1")).toBeInTheDocument();
  });

  it("勝者の行だけ data-winner が true になる", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByTestId("slot-r2-m1-0")).toHaveAttribute(
      "data-winner",
      "true",
    );
    expect(screen.getByTestId("slot-r2-m1-1")).toHaveAttribute(
      "data-winner",
      "false",
    );
  });

  it("ルート要素に status を出す", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByTestId("match-r2-m1")).toHaveAttribute(
      "data-status",
      "done",
    );
  });

  it("未確定スロットは「未定」と表示する", () => {
    render(
      <MatchCard
        match={{
          ...doneMatch,
          id: "r4-m1",
          slots: [confirmed("p1", "佐藤 蓮", 1, false), pending],
          winnerId: null,
          score: null,
          status: "waiting",
        }}
      />,
    );
    expect(screen.getByText("未定")).toBeInTheDocument();
    expect(screen.getByTestId("slot-r4-m1-1")).toHaveAttribute(
      "data-slot-state",
      "pending",
    );
  });

  it("BYE スロットは「BYE」と表示する", () => {
    render(
      <MatchCard
        match={{
          ...doneMatch,
          id: "r1-m1",
          slots: [confirmed("p1", "佐藤 蓮", 1, true), bye],
          score: null,
          status: "bye",
        }}
      />,
    );
    expect(screen.getByText("BYE")).toBeInTheDocument();
    expect(screen.getByTestId("slot-r1-m1-1")).toHaveAttribute(
      "data-slot-state",
      "bye",
    );
  });

  it("スコアが無ければ何も表示しない", () => {
    render(<MatchCard match={{ ...doneMatch, id: "r3-m1", score: null }} />);
    expect(screen.queryByText("3-1")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test src/features/tournament/components/MatchCard.test.tsx`
Expected: FAIL。`Failed to resolve import "./MatchCard"`

- [ ] **Step 3: 実装を書く**

スロットは配列の `.map()` ではなく 2 行を明示的に書く。Biome の `noArrayIndexKey` を避けるためと、スロットが必ず 2 つであることが型で決まっているため。

Create `src/features/tournament/components/MatchCard.tsx`:

```tsx
import { NODE_HEIGHT, NODE_WIDTH } from "../lib/layout-bracket";
import type { ResolvedMatch, ResolvedSlot } from "../types";

function slotLabel(slot: ResolvedSlot): string {
  if (slot.state === "bye") return "BYE";
  return slot.participant?.name ?? "未定";
}

function slotTone(slot: ResolvedSlot): string {
  if (slot.isWinner) return "bg-amber-50 font-bold text-slate-900";
  if (slot.state === "confirmed") return "text-slate-700";
  return "text-slate-400";
}

function SlotRow({
  matchId,
  slot,
  index,
}: {
  matchId: string;
  slot: ResolvedSlot;
  index: 0 | 1;
}) {
  return (
    <div
      data-testid={`slot-${matchId}-${index}`}
      data-slot-state={slot.state}
      data-winner={slot.isWinner ? "true" : "false"}
      className={`flex h-1/2 items-center gap-2 px-2 text-sm ${
        index === 0 ? "border-b border-slate-200" : ""
      } ${slotTone(slot)}`}
    >
      <span className="w-5 shrink-0 text-right text-xs text-slate-400">
        {slot.participant ? slot.participant.seed : ""}
      </span>
      <span className="flex-1 truncate">{slotLabel(slot)}</span>
    </div>
  );
}

export function MatchCard({ match }: { match: ResolvedMatch }) {
  return (
    <div
      data-testid={`match-${match.id}`}
      data-status={match.status}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className="relative overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm"
    >
      <SlotRow matchId={match.id} slot={match.slots[0]} index={0} />
      <SlotRow matchId={match.id} slot={match.slots[1]} index={1} />
      {match.score ? (
        <span className="absolute right-1 top-1 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-500">
          {match.score}
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/features/tournament/components/MatchCard.test.tsx`
Expected: PASS（7 tests passed）

- [ ] **Step 5: 型チェックと lint を通す**

Run: `pnpm typecheck && pnpm lint:fix`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/features/tournament/components
git commit -m "feat: add match card presentation component

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: React Flow への接続とページ配線

このタスクだけは単体テストを持たない。React Flow は jsdom 上でノードサイズを計測できず、レンダリングテストが意味を成さないため。検証は `pnpm test`（既存テストの回帰確認）、`pnpm typecheck`、`pnpm build`、`pnpm dev` での目視で行う。

**Files:**
- Create: `src/features/tournament/components/MatchNode.tsx`
- Create: `src/features/tournament/components/TournamentFlow.tsx`
- Modify: `src/app/page.tsx`（全面書き換え）
- Modify: `src/app/layout.tsx`（`metadata` の更新）
- Delete: `src/app/page.test.tsx`（"Hello world!" のプレースホルダテスト。対象が無くなる）

**Interfaces:**
- Consumes:
  - `./MatchCard` の `MatchCard`
  - `../lib/to-flow-elements` の `MatchFlowNode`, `toFlowElements`
  - `../lib/layout-bracket` の `layoutBracket`
  - `../lib/resolve-bracket` の `resolveBracket`
  - `../mock/participants` の `mockParticipants`、`../mock/bracket` の `mockBracket`、`../mock/results` の `mockResults`
- Produces:
  - `MatchNode(props: NodeProps<MatchFlowNode>)`
  - `TournamentFlow(props: { nodes: MatchFlowNode[]; edges: Edge[] })`

- [ ] **Step 1: Next.js のドキュメントを読む**

`AGENTS.md` の指示どおり、Next.js 固有のコードを書く前に読む。

Run: `cat node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
確認すること: `"use client"` の置き方と、Server Component から Client Component へ props を渡す方法。

- [ ] **Step 2: カスタムノードを書く**

`MatchCard` を包み、React Flow のハンドルを左右に足すだけ。`@xyflow/react` の `Position` は enum で、`layout-bracket.ts` の `Position` 型と名前が衝突する。`HandlePosition` として import する。

Create `src/features/tournament/components/MatchNode.tsx`:

```tsx
import {
  Handle,
  type NodeProps,
  Position as HandlePosition,
} from "@xyflow/react";
import type { MatchFlowNode } from "../lib/to-flow-elements";
import { MatchCard } from "./MatchCard";

export function MatchNode({ data }: NodeProps<MatchFlowNode>) {
  return (
    <>
      <Handle
        type="target"
        position={HandlePosition.Left}
        isConnectable={false}
        className="!bg-slate-400"
      />
      <MatchCard match={data.match} />
      <Handle
        type="source"
        position={HandlePosition.Right}
        isConnectable={false}
        className="!bg-slate-400"
      />
    </>
  );
}
```

- [ ] **Step 3: ReactFlow のラッパーを書く**

`nodeTypes` は再レンダリングのたびに新しいオブジェクトを作らないよう、コンポーネントの外で定義する（React Flow の要件）。React Flow の CSS もここで import する。

Create `src/features/tournament/components/TournamentFlow.tsx`:

```tsx
"use client";

import { Background, Controls, type Edge, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { MatchFlowNode } from "../lib/to-flow-elements";
import { MatchNode } from "./MatchNode";

const nodeTypes = { match: MatchNode };

export function TournamentFlow({
  nodes,
  edges,
}: {
  nodes: MatchFlowNode[];
  edges: Edge[];
}) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
```

- [ ] **Step 4: ページを書き換える**

合成は Server Component 側で行い、クライアントへは描画に必要なデータだけを渡す。

`src/app/page.tsx` の中身を次で置き換える:

```tsx
import { TournamentFlow } from "@/features/tournament/components/TournamentFlow";
import { layoutBracket } from "@/features/tournament/lib/layout-bracket";
import { resolveBracket } from "@/features/tournament/lib/resolve-bracket";
import { toFlowElements } from "@/features/tournament/lib/to-flow-elements";
import { mockBracket } from "@/features/tournament/mock/bracket";
import { mockParticipants } from "@/features/tournament/mock/participants";
import { mockResults } from "@/features/tournament/mock/results";

export default function Home() {
  const resolved = resolveBracket(mockParticipants, mockBracket, mockResults);
  const { nodes, edges } = toFlowElements(resolved, layoutBracket(resolved));

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-bold text-slate-800">{mockBracket.name}</h1>
        <p className="text-xs text-slate-500">
          シングルエリミネーション / 参加者 {mockParticipants.length} 名
        </p>
      </header>
      <div className="flex-1">
        <TournamentFlow nodes={nodes} edges={edges} />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: 不要になったテストを削除し、metadata を更新する**

```bash
git rm src/app/page.test.tsx
```

`src/app/layout.tsx` の `metadata` を次で置き換える:

```tsx
export const metadata: Metadata = {
  title: "トーナメント表",
  description: "シングルエリミネーションのトーナメント表",
};
```

- [ ] **Step 6: 全テストが通ることを確認する**

Run: `pnpm test`
Expected: PASS。Task 1〜5 の 5 ファイル（mock / resolve-bracket / layout-bracket / to-flow-elements / MatchCard）が全て緑。削除した `page.test.tsx` は実行されない

- [ ] **Step 7: 型チェックと lint を通す**

Run: `pnpm typecheck && pnpm lint:fix`
Expected: どちらもエラーなし

- [ ] **Step 8: 本番ビルドが通ることを確認する**

Run: `pnpm build`
Expected: ビルド成功。ルート一覧に `/` が出る。エラーなし

- [ ] **Step 9: 開発サーバで目視確認する**

Run: `pnpm dev` して `http://localhost:3000` を開く。

確認すること:

- 4 ラウンド分（8 / 4 / 2 / 1 = 15 試合）のノードが左から右へ並び、エッジで繋がっている
- `r1-m1` / `r1-m4` / `r1-m5` / `r1-m8` の下段に「BYE」と表示され、上段の参加者がハイライトされている
- 決勝（右端の 1 ノード）は上段が「佐藤 蓮」、下段が「未定」になっている
- 決着済みの試合に「3-1」などのスコアバッジが出ている
- ホイールでズーム、ドラッグでパンでき、ノード自体はドラッグできない
- 2 回戦以降の試合が、供給元 2 試合の中間の高さに配置されている

確認後 Ctrl+C でサーバを止める。

- [ ] **Step 10: コミット**

```bash
git add -A src
git commit -m "feat: render tournament bracket with React Flow

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
