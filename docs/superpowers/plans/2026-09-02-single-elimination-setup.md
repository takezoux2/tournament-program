# シングルエリミネーション編集画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Division` の `entries`（誰が出るか）と `matchingConfig`（組み合わせ）を 1 画面で編集できるようにする。

**Architecture:** シングルエリミネーションのブラケットは「1 回戦のスロット割当配列（長さ 2 の冪）」だけで完全に決まる。この配列を唯一の状態とし、`MatchingConfig` の木は毎回そこから組み立て直す。生成・追加・削除・入れ替えの 4 操作は全て配列操作に還元される。永続化は `features/division` 配下の 5 つの垂直スライスが担い、共通の read-modify-write は `setup-store.ts` に集約する。

**Tech Stack:** Next.js 16 (App Router, Server Actions) / React 19 / Prisma 7 (PostgreSQL) / Effect / Zod 4 / Vitest + Testing Library / Tailwind 4 / @dnd-kit

**Spec:** `docs/superpowers/specs/2026-09-02-single-elimination-setup-design.md`

## Global Constraints

- パッケージマネージャは **pnpm** を使う（`pnpm add`, `pnpm test`, `pnpm typecheck`, `pnpm lint`）。
- アーキテクチャは垂直スライス。**`features/` 配下のスライスは同列・下位のスライスに依存してはならない。** 共有物はカテゴリ直下（`features/division/*.ts`）に置き、祖先方向に参照する。
- **認可境界 `requireOrganization(slug)` は Server Action の冒頭で独立に呼ぶ。** ページで確認済みでも省略しない。
- **所有権はクエリの `where` に入れる。** 単数形 `update` / `delete` ではなく `updateMany` / `deleteMany` を使い、`where` に `tournament: { id, organizationId }` を残す。0 件は `notFound()` に倒す。
- `src/features/` 配下に `.tsx` を置かない。コンポーネントは `src/components/` に置く。
- 検証は Zod。副作用は Effect で扱う。
- 対象形式は `SINGLE_ELIMINATION` のみ。
- エントリー数の上限は **128**。
- コメントは日本語で、「なぜそうしたか」を書く。既存ファイルの密度に合わせる。
- 新規依存の追加は `@dnd-kit/core` と `@dnd-kit/sortable` のみ。

## Setup（最初に 1 回だけ）

- [ ] **Step 0-1: 型生成を通す**

新しいワークツリーでは `PageProps` が未生成で `pnpm typecheck` が落ちる。

Run: `pnpm install && pnpm exec next typegen`

- [ ] **Step 0-2: 現状のテストが緑であることを確認**

Run: `pnpm test`
Expected: 全て PASS

## File Structure

| ファイル | 責務 |
|---|---|
| `src/features/division/single-elimination/build.ts` | `seedOrder` / `buildFromSlots` / `toSlots`。配列 ⇄ 木の変換 |
| `src/features/division/single-elimination/edit.ts` | `generateSlots` / `placeEntry` / `swapSlots`。配列そのものの操作 |
| `src/features/division/single-elimination/view.ts` | 保存済みの木を画面表示用の行に変換する |
| `src/features/division/errors.ts` | エラータグ 6 種の追加（既存を修正） |
| `src/features/division/messages.ts` | 追加タグの文言（既存を修正） |
| `src/features/division/state.ts` | `notice` の追加（既存を修正） |
| `src/features/division/revalidate.ts` | setup / 詳細ページの再検証をまとめる |
| `src/features/division/setup-store.ts` | 5 スライス共通の read-modify-write。所有権・パース・検証・書き戻し |
| `src/features/division/generate-matching/` | 組み合わせの自動生成スライス |
| `src/features/division/swap-slots/` | 1 回戦スロットの入れ替えスライス |
| `src/features/division/add-entry/` | エントリー追加スライス（Member / Participant の作成を含む） |
| `src/features/division/remove-entry/` | エントリー削除スライス（削除後に再生成） |
| `src/features/division/reorder-entry/` | エントリーのシード順入れ替えスライス |
| `src/features/organization/repository.ts` | `listMembersInOrganization` の追加（既存を修正） |
| `src/features/division/repository.ts` | `DivisionParticipant` に `nameKana` を追加（既存を修正） |
| `src/components/division/AddEntryForm.tsx` | 既存 Member を選ぶ / 新規登録するフォーム |
| `src/components/division/EntryRowActions.tsx` | 1 行ぶんの ↑↓ と削除 |
| `src/components/division/EntryList.tsx` | エントリー一覧 |
| `src/components/division/MatchingEditor.tsx` | 1 回戦カードの D&D。`onSwap` を props で受ける |
| `src/components/division/MatchingSection.tsx` | 生成ボタンと `MatchingEditor` のサーバ配線 |
| `src/components/division/DivisionSetup.tsx` | 画面全体の組み立て |
| `src/app/.../divisions/[divisionId]/setup/page.tsx` | ページ |

---

### Task 1: 配列 ⇄ 木の変換（build.ts）

ブラケットの木を「1 回戦のスロット割当配列」から組み立て、また取り出す。この 2 つが全操作の土台になる。

**Files:**
- Create: `src/features/division/single-elimination/build.ts`
- Test: `src/features/division/single-elimination/build.test.ts`

**Interfaces:**
- Consumes: `SlotSource`, `BracketMatch`, `MatchingConfig`（`src/lib/division/types.ts`、既存）
- Produces:
  - `seedOrder(size: number): number[]`
  - `buildFromSlots(slots: SlotSource[]): MatchingConfig`
  - `toSlots(config: MatchingConfig): SlotSource[]`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/features/division/single-elimination/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MatchingConfig, SlotSource } from "@/lib/division/types";
import { buildFromSlots, seedOrder, toSlots } from "./build";

const entry = (id: string): SlotSource => ({ kind: "entry", entryId: id });
const bye: SlotSource = { kind: "bye" };

describe("seedOrder", () => {
  it("size 1 は 1 番だけを返す", () => {
    expect(seedOrder(1)).toEqual([1]);
  });

  it("size 8 で標準シード順を返す", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("1 番と 2 番が決勝まで当たらない", () => {
    const order = seedOrder(16);
    // 1 番は前半、2 番は後半に入るのが標準シード配置の要件。
    expect(order.indexOf(1)).toBeLessThan(8);
    expect(order.indexOf(2)).toBeGreaterThanOrEqual(8);
  });

  it("size 0 は空配列を返す", () => {
    expect(seedOrder(0)).toEqual([]);
  });
});

describe("buildFromSlots", () => {
  it("2 スロットなら決勝 1 試合だけになる", () => {
    const config = buildFromSlots([entry("a"), entry("b")]);
    expect(config.matches).toEqual([
      {
        id: "m1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        slots: [entry("a"), entry("b")],
      },
    ]);
  });

  it("8 スロットなら 4 + 2 + 1 の 7 試合になる", () => {
    const slots = ["a", "b", "c", "d", "e", "f", "g", "h"].map(entry);
    const config = buildFromSlots(slots);
    expect(config.matches).toHaveLength(7);
    expect(config.matches.filter((match) => match.round === 1)).toHaveLength(4);
    expect(config.matches.filter((match) => match.round === 2)).toHaveLength(2);
    expect(config.matches.filter((match) => match.round === 3)).toHaveLength(1);
  });

  it("2 回戦以降は前ラウンドの勝者を参照する", () => {
    const slots = ["a", "b", "c", "d"].map(entry);
    const config = buildFromSlots(slots);
    const second = config.matches.find((match) => match.id === "m2-0");
    expect(second?.slots).toEqual([
      { kind: "winnerOf", matchId: "m1-0" },
      { kind: "winnerOf", matchId: "m1-1" },
    ]);
  });

  it("スロットが 2 未満なら試合を作らない", () => {
    expect(buildFromSlots([]).matches).toEqual([]);
    expect(buildFromSlots([entry("a")]).matches).toEqual([]);
  });
});

describe("toSlots", () => {
  it("buildFromSlots と往復して元に戻る", () => {
    const slots = [entry("a"), bye, entry("c"), entry("d")];
    expect(toSlots(buildFromSlots(slots))).toEqual(slots);
  });

  it("1 回戦を order 昇順に並べ直して取り出す", () => {
    // DB の Json は順序が保証されないため、order で並べ直せることを確かめる。
    const config: MatchingConfig = {
      version: 1,
      matches: [
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          slots: [entry("c"), entry("d")],
        },
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          slots: [entry("a"), entry("b")],
        },
      ],
    };
    expect(toSlots(config)).toEqual([
      entry("a"),
      entry("b"),
      entry("c"),
      entry("d"),
    ]);
  });

  it("1 回戦が無ければ空配列を返す", () => {
    expect(toSlots({ version: 1, matches: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/division/single-elimination/build.test.ts`
Expected: FAIL（`Failed to resolve import "./build"`）

- [ ] **Step 3: 実装を書く**

Create `src/features/division/single-elimination/build.ts`:

```ts
import type { BracketMatch, MatchingConfig, SlotSource } from "@/lib/division/types";

/**
 * 標準シード順。size 個の位置それぞれに「何番シードが入るか」を 1 始まりで返す。
 * size = 8 なら [1, 8, 4, 5, 2, 7, 3, 6]。
 *
 * 1 → [1, 2] → [1, 4, 2, 3] → ... と、各段で「今の長さ + 1 - 自分」を隣に挿し込む。
 * この作り方だと上位シードどうしが最後まで当たらないことが構造的に保証される。
 */
export const seedOrder = (size: number): number[] => {
  if (size < 1) {
    return [];
  }
  let list = [1];
  while (list.length < size) {
    const length = list.length * 2;
    list = list.flatMap((seed) => [seed, length + 1 - seed]);
  }
  return list;
};

/**
 * 試合 id。round と order だけから決まるので、組み立て直しても同じ id になる。
 * winnerOf の参照も構造から再構築されるため、参照が壊れる経路が存在しない。
 */
const matchId = (round: number, order: number): string => `m${round}-${order}`;

/**
 * 1 回戦のスロット割当から勝ち上がり木を組み立てる。
 * slots の長さは 2 の冪であることを前提とする。2 未満なら試合が作れないので空。
 */
export const buildFromSlots = (slots: SlotSource[]): MatchingConfig => {
  if (slots.length < 2) {
    return { version: 1, matches: [] };
  }

  const matches: BracketMatch[] = [];

  for (let order = 0; order < slots.length / 2; order += 1) {
    matches.push({
      id: matchId(1, order),
      bracket: "winners",
      round: 1,
      order,
      slots: [slots[order * 2], slots[order * 2 + 1]],
    });
  }

  let previousCount = slots.length / 2;
  let round = 2;
  while (previousCount > 1) {
    const count = previousCount / 2;
    for (let order = 0; order < count; order += 1) {
      matches.push({
        id: matchId(round, order),
        bracket: "winners",
        round,
        order,
        slots: [
          { kind: "winnerOf", matchId: matchId(round - 1, order * 2) },
          { kind: "winnerOf", matchId: matchId(round - 1, order * 2 + 1) },
        ],
      });
    }
    previousCount = count;
    round += 1;
  }

  return { version: 1, matches };
};

/**
 * 木から 1 回戦のスロット割当を取り出す。buildFromSlots の逆向き。
 * Json の配列順は当てにできないので order で並べ直す。
 */
export const toSlots = (config: MatchingConfig): SlotSource[] =>
  config.matches
    .filter((match) => match.round === 1)
    .sort((left, right) => left.order - right.order)
    .flatMap((match) => [match.slots[0], match.slots[1]]);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test src/features/division/single-elimination/build.test.ts`
Expected: PASS（16 tests）

- [ ] **Step 5: コミット**

```bash
git add src/features/division/single-elimination/build.ts src/features/division/single-elimination/build.test.ts
git commit -m "feat(division): add bracket slot array to tree conversion"
```

---

### Task 2: スロット配列の操作（edit.ts）

生成・追加・入れ替えを、配列に対する純粋関数として書く。

**Files:**
- Create: `src/features/division/single-elimination/edit.ts`
- Test: `src/features/division/single-elimination/edit.test.ts`

**Interfaces:**
- Consumes: `seedOrder`（Task 1）、`DivisionEntry` / `SlotSource`（`src/lib/division/types.ts`）
- Produces:
  - `generateSlots(entries: DivisionEntry[]): SlotSource[]`
  - `placeEntry(slots: SlotSource[], entryId: string): SlotSource[]`
  - `swapSlots(slots: SlotSource[], indexA: number, indexB: number): SlotSource[] | null`（`null` = 入れ替え不能）

- [ ] **Step 1: 失敗するテストを書く**

Create `src/features/division/single-elimination/edit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntry, SlotSource } from "@/lib/division/types";
import { generateSlots, placeEntry, swapSlots } from "./edit";

const entries = (count: number): DivisionEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  }));

const entry = (id: string): SlotSource => ({ kind: "entry", entryId: id });
const bye: SlotSource = { kind: "bye" };

describe("generateSlots", () => {
  it("2 人ならそのまま 2 スロット", () => {
    expect(generateSlots(entries(2))).toEqual([entry("e1"), entry("e2")]);
  });

  it("3 人なら 4 スロットになり bye が 1 つ入る", () => {
    const slots = generateSlots(entries(3));
    expect(slots).toHaveLength(4);
    expect(slots.filter((slot) => slot.kind === "bye")).toHaveLength(1);
  });

  it("3 人のとき bye は第 1 シードの相手側に入る", () => {
    // seedOrder(4) = [1, 4, 2, 3]。4 番が居ないので index 1 が bye になり、
    // 第 1 シード（index 0）が 1 回戦を不戦勝で抜ける。
    expect(generateSlots(entries(3))).toEqual([
      entry("e1"),
      bye,
      entry("e2"),
      entry("e3"),
    ]);
  });

  it("5 人なら 8 スロットで bye が 3 つ", () => {
    const slots = generateSlots(entries(5));
    expect(slots).toHaveLength(8);
    expect(slots.filter((slot) => slot.kind === "bye")).toHaveLength(3);
  });

  it("9 人なら 16 スロットになる", () => {
    expect(generateSlots(entries(9))).toHaveLength(16);
  });

  it("seed 昇順に並べ直してから配置する", () => {
    const shuffled: DivisionEntry[] = [
      { id: "e2", participantId: "p2", seed: 1 },
      { id: "e1", participantId: "p1", seed: 0 },
    ];
    expect(generateSlots(shuffled)).toEqual([entry("e1"), entry("e2")]);
  });

  it("2 人未満なら空配列", () => {
    expect(generateSlots(entries(0))).toEqual([]);
    expect(generateSlots(entries(1))).toEqual([]);
  });
});

describe("placeEntry", () => {
  it("一番下の bye を埋める", () => {
    const slots = [entry("a"), bye, entry("c"), bye];
    expect(placeEntry(slots, "x")).toEqual([
      entry("a"),
      bye,
      entry("c"),
      entry("x"),
    ]);
  });

  it("元の配列を書き換えない", () => {
    const slots = [entry("a"), bye];
    placeEntry(slots, "x");
    expect(slots).toEqual([entry("a"), bye]);
  });

  it("bye が無ければ 2 倍に広げて末尾に入れる", () => {
    // 既存の対戦カードは 2 回戦へ繰り上がり、新しい人だけが 1 回戦を戦う。
    expect(placeEntry([entry("a"), entry("b")], "x")).toEqual([
      entry("a"),
      bye,
      entry("b"),
      entry("x"),
    ]);
  });

  it("組み合わせが未作成なら何もしない", () => {
    expect(placeEntry([], "x")).toEqual([]);
  });
});

describe("swapSlots", () => {
  it("2 つのスロットを入れ替える", () => {
    const slots = [entry("a"), entry("b"), entry("c"), bye];
    expect(swapSlots(slots, 0, 3)).toEqual([
      bye,
      entry("b"),
      entry("c"),
      entry("a"),
    ]);
  });

  it("同じ添字なら null", () => {
    expect(swapSlots([entry("a"), entry("b")], 1, 1)).toBeNull();
  });

  it("範囲外の添字なら null", () => {
    const slots = [entry("a"), entry("b")];
    expect(swapSlots(slots, -1, 0)).toBeNull();
    expect(swapSlots(slots, 0, 2)).toBeNull();
    expect(swapSlots(slots, 0, 1.5)).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/division/single-elimination/edit.test.ts`
Expected: FAIL（`Failed to resolve import "./edit"`）

- [ ] **Step 3: 実装を書く**

Create `src/features/division/single-elimination/edit.ts`:

```ts
import type { DivisionEntry, SlotSource } from "@/lib/division/types";
import { seedOrder } from "./build";

/**
 * 人数を 2 の冪へ切り上げる。2 人未満は試合が成立しないので 0 を返す。
 */
const bracketSize = (count: number): number => {
  if (count < 2) {
    return 0;
  }
  let size = 2;
  while (size < count) {
    size *= 2;
  }
  return size;
};

/**
 * シード順のエントリーから 1 回戦のスロット割当を作る。
 * 余った位置は bye になる。標準シード順の性質から、bye は自動的に
 * 上位シードの相手側へ寄る（＝強い人が不戦勝を得る）。
 */
export const generateSlots = (entries: DivisionEntry[]): SlotSource[] => {
  const sorted = [...entries].sort((left, right) => left.seed - right.seed);
  const size = bracketSize(sorted.length);
  if (size === 0) {
    return [];
  }

  return seedOrder(size).map((position): SlotSource => {
    const entry = sorted[position - 1];
    return entry === undefined
      ? { kind: "bye" }
      : { kind: "entry", entryId: entry.id };
  });
};

/**
 * エントリーを 1 人ぶん置く。末尾に一番近い bye を置き換える。
 *
 * bye が 1 つも無いときは各スロットを [中身, bye] に開いて 1 段拡張してから置く。
 * こうすると既存の対戦カードは 2 回戦としてそのまま残り、新しい人だけが
 * 1 回戦を戦う形になる。9 人目が来たら予選が 1 試合生える、という運営の実感に合う。
 *
 * slots が空（組み合わせ未作成）のときは何もしない。
 */
export const placeEntry = (
  slots: SlotSource[],
  entryId: string,
): SlotSource[] => {
  if (slots.length === 0) {
    return [];
  }

  const next = slots.some((slot) => slot.kind === "bye")
    ? [...slots]
    : slots.flatMap((slot): SlotSource[] => [slot, { kind: "bye" }]);

  // 末尾から探す。「一番下の bye を埋める」がこの操作の定義そのもの。
  // 拡張した直後は末尾が必ず bye なので、拡張経路でも必ず見つかる。
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].kind === "bye") {
      next[index] = { kind: "entry", entryId };
      return next;
    }
  }

  return next;
};

/**
 * 2 つのスロットを入れ替える。入れ替えられないときは null を返し、
 * 呼び出し側が「何も起きなかった」として扱えるようにする。
 * bye も対象にできるので「空きへ移す」も同じ操作で表現できる。
 */
export const swapSlots = (
  slots: SlotSource[],
  indexA: number,
  indexB: number,
): SlotSource[] | null => {
  const inRange = (index: number): boolean =>
    Number.isInteger(index) && index >= 0 && index < slots.length;

  if (!inRange(indexA) || !inRange(indexB) || indexA === indexB) {
    return null;
  }

  const next = [...slots];
  next[indexA] = slots[indexB];
  next[indexB] = slots[indexA];
  return next;
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test src/features/division/single-elimination/edit.test.ts`
Expected: PASS（14 tests）

- [ ] **Step 5: コミット**

```bash
git add src/features/division/single-elimination/edit.ts src/features/division/single-elimination/edit.test.ts
git commit -m "feat(division): add slot array operations for single elimination"
```

---

### Task 3: エラータグと通知の追加

5 スライスが使うエラー種別と、成功時の補足メッセージを足す。`messages.ts` は `Match.exhaustive` を使っているため、タグを足して文言を書き忘れるとコンパイルエラーになる。

**Files:**
- Modify: `src/features/division/errors.ts`
- Modify: `src/features/division/messages.ts`
- Modify: `src/features/division/state.ts`
- Create: `src/features/division/revalidate.ts`
- Test: `src/features/division/errors.test.ts`（既存に追記）
- Test: `src/features/division/messages.test.ts`（既存に追記）

**Interfaces:**
- Produces:
  - `DivisionResultsRecordedError` / `DivisionNotEnoughEntriesError` / `DivisionDataError` / `DivisionEntryLimitError` / `DivisionDuplicateEntryError` / `DivisionMemberNotFoundError`（いずれも `Data.TaggedError`）
  - `DivisionFormState = { error: string | null; notice?: string }`
  - `revalidateDivisionSetup(slug: string, tournamentId: string, divisionId: string): void`

- [ ] **Step 1: 既存のテストファイルの形を確認する**

Run: `cat src/features/division/errors.test.ts src/features/division/messages.test.ts`
既存の書き方に合わせて次のステップで追記する。

- [ ] **Step 2: 失敗するテストを書く**

Append to `src/features/division/errors.test.ts`:

```ts
describe("toDivisionError（追加分）", () => {
  it("Json のパース失敗を DivisionDataError に写す", () => {
    const error = toDivisionError(
      new DivisionJsonError("entries.version: version 1 を期待しました"),
      "t1",
    );
    expect(error._tag).toBe("DivisionDataError");
  });

  it("すでにドメインエラーならそのまま通す", () => {
    // トランザクションの中から投げたドメインエラーが
    // UnexpectedDivisionError に潰されないことを確かめる。
    const original = new DivisionResultsRecordedError({ divisionId: "d1" });
    expect(toDivisionError(original, "t1")).toBe(original);
  });
});
```

同ファイル先頭の import に次を足す:

```ts
import { DivisionJsonError } from "@/lib/division/parse";
import { DivisionResultsRecordedError } from "./errors";
```

Append to `src/features/division/messages.test.ts`:

```ts
describe("divisionErrorMessage（追加分）", () => {
  it.each([
    ["DivisionResultsRecordedError", new DivisionResultsRecordedError({ divisionId: "d1" })],
    ["DivisionNotEnoughEntriesError", new DivisionNotEnoughEntriesError({ divisionId: "d1" })],
    ["DivisionDataError", new DivisionDataError({ reason: "broken" })],
    ["DivisionEntryLimitError", new DivisionEntryLimitError({ divisionId: "d1" })],
    ["DivisionDuplicateEntryError", new DivisionDuplicateEntryError({ divisionId: "d1" })],
    ["DivisionMemberNotFoundError", new DivisionMemberNotFoundError({ memberId: "m1" })],
  ])("%s に空でない日本語の文言を返す", (_tag, error) => {
    expect(divisionErrorMessage(error).length).toBeGreaterThan(0);
  });
});
```

同ファイル先頭の import に 6 つのエラークラスを足す。

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm test src/features/division/errors.test.ts src/features/division/messages.test.ts`
Expected: FAIL（`DivisionResultsRecordedError` などが export されていない）

- [ ] **Step 4: errors.ts にタグを足す**

`src/features/division/errors.ts` の import に足す:

```ts
import { DivisionJsonError } from "@/lib/division/parse";
```

`UnexpectedDivisionError` の下に足す:

```ts
/** 勝敗が記録済みの部門を編集しようとしたことを表す。 */
export class DivisionResultsRecordedError extends Data.TaggedError(
  "DivisionResultsRecordedError",
)<{
  readonly divisionId: string;
}> {}

/** 組み合わせを作るにはエントリーが足りないことを表す。 */
export class DivisionNotEnoughEntriesError extends Data.TaggedError(
  "DivisionNotEnoughEntriesError",
)<{
  readonly divisionId: string;
}> {}

/**
 * DB の Json が想定の形をしていない、または保存直前の検証を通らなかったことを表す。
 * 純粋関数が正しければ後者には到達しない。到達したらバグである。
 */
export class DivisionDataError extends Data.TaggedError("DivisionDataError")<{
  readonly reason: unknown;
}> {}

/** エントリー数の上限に達していることを表す。 */
export class DivisionEntryLimitError extends Data.TaggedError(
  "DivisionEntryLimitError",
)<{
  readonly divisionId: string;
}> {}

/** 同じ参加者を二重にエントリーしようとしたことを表す。 */
export class DivisionDuplicateEntryError extends Data.TaggedError(
  "DivisionDuplicateEntryError",
)<{
  readonly divisionId: string;
}> {}

/** 選ばれた Member がこの組織に無いことを表す。 */
export class DivisionMemberNotFoundError extends Data.TaggedError(
  "DivisionMemberNotFoundError",
)<{
  readonly memberId: string;
}> {}
```

`DivisionError` の union に 6 つを足す:

```ts
export type DivisionError =
  | DivisionOrderConflictError
  | UnexpectedDivisionError
  | DivisionResultsRecordedError
  | DivisionNotEnoughEntriesError
  | DivisionDataError
  | DivisionEntryLimitError
  | DivisionDuplicateEntryError
  | DivisionMemberNotFoundError;
```

`toDivisionError` を差し替える:

```ts
export const toDivisionError = (
  reason: unknown,
  tournamentId: string,
): DivisionError => {
  // トランザクションの中から投げたドメインエラーは、ここで
  // UnexpectedDivisionError に潰さずそのまま通す。
  if (
    reason instanceof DivisionOrderConflictError ||
    reason instanceof DivisionResultsRecordedError ||
    reason instanceof DivisionNotEnoughEntriesError ||
    reason instanceof DivisionDataError ||
    reason instanceof DivisionEntryLimitError ||
    reason instanceof DivisionDuplicateEntryError ||
    reason instanceof DivisionMemberNotFoundError
  ) {
    return reason;
  }
  if (reason instanceof DivisionJsonError) {
    return new DivisionDataError({ reason });
  }
  if (
    reason instanceof Prisma.PrismaClientKnownRequestError &&
    reason.code === "P2002"
  ) {
    return new DivisionOrderConflictError({ tournamentId });
  }
  return new UnexpectedDivisionError({ reason });
};
```

- [ ] **Step 5: messages.ts に文言を足す**

`src/features/division/messages.ts` の `Match.type` チェーンに、`Match.exhaustive` の直前へ足す:

```ts
    Match.tag(
      "DivisionResultsRecordedError",
      () => "勝敗が記録されているため、エントリーと組み合わせは変更できません",
    ),
    Match.tag(
      "DivisionNotEnoughEntriesError",
      () => "組み合わせを作るにはエントリーが2人以上必要です",
    ),
    Match.tag(
      "DivisionDataError",
      () => "部門のデータが壊れています。管理者に連絡してください",
    ),
    Match.tag("DivisionEntryLimitError", () => "エントリーは128人までです"),
    Match.tag(
      "DivisionDuplicateEntryError",
      () => "その参加者はすでにエントリーしています",
    ),
    Match.tag(
      "DivisionMemberNotFoundError",
      () => "選択したメンバーが見つかりません",
    ),
```

- [ ] **Step 6: state.ts に notice を足す**

`src/features/division/state.ts` の `DivisionFormState` を差し替える:

```ts
export type DivisionFormState = {
  error: string | null;
  /**
   * 成功時の補足。削除にともなう組み合わせの再生成などを画面に伝える。
   * 既存 4 スライスは返さないので省略可能にしてある。
   */
  notice?: string;
};
```

`INITIAL_DIVISION_FORM_STATE` と `DivisionFormAction` は変更しない。省略可能にしたことで既存のハンドラとそのテストは無修正で通る。

- [ ] **Step 7: revalidate.ts を作る**

Create `src/features/division/revalidate.ts`:

```ts
import { revalidatePath } from "next/cache";

/**
 * エントリー・組み合わせを変えたあとに再検証すべきページ。
 * 5 つのスライスが同じ 2 本を叩くので、書き漏らしを防ぐためここへ集約する。
 */
export const revalidateDivisionSetup = (
  slug: string,
  tournamentId: string,
  divisionId: string,
): void => {
  const base = `/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`;
  revalidatePath(base);
  revalidatePath(`${base}/setup`);
};
```

- [ ] **Step 8: テストが通ることを確認**

Run: `pnpm test src/features/division/ && pnpm typecheck`
Expected: 全て PASS、型エラーなし

- [ ] **Step 9: 仕様書の該当箇所を実装に合わせる**

`docs/superpowers/specs/2026-09-02-single-elimination-setup-design.md` の「エラー」節の表に 3 行足す:

```markdown
| `DivisionEntryLimitError` | エントリーは128人までです |
| `DivisionDuplicateEntryError` | その参加者はすでにエントリーしています |
| `DivisionMemberNotFoundError` | 選択したメンバーが見つかりません |
```

「画面へ通知を返す」節を次の内容に差し替える:

```markdown
`DivisionFormState` は今 `error` しか持たない。削除時の「再生成しました」を出すため
`notice?: string` を足す。省略可能にすることで、既存 4 スライスのハンドラとテストは
無修正のまま通る。`INITIAL_DIVISION_FORM_STATE` と `divisionErrorFormState` も変更しない。
```

- [ ] **Step 10: コミット**

```bash
git add src/features/division/errors.ts src/features/division/errors.test.ts src/features/division/messages.ts src/features/division/messages.test.ts src/features/division/state.ts src/features/division/revalidate.ts docs/superpowers/specs/2026-09-02-single-elimination-setup-design.md
git commit -m "feat(division): add setup error tags, form notice and revalidate helper"
```

---

### Task 4: 共通の read-modify-write（setup-store.ts）

5 つのスライスは全て「所有権つきで読む → 純粋関数で加工 → 検証して書き戻す」を同じ形で行う。ここに集約してスライス側の repository を薄く保つ。

**Files:**
- Create: `src/features/division/setup-store.ts`
- Test: `src/features/division/setup-store.test.ts`

**Interfaces:**
- Consumes: `parseDivisionEntries` / `parseMatchingConfig` / `parseDivisionResults`（`@/lib/division/parse`）、`validateEntries` / `validateMatchingConfig`（`@/lib/division/validate`）、Task 3 のエラータグ
- Produces:
  - `type DivisionIds = { organizationId: string; tournamentId: string; divisionId: string }`
  - `type DivisionSetup = { entries: DivisionEntries; matchingConfig: MatchingConfig }`
  - `type DivisionSetupTx = Prisma.TransactionClient`
  - `type DivisionSetupOutcome<T> = { found: false } | { found: true; value: T }`
  - `runDivisionSetup<T>(ids: DivisionIds, mutate: (tx: DivisionSetupTx, current: DivisionSetup) => Promise<{ next: DivisionSetup | null; value: T }>): Effect.Effect<DivisionSetupOutcome<T>, DivisionError>`
  - `next` が `null` なら書き込みを行わない（no-op）

- [ ] **Step 1: 失敗するテストを書く**

Create `src/features/division/setup-store.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_DIVISION_ENTRIES,
  EMPTY_MATCHING_CONFIG,
} from "@/lib/division/types";
import { failureTag } from "@/shared/testing/exit";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const participantFindMany = vi.fn();

// $transaction には「トランザクション用クライアント」を受け取るコールバックを渡す。
// テストでは同じモック群をそのまま渡し、呼ばれた引数だけを見る。
const tx = {
  division: {
    findFirst: (args: unknown) => divisionFindFirst(args),
    updateMany: (args: unknown) => divisionUpdateMany(args),
  },
  participant: { findMany: (args: unknown) => participantFindMany(args) },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { runDivisionSetup } = await import("./setup-store");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const emptyRow = {
  entries: EMPTY_DIVISION_ENTRIES,
  matchingConfig: EMPTY_MATCHING_CONFIG,
  results: { version: 1, matches: [] },
};

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  participantFindMany.mockResolvedValue([]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("runDivisionSetup", () => {
  it("組織・大会・部門の 3 段を where に入れて読む", async () => {
    divisionFindFirst.mockResolvedValue(emptyRow);

    await Effect.runPromise(
      runDivisionSetup(ids, async () => ({ next: null, value: null })),
    );

    expect(divisionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
  });

  it("部門が無ければ found: false を返し mutate を呼ばない", async () => {
    divisionFindFirst.mockResolvedValue(null);
    const mutate = vi.fn();

    const result = await Effect.runPromise(runDivisionSetup(ids, mutate));

    expect(result).toEqual({ found: false });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("勝敗が記録されていれば拒否する", async () => {
    divisionFindFirst.mockResolvedValue({
      ...emptyRow,
      results: {
        version: 1,
        matches: [{ matchId: "m1-0", winnerEntryId: "e1" }],
      },
    });

    const exit = await Effect.runPromiseExit(
      runDivisionSetup(ids, async () => ({ next: null, value: null })),
    );

    expect(failureTag(exit)).toBe("DivisionResultsRecordedError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("Json が壊れていれば DivisionDataError にする", async () => {
    divisionFindFirst.mockResolvedValue({ ...emptyRow, entries: { version: 2 } });

    const exit = await Effect.runPromiseExit(
      runDivisionSetup(ids, async () => ({ next: null, value: null })),
    );

    expect(failureTag(exit)).toBe("DivisionDataError");
  });

  it("next が null なら書き込まない", async () => {
    divisionFindFirst.mockResolvedValue(emptyRow);

    const result = await Effect.runPromise(
      runDivisionSetup(ids, async () => ({
        next: null,
        value: { swapped: false },
      })),
    );

    expect(result).toEqual({ found: true, value: { swapped: false } });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("next があれば所有条件つきの updateMany で書き戻す", async () => {
    divisionFindFirst.mockResolvedValue(emptyRow);
    participantFindMany.mockResolvedValue([{ id: "p1" }]);

    const next = {
      entries: {
        version: 1 as const,
        entries: [{ id: "e1", participantId: "p1", seed: 0 }],
      },
      matchingConfig: EMPTY_MATCHING_CONFIG,
    };

    await Effect.runPromise(
      runDivisionSetup(ids, async () => ({ next, value: null })),
    );

    expect(divisionUpdateMany).toHaveBeenCalledWith({
      where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
      data: { entries: next.entries, matchingConfig: next.matchingConfig },
    });
  });

  it("検証を通らない結果は書き込まず DivisionDataError にする", async () => {
    divisionFindFirst.mockResolvedValue(emptyRow);
    // 大会に居ない participant を entries が参照している状態を作る。
    participantFindMany.mockResolvedValue([]);

    const exit = await Effect.runPromiseExit(
      runDivisionSetup(ids, async () => ({
        next: {
          entries: {
            version: 1 as const,
            entries: [{ id: "e1", participantId: "missing", seed: 0 }],
          },
          matchingConfig: EMPTY_MATCHING_CONFIG,
        },
        value: null,
      })),
    );

    expect(failureTag(exit)).toBe("DivisionDataError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/division/setup-store.test.ts`
Expected: FAIL（`Failed to resolve import "./setup-store"`）

- [ ] **Step 3: 実装を書く**

Create `src/features/division/setup-store.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
import {
  validateEntries,
  validateMatchingConfig,
} from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionResultsRecordedError,
  toDivisionError,
} from "./errors";

/** 3 段の所有権を表す組。全スライスがこの形で受け渡す。 */
export type DivisionIds = {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
};

/** 編集対象の Json 2 列。results は変更しないので運ばない。 */
export type DivisionSetup = {
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
};

export type DivisionSetupTx = Prisma.TransactionClient;

/** found: false は「この組織のこの大会にその部門が無い」。呼び出し側は notFound() へ倒す。 */
export type DivisionSetupOutcome<T> =
  | { found: false }
  | { found: true; value: T };

/**
 * 所有権を where に入れて読み、Json を検証済みの形にして返す。
 * 勝敗が 1 件でも記録されていれば、この画面からは編集させない。
 */
const load = async (
  tx: DivisionSetupTx,
  ids: DivisionIds,
): Promise<DivisionSetup | null> => {
  const row = await tx.division.findFirst({
    where: {
      id: ids.divisionId,
      tournament: { id: ids.tournamentId, organizationId: ids.organizationId },
    },
    select: { entries: true, matchingConfig: true, results: true },
  });
  if (!row) {
    return null;
  }

  if (parseDivisionResults(row.results).matches.length > 0) {
    throw new DivisionResultsRecordedError({ divisionId: ids.divisionId });
  }

  return {
    entries: parseDivisionEntries(row.entries),
    matchingConfig: parseMatchingConfig(row.matchingConfig),
  };
};

/**
 * 書き戻し。where に所有条件を残すため update ではなく updateMany を使う。
 * 保存の直前に検証を通し、通らなければ書かない。純粋関数が正しければ
 * ここは素通りするだけで、落ちたときは握り潰さずバグとして表に出す。
 */
const save = async (
  tx: DivisionSetupTx,
  ids: DivisionIds,
  next: DivisionSetup,
): Promise<void> => {
  const participants = await tx.participant.findMany({
    where: { tournamentId: ids.tournamentId },
    select: { id: true },
  });

  const errors = [
    ...validateEntries(
      next.entries,
      participants.map((participant) => participant.id),
    ),
    ...validateMatchingConfig(next.matchingConfig, next.entries),
  ];
  if (errors.length > 0) {
    throw new DivisionDataError({ reason: errors });
  }

  await tx.division.updateMany({
    where: {
      id: ids.divisionId,
      tournament: { id: ids.tournamentId, organizationId: ids.organizationId },
    },
    data: { entries: next.entries, matchingConfig: next.matchingConfig },
  });
};

/**
 * 読み → 加工 → 書き戻しを 1 つのトランザクションで回す。5 つのスライスが共有する。
 *
 * mutate には tx をそのまま渡す。add-entry のように Member / Participant を
 * 同じトランザクションで作る必要があるスライスがあるため。
 * next: null のときは書き込まない（端まで来た並べ替えなどの no-op）。
 *
 * 楽観ロックは入れていない。トランザクション内の read-modify-write なので単一操作の
 * 原子性は保たれるが、2 人が同時に開いていれば後の操作が前を上書きする。
 */
export const runDivisionSetup = <T>(
  ids: DivisionIds,
  mutate: (
    tx: DivisionSetupTx,
    current: DivisionSetup,
  ) => Promise<{ next: DivisionSetup | null; value: T }>,
): Effect.Effect<DivisionSetupOutcome<T>, DivisionError> =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<DivisionSetupOutcome<T>> => {
        const current = await load(tx, ids);
        if (current === null) {
          return { found: false };
        }

        const { next, value } = await mutate(tx, current);
        if (next !== null) {
          await save(tx, ids, next);
        }
        return { found: true, value };
      }),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test src/features/division/setup-store.test.ts && pnpm typecheck`
Expected: PASS（7 tests）、型エラーなし

`Prisma.TransactionClient` が解決できない場合は `pnpm exec prisma generate` を実行してから再実行する。

- [ ] **Step 5: コミット**

```bash
git add src/features/division/setup-store.ts src/features/division/setup-store.test.ts
git commit -m "feat(division): add shared read-modify-write store for setup slices"
```

---

### Task 5: 組み合わせの自動生成スライス（generate-matching）

一番単純なスライス。ここでスライスの型を固めて、以降 4 つはこれをなぞる。

**Files:**
- Create: `src/features/division/generate-matching/repository.ts`
- Create: `src/features/division/generate-matching/usecase.ts`
- Create: `src/features/division/generate-matching/handler.ts`
- Test: `src/features/division/generate-matching/repository.test.ts`
- Test: `src/features/division/generate-matching/usecase.test.ts`
- Test: `src/features/division/generate-matching/handler.test.ts`

`schema.ts` は置かない。検証すべき入力が無いスライスに空の Zod スキーマを置くと、
何を守っているのか読めなくなるため。id 3 つは他スライスと同じく `formData` から直接取る。

**Interfaces:**
- Consumes: `runDivisionSetup` / `DivisionIds` / `DivisionSetupOutcome`（Task 4）、`buildFromSlots`（Task 1）、`generateSlots`（Task 2）、`DivisionNotEnoughEntriesError`（Task 3）、`revalidateDivisionSetup`（Task 3）
- Produces:
  - `type GenerateMatchingPort = (ids: DivisionIds) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>`
  - `generateMatchingInDb: GenerateMatchingPort`
  - `generateMatching(port: GenerateMatchingPort, ids: DivisionIds): Effect.Effect<DivisionSetupOutcome<null>, DivisionError>`
  - `generateMatchingAction: DivisionFormAction`

- [ ] **Step 1: usecase の失敗するテストを書く**

Create `src/features/division/generate-matching/usecase.test.ts`:

```ts
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { DivisionIds } from "../setup-store";
import { generateMatching } from "./usecase";

const ids: DivisionIds = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d1",
};

describe("generateMatching", () => {
  it("受け取った id をそのままポートへ渡す", async () => {
    const port = vi.fn(() => Effect.succeed({ found: true, value: null }));

    const result = await Effect.runPromise(generateMatching(port, ids));

    expect(port).toHaveBeenCalledWith(ids);
    expect(result).toEqual({ found: true, value: null });
  });
});
```

- [ ] **Step 2: repository の失敗するテストを書く**

Create `src/features/division/generate-matching/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";
import { failureTag } from "@/shared/testing/exit";

const runDivisionSetup = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (
    ids: unknown,
    mutate: (tx: unknown, current: DivisionSetup) => Promise<unknown>,
  ) => runDivisionSetup(ids, mutate),
}));

const { generateMatchingInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const setup = (count: number): DivisionSetup => ({
  entries: {
    version: 1,
    entries: Array.from({ length: count }, (_, index) => ({
      id: `e${index + 1}`,
      participantId: `p${index + 1}`,
      seed: index,
    })),
  },
  matchingConfig: { version: 1, matches: [] },
});

/** runDivisionSetup に渡された mutate を取り出して直接呼ぶ。 */
const callMutate = async (current: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate({}, current);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  runDivisionSetup.mockReturnValue(Effect.succeed({ found: true, value: null }));
});

describe("generateMatchingInDb", () => {
  it("エントリーのシード順から木を組み立てる", async () => {
    await Effect.runPromise(generateMatchingInDb(ids));
    const { next } = await callMutate(setup(4));

    expect(next.matchingConfig.matches).toHaveLength(3);
    expect(next.matchingConfig.matches[0].slots).toEqual([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e4" },
    ]);
  });

  it("エントリーはそのまま持ち越す", async () => {
    await Effect.runPromise(generateMatchingInDb(ids));
    const current = setup(4);
    const { next } = await callMutate(current);

    expect(next.entries).toBe(current.entries);
  });

  it("2 人未満なら拒否する", async () => {
    await Effect.runPromise(generateMatchingInDb(ids));

    await expect(callMutate(setup(1))).rejects.toMatchObject({
      _tag: "DivisionNotEnoughEntriesError",
    });
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm test src/features/division/generate-matching/`
Expected: FAIL（`Failed to resolve import "./usecase"` / `"./repository"`）

- [ ] **Step 4: repository と usecase を実装する**

Create `src/features/division/generate-matching/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionNotEnoughEntriesError } from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";
import { generateSlots } from "../single-elimination/edit";

export type GenerateMatchingPort = (
  ids: DivisionIds,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const generateMatchingInDb: GenerateMatchingPort = (ids) =>
  runDivisionSetup(ids, async (_tx, current) => {
    const slots = generateSlots(current.entries.entries);
    // 2 人未満だと木が作れない。黙って空を書くと「生成した」と読めてしまうので弾く。
    if (slots.length === 0) {
      throw new DivisionNotEnoughEntriesError({ divisionId: ids.divisionId });
    }

    return {
      next: {
        entries: current.entries,
        matchingConfig: buildFromSlots(slots),
      },
      value: null,
    };
  });
```

Create `src/features/division/generate-matching/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { GenerateMatchingPort } from "./repository";

export const generateMatching = (
  port: GenerateMatchingPort,
  ids: DivisionIds,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids);
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm test src/features/division/generate-matching/`
Expected: PASS（4 tests）

- [ ] **Step 6: handler の失敗するテストを書く**

Create `src/features/division/generate-matching/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DivisionNotEnoughEntriesError } from "../errors";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const generateMatchingInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionSetup(slug, tournamentId, divisionId),
}));
vi.mock("./repository", () => ({
  generateMatchingInDb: (ids: unknown) => generateMatchingInDb(ids),
}));

const { generateMatchingAction } = await import("./handler");

const formData = () => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  generateMatchingInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
});

describe("generateMatchingAction", () => {
  it("Server Action の冒頭で認可を独立に確かめる", async () => {
    generateMatchingInDb.mockReturnValue(
      Effect.succeed({ found: true, value: null }),
    );

    await generateMatchingAction(INITIAL_DIVISION_FORM_STATE, formData());

    expect(requireOrganization).toHaveBeenCalledWith("acme");
  });

  it("成功したら再検証して通知を返す", async () => {
    generateMatchingInDb.mockReturnValue(
      Effect.succeed({ found: true, value: null }),
    );

    const state = await generateMatchingAction(
      INITIAL_DIVISION_FORM_STATE,
      formData(),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
    expect(state.notice).toBe("組み合わせを作成しました");
  });

  it("部門が無ければ 404 にする", async () => {
    generateMatchingInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      generateMatchingAction(INITIAL_DIVISION_FORM_STATE, formData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("エントリー不足は文言にして返す", async () => {
    generateMatchingInDb.mockReturnValue(
      Effect.fail(new DivisionNotEnoughEntriesError({ divisionId: "d1" })),
    );

    const state = await generateMatchingAction(
      INITIAL_DIVISION_FORM_STATE,
      formData(),
    );

    expect(state.error).toBe("組み合わせを作るにはエントリーが2人以上必要です");
  });
});
```

- [ ] **Step 7: テストが失敗することを確認**

Run: `pnpm test src/features/division/generate-matching/handler.test.ts`
Expected: FAIL（`Failed to resolve import "./handler"`）

- [ ] **Step 8: handler を実装する**

Create `src/features/division/generate-matching/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { generateMatchingInDb } from "./repository";
import { generateMatching } from "./usecase";

export const generateMatchingAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const exit = await Effect.runPromiseExit(
    generateMatching(generateMatchingInDb, {
      organizationId: organization.id,
      tournamentId,
      divisionId,
    }),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  // 生成は setup ページに留まる操作なので redirect はしない。
  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null, notice: "組み合わせを作成しました" };
};
```

- [ ] **Step 9: テストが通ることを確認**

Run: `pnpm test src/features/division/generate-matching/ && pnpm typecheck`
Expected: PASS（8 tests）、型エラーなし

- [ ] **Step 10: コミット**

```bash
git add src/features/division/generate-matching
git commit -m "feat(division): add generate-matching slice"
```

---

### Task 6: 1 回戦スロットの入れ替えスライス（swap-slots）

**Files:**
- Create: `src/features/division/swap-slots/schema.ts`
- Create: `src/features/division/swap-slots/repository.ts`
- Create: `src/features/division/swap-slots/usecase.ts`
- Create: `src/features/division/swap-slots/handler.ts`
- Test: `src/features/division/swap-slots/schema.test.ts`
- Test: `src/features/division/swap-slots/repository.test.ts`
- Test: `src/features/division/swap-slots/handler.test.ts`

**Interfaces:**
- Consumes: `runDivisionSetup` / `DivisionIds` / `DivisionSetupOutcome`（Task 4）、`buildFromSlots` / `toSlots`（Task 1）、`swapSlots`（Task 2）、`revalidateDivisionSetup`（Task 3）
- Produces:
  - `swapSlotsSchema` / `type SwapSlotsInput = { indexA: number; indexB: number }`
  - `type SwapSlotsPort = (ids: DivisionIds, input: SwapSlotsInput) => Effect.Effect<DivisionSetupOutcome<{ swapped: boolean }>, DivisionError>`
  - `swapSlotsInDb: SwapSlotsPort`
  - `swapSlotsForDivision(port: SwapSlotsPort, ids: DivisionIds, input: SwapSlotsInput): Effect.Effect<DivisionSetupOutcome<{ swapped: boolean }>, DivisionError>`
  - `swapSlotsAction: DivisionFormAction`

usecase の関数名を `swapSlots` にすると Task 2 の純粋関数と衝突して読みにくいため、
`swapSlotsForDivision` にする。

- [ ] **Step 1: schema の失敗するテストを書く**

Create `src/features/division/swap-slots/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { swapSlotsSchema } from "./schema";

describe("swapSlotsSchema", () => {
  it("フォームの文字列を数値に直す", () => {
    // FormData から来る値は必ず文字列なので、ここで数値へ寄せる。
    const parsed = swapSlotsSchema.parse({ indexA: "0", indexB: "3" });
    expect(parsed).toEqual({ indexA: 0, indexB: 3 });
  });

  it("負の数を弾く", () => {
    expect(swapSlotsSchema.safeParse({ indexA: "-1", indexB: "0" }).success).toBe(
      false,
    );
  });

  it("整数でない値を弾く", () => {
    expect(swapSlotsSchema.safeParse({ indexA: "1.5", indexB: "0" }).success).toBe(
      false,
    );
  });

  it("数値にならない値を弾く", () => {
    expect(swapSlotsSchema.safeParse({ indexA: "", indexB: "abc" }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/division/swap-slots/schema.test.ts`
Expected: FAIL（`Failed to resolve import "./schema"`）

- [ ] **Step 3: schema を実装する**

Create `src/features/division/swap-slots/schema.ts`:

```ts
import { z } from "zod";

/**
 * 1 回戦のスロット添字。範囲の上限はスロット数に依存するので、
 * ここでは形だけを見て、実際の範囲は repository が現物と突き合わせる。
 */
const slotIndexSchema = z.coerce
  .number({ error: "スロットの指定が不正です" })
  .int("スロットの指定が不正です")
  .min(0, "スロットの指定が不正です");

export const swapSlotsSchema = z.object({
  indexA: slotIndexSchema,
  indexB: slotIndexSchema,
});

export type SwapSlotsInput = z.infer<typeof swapSlotsSchema>;
```

`z.coerce.number()` は空文字を 0 に変換するため、空文字が通ってしまう場合は
`z.string().min(1)` を前段に挟む。テストが赤いままならその形に直す。

- [ ] **Step 4: repository の失敗するテストを書く**

Create `src/features/division/swap-slots/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";

const runDivisionSetup = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (
    ids: unknown,
    mutate: (tx: unknown, current: DivisionSetup) => Promise<unknown>,
  ) => runDivisionSetup(ids, mutate),
}));

const { swapSlotsInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const entry = (id: string) => ({ kind: "entry" as const, entryId: id });

const current: DivisionSetup = {
  entries: {
    version: 1,
    entries: ["e1", "e2", "e3", "e4"].map((id, index) => ({
      id,
      participantId: `p${index + 1}`,
      seed: index,
    })),
  },
  matchingConfig: buildFromSlots(["e1", "e2", "e3", "e4"].map(entry)),
};

const callMutate = async (setup: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate({}, setup);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  runDivisionSetup.mockReturnValue(
    Effect.succeed({ found: true, value: { swapped: true } }),
  );
});

describe("swapSlotsInDb", () => {
  it("指定した 2 スロットを入れ替えて木を組み立て直す", async () => {
    await Effect.runPromise(swapSlotsInDb(ids, { indexA: 0, indexB: 3 }));
    const { next, value } = await callMutate(current);

    expect(value).toEqual({ swapped: true });
    expect(next.matchingConfig.matches[0].slots).toEqual([
      entry("e4"),
      entry("e2"),
    ]);
    expect(next.matchingConfig.matches[1].slots).toEqual([
      entry("e3"),
      entry("e1"),
    ]);
  });

  it("エントリーには手を触れない", async () => {
    await Effect.runPromise(swapSlotsInDb(ids, { indexA: 0, indexB: 1 }));
    const { next } = await callMutate(current);

    expect(next.entries).toBe(current.entries);
  });

  it("範囲外の添字なら書き込まない", async () => {
    await Effect.runPromise(swapSlotsInDb(ids, { indexA: 0, indexB: 99 }));
    const { next, value } = await callMutate(current);

    expect(next).toBeNull();
    expect(value).toEqual({ swapped: false });
  });

  it("同じ添字なら書き込まない", async () => {
    await Effect.runPromise(swapSlotsInDb(ids, { indexA: 2, indexB: 2 }));
    const { next, value } = await callMutate(current);

    expect(next).toBeNull();
    expect(value).toEqual({ swapped: false });
  });
});
```

- [ ] **Step 5: テストが失敗することを確認**

Run: `pnpm test src/features/division/swap-slots/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 6: repository と usecase を実装する**

Create `src/features/division/swap-slots/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { buildFromSlots, toSlots } from "../single-elimination/build";
import { swapSlots } from "../single-elimination/edit";
import type { SwapSlotsInput } from "./schema";

export type SwapSlotsPort = (
  ids: DivisionIds,
  input: SwapSlotsInput,
) => Effect.Effect<DivisionSetupOutcome<{ swapped: boolean }>, DivisionError>;

export const swapSlotsInDb: SwapSlotsPort = (ids, input) =>
  runDivisionSetup(ids, async (_tx, current) => {
    const slots = swapSlots(
      toSlots(current.matchingConfig),
      input.indexA,
      input.indexB,
    );

    // null は「入れ替えられない指定だった」。画面上は何も起きなかったのと同じで、
    // 存在を漏らさないためにもエラーにはしない。
    if (slots === null) {
      return { next: null, value: { swapped: false } };
    }

    return {
      next: {
        entries: current.entries,
        matchingConfig: buildFromSlots(slots),
      },
      value: { swapped: true },
    };
  });
```

Create `src/features/division/swap-slots/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SwapSlotsPort } from "./repository";
import type { SwapSlotsInput } from "./schema";

export const swapSlotsForDivision = (
  port: SwapSlotsPort,
  ids: DivisionIds,
  input: SwapSlotsInput,
): Effect.Effect<DivisionSetupOutcome<{ swapped: boolean }>, DivisionError> =>
  port(ids, input);
```

- [ ] **Step 7: handler の失敗するテストを書く**

Create `src/features/division/swap-slots/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const swapSlotsInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionSetup(slug, tournamentId, divisionId),
}));
vi.mock("./repository", () => ({
  swapSlotsInDb: (ids: unknown, input: unknown) => swapSlotsInDb(ids, input),
}));

const { swapSlotsAction } = await import("./handler");

const formData = (indexA: string, indexB: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("indexA", indexA);
  data.set("indexB", indexB);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  swapSlotsInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  swapSlotsInDb.mockReturnValue(
    Effect.succeed({ found: true, value: { swapped: true } }),
  );
});

describe("swapSlotsAction", () => {
  it("認可を独立に確かめ、数値に直した添字をポートへ渡す", async () => {
    await swapSlotsAction(INITIAL_DIVISION_FORM_STATE, formData("0", "3"));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(swapSlotsInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { indexA: 0, indexB: 3 },
    );
  });

  it("成功したら再検証する", async () => {
    const state = await swapSlotsAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("0", "3"),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
  });

  it("入れ替えが起きなくてもエラーにしない", async () => {
    swapSlotsInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { swapped: false } }),
    );

    const state = await swapSlotsAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("2", "2"),
    );

    expect(state.error).toBeNull();
  });

  it("添字が不正なら入力エラーにする", async () => {
    const state = await swapSlotsAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("-1", "0"),
    );

    expect(state.error).toBe("スロットの指定が不正です");
    expect(swapSlotsInDb).not.toHaveBeenCalled();
  });

  it("部門が無ければ 404 にする", async () => {
    swapSlotsInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      swapSlotsAction(INITIAL_DIVISION_FORM_STATE, formData("0", "1")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 8: handler を実装する**

Create `src/features/division/swap-slots/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { swapSlotsInDb } from "./repository";
import { swapSlotsSchema } from "./schema";
import { swapSlotsForDivision } from "./usecase";

export const swapSlotsAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = swapSlotsSchema.safeParse({
    indexA: String(formData.get("indexA") ?? ""),
    indexB: String(formData.get("indexB") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    swapSlotsForDivision(
      swapSlotsInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  // swapped: false は「範囲外の指定」か「同じスロット」。どちらも画面上は
  // 何も起きなかったのと同じで、エラーにする必要はない。
  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null };
};
```

- [ ] **Step 9: テストが通ることを確認**

Run: `pnpm test src/features/division/swap-slots/ && pnpm typecheck`
Expected: PASS（13 tests）、型エラーなし

- [ ] **Step 10: コミット**

```bash
git add src/features/division/swap-slots
git commit -m "feat(division): add swap-slots slice"
```

---

### Task 7: エントリー追加スライス（add-entry）

Member の解決 / 作成、Participant の再利用 / 作成、entries への追加、ブラケットへの配置を
1 つのトランザクションで行う。5 スライスの中で唯一 `tx` を使う。

**Files:**
- Create: `src/features/division/add-entry/schema.ts`
- Create: `src/features/division/add-entry/repository.ts`
- Create: `src/features/division/add-entry/usecase.ts`
- Create: `src/features/division/add-entry/handler.ts`
- Test: `src/features/division/add-entry/schema.test.ts`
- Test: `src/features/division/add-entry/repository.test.ts`
- Test: `src/features/division/add-entry/handler.test.ts`
- Modify: `src/features/organization/repository.ts`（`listMembersInOrganization` を追加）
- Test: `src/features/organization/repository.test.ts`（既存に追記）

**Interfaces:**
- Consumes: `runDivisionSetup` / `DivisionIds` / `DivisionSetupOutcome` / `DivisionSetupTx`（Task 4）、`buildFromSlots` / `toSlots`（Task 1）、`placeEntry`（Task 2）、Task 3 のエラータグ
- Produces:
  - `addEntrySchema` / `type AddEntryInput = { mode: "existing"; memberId: string } | { mode: "new"; name: string; nameKana: string }`
  - `MAX_DIVISION_ENTRIES = 128`
  - `type AddEntryPort = (ids: DivisionIds, input: AddEntryInput) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>`
  - `addEntryInDb: AddEntryPort`
  - `addEntry(port: AddEntryPort, ids: DivisionIds, input: AddEntryInput): Effect.Effect<DivisionSetupOutcome<null>, DivisionError>`
  - `addEntryAction: DivisionFormAction`
  - `type MemberSummary = { id: string; name: string; nameKana: string }`
  - `listMembersInOrganization(organizationId: string): Promise<MemberSummary[]>`

- [ ] **Step 1: schema の失敗するテストを書く**

Create `src/features/division/add-entry/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addEntrySchema } from "./schema";

describe("addEntrySchema", () => {
  it("既存メンバーの選択を受け付ける", () => {
    expect(
      addEntrySchema.parse({ mode: "existing", memberId: "m1" }),
    ).toEqual({ mode: "existing", memberId: "m1" });
  });

  it("既存モードでメンバー未選択なら弾く", () => {
    const result = addEntrySchema.safeParse({ mode: "existing", memberId: "" });
    expect(result.success).toBe(false);
  });

  it("新規登録の氏名とかなを前後の空白を落として受け付ける", () => {
    expect(
      addEntrySchema.parse({
        mode: "new",
        name: "  山田太郎 ",
        nameKana: " やまだたろう ",
      }),
    ).toEqual({ mode: "new", name: "山田太郎", nameKana: "やまだたろう" });
  });

  it("空白だけの氏名を弾く", () => {
    const result = addEntrySchema.safeParse({
      mode: "new",
      name: "   ",
      nameKana: "やまだたろう",
    });
    expect(result.success).toBe(false);
  });

  it("かなが空なら弾く", () => {
    const result = addEntrySchema.safeParse({
      mode: "new",
      name: "山田太郎",
      nameKana: "",
    });
    expect(result.success).toBe(false);
  });

  it("100 文字を超える氏名を弾く", () => {
    const result = addEntrySchema.safeParse({
      mode: "new",
      name: "あ".repeat(101),
      nameKana: "あ",
    });
    expect(result.success).toBe(false);
  });

  it("未知の mode を弾く", () => {
    expect(addEntrySchema.safeParse({ mode: "other" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/division/add-entry/schema.test.ts`
Expected: FAIL（`Failed to resolve import "./schema"`）

- [ ] **Step 3: schema を実装する**

Create `src/features/division/add-entry/schema.ts`:

```ts
import { z } from "zod";

/** 部門あたりのエントリー上限。ブラケットが際限なく育つのを防ぐ。 */
export const MAX_DIVISION_ENTRIES = 128;

const trimmedName = (label: string) =>
  z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, `${label}を入力してください`)
        .max(100, `${label}は100文字以内で入力してください`),
    );

/**
 * 既存 Member を選ぶか、新しく登録するかの二択。フォームのラジオ mode が
 * どちらかを決める。discriminatedUnion にすることで、mode ごとに
 * 必要な項目だけを要求できる。
 */
export const addEntrySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    memberId: z.string().min(1, "メンバーを選択してください"),
  }),
  z.object({
    mode: z.literal("new"),
    name: trimmedName("氏名"),
    nameKana: trimmedName("氏名（かな）"),
  }),
]);

export type AddEntryInput = z.infer<typeof addEntrySchema>;
```

- [ ] **Step 4: repository の失敗するテストを書く**

Create `src/features/division/add-entry/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";

const runDivisionSetup = vi.fn();
const memberFindFirst = vi.fn();
const memberCreate = vi.fn();
const participantFindFirst = vi.fn();
const participantCreate = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (
    ids: unknown,
    mutate: (tx: unknown, current: DivisionSetup) => Promise<unknown>,
  ) => runDivisionSetup(ids, mutate),
}));

const { addEntryInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const tx = {
  member: {
    findFirst: (args: unknown) => memberFindFirst(args),
    create: (args: unknown) => memberCreate(args),
  },
  participant: {
    findFirst: (args: unknown) => participantFindFirst(args),
    create: (args: unknown) => participantCreate(args),
  },
};

const empty: DivisionSetup = {
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
};

const callMutate = async (current: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate(tx, current);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  memberFindFirst.mockReset();
  memberCreate.mockReset();
  participantFindFirst.mockReset();
  participantCreate.mockReset();
  runDivisionSetup.mockReturnValue(Effect.succeed({ found: true, value: null }));
  participantFindFirst.mockResolvedValue(null);
  participantCreate.mockResolvedValue({ id: "p1" });
});

describe("addEntryInDb", () => {
  it("既存メンバーは組織を条件に入れて引く", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    await callMutate(empty);

    expect(memberFindFirst).toHaveBeenCalledWith({
      where: { id: "m1", organizationId: "o1" },
      select: { id: true },
    });
  });

  it("組織に無いメンバーを指定したら拒否する", async () => {
    memberFindFirst.mockResolvedValue(null);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    await expect(callMutate(empty)).rejects.toMatchObject({
      _tag: "DivisionMemberNotFoundError",
    });
  });

  it("新規登録なら Member を作る", async () => {
    memberCreate.mockResolvedValue({ id: "m9" });

    await Effect.runPromise(
      addEntryInDb(ids, {
        mode: "new",
        name: "山田太郎",
        nameKana: "やまだたろう",
      }),
    );
    await callMutate(empty);

    expect(memberCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "o1",
        name: "山田太郎",
        nameKana: "やまだたろう",
      },
      select: { id: true },
    });
  });

  it("Participant が無ければ seed を付けずに作る", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    await callMutate(empty);

    // Participant.seed は @@unique([tournamentId, seed]) を持つ。自動採番すると
    // 衝突するので null のままにし、部門内の順序は DivisionEntry.seed が持つ。
    expect(participantCreate).toHaveBeenCalledWith({
      data: { tournamentId: "t1", memberId: "m1" },
      select: { id: true },
    });
  });

  it("Participant が既にあれば作らず使い回す", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue({ id: "p7" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    const { next } = await callMutate(empty);

    expect(participantCreate).not.toHaveBeenCalled();
    expect(next.entries.entries[0].participantId).toBe("p7");
  });

  it("エントリーを末尾の seed で足す", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantCreate.mockResolvedValue({ id: "p3" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    const { next } = await callMutate({
      ...empty,
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
    });

    expect(next.entries.entries).toHaveLength(3);
    expect(next.entries.entries[2].seed).toBe(2);
    expect(next.entries.entries[2].participantId).toBe("p3");
  });

  it("組み合わせがあれば一番下の bye を埋める", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantCreate.mockResolvedValue({ id: "p3" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    const { next } = await callMutate({
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: buildFromSlots([
        { kind: "entry", entryId: "e1" },
        { kind: "bye" },
        { kind: "entry", entryId: "e2" },
        { kind: "bye" },
      ]),
    });

    const added = next.entries.entries[2].id;
    expect(next.matchingConfig.matches[1].slots[1]).toEqual({
      kind: "entry",
      entryId: added,
    });
  });

  it("組み合わせが未作成なら組み合わせは空のまま", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    const { next } = await callMutate(empty);

    expect(next.matchingConfig.matches).toEqual([]);
  });

  it("同じ参加者の二重エントリーを拒否する", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue({ id: "p1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    await expect(
      callMutate({
        ...empty,
        entries: {
          version: 1,
          entries: [{ id: "e1", participantId: "p1", seed: 0 }],
        },
      }),
    ).rejects.toMatchObject({ _tag: "DivisionDuplicateEntryError" });
  });

  it("上限に達していたら拒否する", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    await expect(
      callMutate({
        ...empty,
        entries: {
          version: 1,
          entries: Array.from({ length: 128 }, (_, index) => ({
            id: `e${index}`,
            participantId: `p${index}`,
            seed: index,
          })),
        },
      }),
    ).rejects.toMatchObject({ _tag: "DivisionEntryLimitError" });
  });
});
```

- [ ] **Step 5: テストが失敗することを確認**

Run: `pnpm test src/features/division/add-entry/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 6: repository と usecase を実装する**

Create `src/features/division/add-entry/repository.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import {
  DivisionDuplicateEntryError,
  type DivisionError,
  DivisionEntryLimitError,
  DivisionMemberNotFoundError,
} from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  type DivisionSetupTx,
  runDivisionSetup,
} from "../setup-store";
import { buildFromSlots, toSlots } from "../single-elimination/build";
import { placeEntry } from "../single-elimination/edit";
import { type AddEntryInput, MAX_DIVISION_ENTRIES } from "./schema";

export type AddEntryPort = (
  ids: DivisionIds,
  input: AddEntryInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/**
 * Member を決める。既存を選んだ場合は組織を where に入れて確かめる。
 * 取ってから所属を検証する形にすると、検証の書き忘れがそのまま穴になる。
 */
const resolveMemberId = async (
  tx: DivisionSetupTx,
  organizationId: string,
  input: AddEntryInput,
): Promise<string> => {
  if (input.mode === "new") {
    const created = await tx.member.create({
      data: {
        organizationId,
        name: input.name,
        nameKana: input.nameKana,
      },
      select: { id: true },
    });
    return created.id;
  }

  const member = await tx.member.findFirst({
    where: { id: input.memberId, organizationId },
    select: { id: true },
  });
  if (!member) {
    throw new DivisionMemberNotFoundError({ memberId: input.memberId });
  }
  return member.id;
};

/**
 * この大会の Participant を用意する。同じ人が複数の部門に出ることがあるので、
 * 既にあれば使い回す。seed は付けない（@@unique([tournamentId, seed]) と衝突するため。
 * Postgres は NULL の重複を許すので null なら安全）。
 */
const resolveParticipantId = async (
  tx: DivisionSetupTx,
  tournamentId: string,
  memberId: string,
): Promise<string> => {
  const existing = await tx.participant.findFirst({
    where: { tournamentId, memberId },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const created = await tx.participant.create({
    data: { tournamentId, memberId },
    select: { id: true },
  });
  return created.id;
};

export const addEntryInDb: AddEntryPort = (ids, input) =>
  runDivisionSetup(ids, async (tx, current) => {
    if (current.entries.entries.length >= MAX_DIVISION_ENTRIES) {
      throw new DivisionEntryLimitError({ divisionId: ids.divisionId });
    }

    const memberId = await resolveMemberId(tx, ids.organizationId, input);
    const participantId = await resolveParticipantId(
      tx,
      ids.tournamentId,
      memberId,
    );

    if (
      current.entries.entries.some(
        (entry) => entry.participantId === participantId,
      )
    ) {
      throw new DivisionDuplicateEntryError({ divisionId: ids.divisionId });
    }

    const maxSeed = current.entries.entries.reduce(
      (max, entry) => Math.max(max, entry.seed),
      -1,
    );
    const added = { id: randomUUID(), participantId, seed: maxSeed + 1 };

    const entries: DivisionEntries = {
      version: 1,
      entries: [...current.entries.entries, added],
    };

    // 組み合わせが未作成なら toSlots が空を返し、placeEntry も空のままになる。
    const matchingConfig = buildFromSlots(
      placeEntry(toSlots(current.matchingConfig), added.id),
    );

    return { next: { entries, matchingConfig }, value: null };
  });
```

Create `src/features/division/add-entry/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { AddEntryPort } from "./repository";
import type { AddEntryInput } from "./schema";

export const addEntry = (
  port: AddEntryPort,
  ids: DivisionIds,
  input: AddEntryInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
```

- [ ] **Step 7: handler の失敗するテストを書く**

Create `src/features/division/add-entry/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DivisionDuplicateEntryError } from "../errors";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const addEntryInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionSetup(slug, tournamentId, divisionId),
}));
vi.mock("./repository", () => ({
  addEntryInDb: (ids: unknown, input: unknown) => addEntryInDb(ids, input),
}));

const { addEntryAction } = await import("./handler");

const formData = (fields: Record<string, string>) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  addEntryInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  addEntryInDb.mockReturnValue(Effect.succeed({ found: true, value: null }));
});

describe("addEntryAction", () => {
  it("既存メンバーの選択をポートへ渡す", async () => {
    await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "existing", memberId: "m1" }),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(addEntryInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { mode: "existing", memberId: "m1" },
    );
  });

  it("新規登録の入力をポートへ渡す", async () => {
    await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "new", name: "山田太郎", nameKana: "やまだたろう" }),
    );

    expect(addEntryInDb).toHaveBeenCalledWith(expect.anything(), {
      mode: "new",
      name: "山田太郎",
      nameKana: "やまだたろう",
    });
  });

  it("成功したら再検証して通知を返す", async () => {
    const state = await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "existing", memberId: "m1" }),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
    expect(state.notice).toBe("エントリーを追加しました");
  });

  it("入力が不正ならポートを呼ばない", async () => {
    const state = await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "new", name: "  ", nameKana: "やまだ" }),
    );

    expect(state.error).toBe("氏名を入力してください");
    expect(addEntryInDb).not.toHaveBeenCalled();
  });

  it("二重エントリーは文言にして返す", async () => {
    addEntryInDb.mockReturnValue(
      Effect.fail(new DivisionDuplicateEntryError({ divisionId: "d1" })),
    );

    const state = await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "existing", memberId: "m1" }),
    );

    expect(state.error).toBe("その参加者はすでにエントリーしています");
  });

  it("部門が無ければ 404 にする", async () => {
    addEntryInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      addEntryAction(
        INITIAL_DIVISION_FORM_STATE,
        formData({ mode: "existing", memberId: "m1" }),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 8: handler を実装する**

Create `src/features/division/add-entry/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { addEntryInDb } from "./repository";
import { addEntrySchema } from "./schema";
import { addEntry } from "./usecase";

export const addEntryAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  // mode に応じて要る項目が変わるので、両方の項目をそのまま渡して
  // discriminatedUnion に選ばせる。
  const parsed = addEntrySchema.safeParse({
    mode: String(formData.get("mode") ?? ""),
    memberId: String(formData.get("memberId") ?? ""),
    name: String(formData.get("name") ?? ""),
    nameKana: String(formData.get("nameKana") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    addEntry(
      addEntryInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null, notice: "エントリーを追加しました" };
};
```

- [ ] **Step 9: メンバー一覧の取得を足す**

`src/features/organization/repository.ts` の末尾に足す:

```ts
export type MemberSummary = {
  id: string;
  name: string;
  nameKana: string;
};

/**
 * 組織のメンバーを読み順で返す。エントリー追加の選択肢に使う。
 * Member は組織スコープなので、organizationId が絞り込みの境界そのものになる。
 */
export const listMembersInOrganization = (
  organizationId: string,
): Promise<MemberSummary[]> =>
  prisma.member.findMany({
    where: { organizationId },
    orderBy: { nameKana: "asc" },
    select: { id: true, name: true, nameKana: true },
  });
```

`src/features/organization/repository.test.ts` に追記（既存のモックの形に合わせ、
`member.findMany` のモックを足したうえで）:

```ts
describe("listMembersInOrganization", () => {
  it("組織を条件に入れて読み順で引く", async () => {
    memberFindMany.mockResolvedValue([]);

    await listMembersInOrganization("o1");

    expect(memberFindMany).toHaveBeenCalledWith({
      where: { organizationId: "o1" },
      orderBy: { nameKana: "asc" },
      select: { id: true, name: true, nameKana: true },
    });
  });
});
```

- [ ] **Step 10: テストが通ることを確認**

Run: `pnpm test src/features/division/add-entry/ src/features/organization/ && pnpm typecheck`
Expected: 全て PASS、型エラーなし

- [ ] **Step 11: コミット**

```bash
git add src/features/division/add-entry src/features/organization
git commit -m "feat(division): add add-entry slice with member and participant creation"
```

---

### Task 8: エントリー削除スライス（remove-entry）

削除は追加と非対称で、組み合わせを丸ごと再生成する。穴が空いたまま残るより、
作り直した方が結果が読みやすいため。再生成した旨は画面へ通知として返す。

**Files:**
- Create: `src/features/division/remove-entry/schema.ts`
- Create: `src/features/division/remove-entry/repository.ts`
- Create: `src/features/division/remove-entry/usecase.ts`
- Create: `src/features/division/remove-entry/handler.ts`
- Test: `src/features/division/remove-entry/repository.test.ts`
- Test: `src/features/division/remove-entry/handler.test.ts`

**Interfaces:**
- Consumes: `runDivisionSetup` / `DivisionIds` / `DivisionSetupOutcome`（Task 4）、`buildFromSlots`（Task 1）、`generateSlots`（Task 2）、`revalidateDivisionSetup`（Task 3）
- Produces:
  - `removeEntrySchema` / `type RemoveEntryInput = { entryId: string }`
  - `type RemoveEntryPort = (ids: DivisionIds, input: RemoveEntryInput) => Effect.Effect<DivisionSetupOutcome<{ regenerated: boolean }>, DivisionError>`
  - `removeEntryInDb: RemoveEntryPort`
  - `removeEntry(port: RemoveEntryPort, ids: DivisionIds, input: RemoveEntryInput): Effect.Effect<DivisionSetupOutcome<{ regenerated: boolean }>, DivisionError>`
  - `removeEntryAction: DivisionFormAction`

- [ ] **Step 1: repository の失敗するテストを書く**

Create `src/features/division/remove-entry/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";

const runDivisionSetup = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (
    ids: unknown,
    mutate: (tx: unknown, current: DivisionSetup) => Promise<unknown>,
  ) => runDivisionSetup(ids, mutate),
}));

const { removeEntryInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const entry = (id: string) => ({ kind: "entry" as const, entryId: id });

const withEntries = (count: number): DivisionSetup["entries"] => ({
  version: 1,
  entries: Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  })),
});

const callMutate = async (current: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate({}, current);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  runDivisionSetup.mockReturnValue(
    Effect.succeed({ found: true, value: { regenerated: false } }),
  );
});

describe("removeEntryInDb", () => {
  it("エントリーを外して seed を 0 から詰め直す", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "e2" }));
    const { next } = await callMutate({
      entries: withEntries(4),
      matchingConfig: { version: 1, matches: [] },
    });

    expect(next.entries.entries.map((item) => item.id)).toEqual([
      "e1",
      "e3",
      "e4",
    ]);
    expect(next.entries.entries.map((item) => item.seed)).toEqual([0, 1, 2]);
  });

  it("組み合わせがあれば残りのシード順から作り直す", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "e2" }));
    const { next, value } = await callMutate({
      entries: withEntries(4),
      matchingConfig: buildFromSlots(
        ["e1", "e2", "e3", "e4"].map(entry),
      ),
    });

    expect(value).toEqual({ regenerated: true });
    // 残り 3 人なので 4 枠に bye が 1 つ入る形へ作り直される。
    expect(next.matchingConfig.matches[0].slots).toEqual([
      entry("e1"),
      { kind: "bye" },
    ]);
  });

  it("残りが 2 人未満になったら組み合わせを空にする", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "e2" }));
    const { next } = await callMutate({
      entries: withEntries(2),
      matchingConfig: buildFromSlots(["e1", "e2"].map(entry)),
    });

    expect(next.matchingConfig.matches).toEqual([]);
  });

  it("組み合わせが未作成なら再生成しない", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "e2" }));
    const { value } = await callMutate({
      entries: withEntries(4),
      matchingConfig: { version: 1, matches: [] },
    });

    expect(value).toEqual({ regenerated: false });
  });

  it("知らない entryId なら何も書き込まない", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "unknown" }));
    const { next, value } = await callMutate({
      entries: withEntries(4),
      matchingConfig: { version: 1, matches: [] },
    });

    // 存在を漏らさないため、無い対象の削除はエラーにせず黙って何もしない。
    expect(next).toBeNull();
    expect(value).toEqual({ regenerated: false });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/division/remove-entry/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 3: schema / repository / usecase を実装する**

Create `src/features/division/remove-entry/schema.ts`:

```ts
import { z } from "zod";

export const removeEntrySchema = z.object({
  entryId: z.string().min(1, "エントリーの指定が不正です"),
});

export type RemoveEntryInput = z.infer<typeof removeEntrySchema>;
```

Create `src/features/division/remove-entry/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";
import { generateSlots } from "../single-elimination/edit";
import type { RemoveEntryInput } from "./schema";

export type RemoveEntryPort = (
  ids: DivisionIds,
  input: RemoveEntryInput,
) => Effect.Effect<
  DivisionSetupOutcome<{ regenerated: boolean }>,
  DivisionError
>;

export const removeEntryInDb: RemoveEntryPort = (ids, input) =>
  runDivisionSetup(ids, async (_tx, current) => {
    const remaining = current.entries.entries.filter(
      (entry) => entry.id !== input.entryId,
    );

    // 減っていなければ対象が無かったということ。存在を漏らさないため
    // エラーにせず、何も起きなかったものとして返す。
    if (remaining.length === current.entries.entries.length) {
      return { next: null, value: { regenerated: false } };
    }

    const entries: DivisionEntries = {
      version: 1,
      entries: [...remaining]
        .sort((left, right) => left.seed - right.seed)
        .map((entry, index) => ({ ...entry, seed: index })),
    };

    // 穴を bye として残すより、シード順から作り直した方が結果が読みやすい。
    // 手動で入れ替えた配置はここで失われるので、画面には再生成した旨を出す。
    const regenerated = current.matchingConfig.matches.length > 0;
    const matchingConfig = regenerated
      ? buildFromSlots(generateSlots(entries.entries))
      : current.matchingConfig;

    return { next: { entries, matchingConfig }, value: { regenerated } };
  });
```

Create `src/features/division/remove-entry/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { RemoveEntryPort } from "./repository";
import type { RemoveEntryInput } from "./schema";

export const removeEntry = (
  port: RemoveEntryPort,
  ids: DivisionIds,
  input: RemoveEntryInput,
): Effect.Effect<
  DivisionSetupOutcome<{ regenerated: boolean }>,
  DivisionError
> => port(ids, input);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test src/features/division/remove-entry/repository.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: handler の失敗するテストを書く**

Create `src/features/division/remove-entry/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const removeEntryInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionSetup(slug, tournamentId, divisionId),
}));
vi.mock("./repository", () => ({
  removeEntryInDb: (ids: unknown, input: unknown) =>
    removeEntryInDb(ids, input),
}));

const { removeEntryAction } = await import("./handler");

const formData = (entryId: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("entryId", entryId);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  removeEntryInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  removeEntryInDb.mockReturnValue(
    Effect.succeed({ found: true, value: { regenerated: false } }),
  );
});

describe("removeEntryAction", () => {
  it("認可を独立に確かめ、entryId をポートへ渡す", async () => {
    await removeEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e1"));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(removeEntryInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { entryId: "e1" },
    );
  });

  it("再生成が起きたら通知を返す", async () => {
    removeEntryInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { regenerated: true } }),
    );

    const state = await removeEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1"),
    );

    expect(state.error).toBeNull();
    expect(state.notice).toBe(
      "エントリーを削除し、組み合わせを再生成しました",
    );
  });

  it("再生成が起きなければ削除だけを伝える", async () => {
    const state = await removeEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1"),
    );

    expect(state.notice).toBe("エントリーを削除しました");
  });

  it("成功したら再検証する", async () => {
    await removeEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e1"));

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
  });

  it("entryId が空ならポートを呼ばない", async () => {
    const state = await removeEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData(""),
    );

    expect(state.error).toBe("エントリーの指定が不正です");
    expect(removeEntryInDb).not.toHaveBeenCalled();
  });

  it("部門が無ければ 404 にする", async () => {
    removeEntryInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      removeEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e1")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 6: handler を実装する**

Create `src/features/division/remove-entry/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { removeEntryInDb } from "./repository";
import { removeEntrySchema } from "./schema";
import { removeEntry } from "./usecase";

export const removeEntryAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = removeEntrySchema.safeParse({
    entryId: String(formData.get("entryId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    removeEntry(
      removeEntryInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateDivisionSetup(slug, tournamentId, divisionId);
  // 手動で入れ替えた配置が消えるのは驚きになりうるので、起きたことを明示する。
  return {
    error: null,
    notice: exit.value.value.regenerated
      ? "エントリーを削除し、組み合わせを再生成しました"
      : "エントリーを削除しました",
  };
};
```

- [ ] **Step 7: テストが通ることを確認**

Run: `pnpm test src/features/division/remove-entry/ && pnpm typecheck`
Expected: PASS（11 tests）、型エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/features/division/remove-entry
git commit -m "feat(division): add remove-entry slice with bracket regeneration"
```

---

### Task 9: エントリー並べ替えスライス（reorder-entry）

シード順だけを入れ替える。組み合わせは変えない（スロットは `entryId` を直接持つので
`seed` の変更で壊れない）。反映したければ「生成」を押す、という関係にする。

**Files:**
- Create: `src/features/division/reorder-entry/domain.ts`
- Create: `src/features/division/reorder-entry/schema.ts`
- Create: `src/features/division/reorder-entry/repository.ts`
- Create: `src/features/division/reorder-entry/usecase.ts`
- Create: `src/features/division/reorder-entry/handler.ts`
- Test: `src/features/division/reorder-entry/domain.test.ts`
- Test: `src/features/division/reorder-entry/repository.test.ts`
- Test: `src/features/division/reorder-entry/handler.test.ts`

**Interfaces:**
- Consumes: `runDivisionSetup` / `DivisionIds` / `DivisionSetupOutcome`（Task 4）、`revalidateDivisionSetup`（Task 3）、`DivisionEntry`（`@/lib/division/types`）
- Produces:
  - `type ReorderEntryDirection = "up" | "down"`
  - `reorderEntries(entries: DivisionEntry[], entryId: string, direction: ReorderEntryDirection): DivisionEntry[] | null`
  - `reorderEntrySchema` / `type ReorderEntryInput = { entryId: string; direction: ReorderEntryDirection }`
  - `type ReorderEntryPort = (ids: DivisionIds, input: ReorderEntryInput) => Effect.Effect<DivisionSetupOutcome<{ moved: boolean }>, DivisionError>`
  - `reorderEntryInDb: ReorderEntryPort`
  - `reorderEntry(port: ReorderEntryPort, ids: DivisionIds, input: ReorderEntryInput): Effect.Effect<DivisionSetupOutcome<{ moved: boolean }>, DivisionError>`
  - `reorderEntryAction: DivisionFormAction`

- [ ] **Step 1: domain の失敗するテストを書く**

Create `src/features/division/reorder-entry/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntry } from "@/lib/division/types";
import { reorderEntries } from "./domain";

const entries: DivisionEntry[] = [
  { id: "e1", participantId: "p1", seed: 0 },
  { id: "e2", participantId: "p2", seed: 1 },
  { id: "e3", participantId: "p3", seed: 2 },
];

describe("reorderEntries", () => {
  it("上へ 1 つ動かす", () => {
    const result = reorderEntries(entries, "e2", "up");
    expect(result?.map((entry) => entry.id)).toEqual(["e2", "e1", "e3"]);
  });

  it("下へ 1 つ動かす", () => {
    const result = reorderEntries(entries, "e2", "down");
    expect(result?.map((entry) => entry.id)).toEqual(["e1", "e3", "e2"]);
  });

  it("seed を 0 から振り直す", () => {
    const result = reorderEntries(entries, "e3", "up");
    expect(result?.map((entry) => entry.seed)).toEqual([0, 1, 2]);
  });

  it("元の配列を書き換えない", () => {
    reorderEntries(entries, "e2", "up");
    expect(entries.map((entry) => entry.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("先頭を上へ動かそうとしたら null", () => {
    expect(reorderEntries(entries, "e1", "up")).toBeNull();
  });

  it("末尾を下へ動かそうとしたら null", () => {
    expect(reorderEntries(entries, "e3", "down")).toBeNull();
  });

  it("知らない id なら null", () => {
    expect(reorderEntries(entries, "unknown", "up")).toBeNull();
  });

  it("seed が飛んでいても並び順で判断する", () => {
    // 削除の詰め直しに失敗したデータが来ても、順序だけを見て動かせる。
    const sparse: DivisionEntry[] = [
      { id: "a", participantId: "p1", seed: 5 },
      { id: "b", participantId: "p2", seed: 9 },
    ];
    const result = reorderEntries(sparse, "b", "up");
    expect(result).toEqual([
      { id: "b", participantId: "p2", seed: 0 },
      { id: "a", participantId: "p1", seed: 1 },
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/division/reorder-entry/domain.test.ts`
Expected: FAIL（`Failed to resolve import "./domain"`）

- [ ] **Step 3: domain と schema を実装する**

Create `src/features/division/reorder-entry/domain.ts`:

```ts
import type { DivisionEntry } from "@/lib/division/types";

export type ReorderEntryDirection = "up" | "down";

/**
 * 隣のエントリーと入れ替えて seed を 0 から振り直す。
 * 端まで来ている / 対象が無い場合は null を返し、呼び出し側が
 * 「何も起きなかった」として扱えるようにする。
 *
 * 部門の並べ替え（features/division/reorder）と違って order の unique 制約が無いため、
 * 退避値を使う必要はなく、配列の入れ替えで済む。
 */
export const reorderEntries = (
  entries: DivisionEntry[],
  entryId: string,
  direction: ReorderEntryDirection,
): DivisionEntry[] | null => {
  const sorted = [...entries].sort((left, right) => left.seed - right.seed);
  const index = sorted.findIndex((entry) => entry.id === entryId);
  if (index === -1) {
    return null;
  }

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= sorted.length) {
    return null;
  }

  const next = [...sorted];
  next[index] = sorted[target];
  next[target] = sorted[index];

  return next.map((entry, seed) => ({ ...entry, seed }));
};
```

Create `src/features/division/reorder-entry/schema.ts`:

```ts
import { z } from "zod";

export const reorderEntrySchema = z.object({
  entryId: z.string().min(1, "エントリーの指定が不正です"),
  direction: z.enum(["up", "down"], { error: "並べ替えの向きが不正です" }),
});

export type ReorderEntryInput = z.infer<typeof reorderEntrySchema>;
```

- [ ] **Step 4: repository の失敗するテストを書く**

Create `src/features/division/reorder-entry/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";

const runDivisionSetup = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (
    ids: unknown,
    mutate: (tx: unknown, current: DivisionSetup) => Promise<unknown>,
  ) => runDivisionSetup(ids, mutate),
}));

const { reorderEntryInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const current: DivisionSetup = {
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: buildFromSlots([
    { kind: "entry", entryId: "e1" },
    { kind: "entry", entryId: "e2" },
  ]),
};

const callMutate = async (setup: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate({}, setup);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  runDivisionSetup.mockReturnValue(
    Effect.succeed({ found: true, value: { moved: true } }),
  );
});

describe("reorderEntryInDb", () => {
  it("シード順を入れ替える", async () => {
    await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );
    const { next, value } = await callMutate(current);

    expect(value).toEqual({ moved: true });
    expect(next.entries.entries.map((entry) => entry.id)).toEqual(["e2", "e1"]);
  });

  it("組み合わせには手を触れない", async () => {
    await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );
    const { next } = await callMutate(current);

    // スロットは entryId を直接持つので、seed を変えても壊れない。
    expect(next.matchingConfig).toBe(current.matchingConfig);
  });

  it("端まで来ていたら書き込まない", async () => {
    await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e1", direction: "up" }),
    );
    const { next, value } = await callMutate(current);

    expect(next).toBeNull();
    expect(value).toEqual({ moved: false });
  });
});
```

- [ ] **Step 5: repository と usecase を実装する**

Create `src/features/division/reorder-entry/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { reorderEntries } from "./domain";
import type { ReorderEntryInput } from "./schema";

export type ReorderEntryPort = (
  ids: DivisionIds,
  input: ReorderEntryInput,
) => Effect.Effect<DivisionSetupOutcome<{ moved: boolean }>, DivisionError>;

export const reorderEntryInDb: ReorderEntryPort = (ids, input) =>
  runDivisionSetup(ids, async (_tx, current) => {
    const reordered = reorderEntries(
      current.entries.entries,
      input.entryId,
      input.direction,
    );

    // null は「端まで来ている」か「その対象が無い」。どちらも画面上は
    // 何も起きなかったのと同じで、応答を区別させない。
    if (reordered === null) {
      return { next: null, value: { moved: false } };
    }

    const entries: DivisionEntries = { version: 1, entries: reordered };

    return {
      // 組み合わせは触らない。シード順の変更を反映したければ「生成」を押す。
      next: { entries, matchingConfig: current.matchingConfig },
      value: { moved: true },
    };
  });
```

Create `src/features/division/reorder-entry/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { ReorderEntryPort } from "./repository";
import type { ReorderEntryInput } from "./schema";

export const reorderEntry = (
  port: ReorderEntryPort,
  ids: DivisionIds,
  input: ReorderEntryInput,
): Effect.Effect<DivisionSetupOutcome<{ moved: boolean }>, DivisionError> =>
  port(ids, input);
```

- [ ] **Step 6: handler の失敗するテストを書く**

Create `src/features/division/reorder-entry/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const reorderEntryInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionSetup(slug, tournamentId, divisionId),
}));
vi.mock("./repository", () => ({
  reorderEntryInDb: (ids: unknown, input: unknown) =>
    reorderEntryInDb(ids, input),
}));

const { reorderEntryAction } = await import("./handler");

const formData = (entryId: string, direction: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("entryId", entryId);
  data.set("direction", direction);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  reorderEntryInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  reorderEntryInDb.mockReturnValue(
    Effect.succeed({ found: true, value: { moved: true } }),
  );
});

describe("reorderEntryAction", () => {
  it("認可を独立に確かめ、入力をポートへ渡す", async () => {
    await reorderEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e2", "up"));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(reorderEntryInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { entryId: "e2", direction: "up" },
    );
  });

  it("成功したら再検証する", async () => {
    const state = await reorderEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e2", "up"),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
  });

  it("端まで来ていてもエラーにしない", async () => {
    reorderEntryInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { moved: false } }),
    );

    const state = await reorderEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1", "up"),
    );

    expect(state.error).toBeNull();
  });

  it("向きが不正ならポートを呼ばない", async () => {
    const state = await reorderEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData("e1", "sideways"),
    );

    expect(state.error).toBe("並べ替えの向きが不正です");
    expect(reorderEntryInDb).not.toHaveBeenCalled();
  });

  it("部門が無ければ 404 にする", async () => {
    reorderEntryInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      reorderEntryAction(INITIAL_DIVISION_FORM_STATE, formData("e1", "up")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 7: handler を実装する**

Create `src/features/division/reorder-entry/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { reorderEntryInDb } from "./repository";
import { reorderEntrySchema } from "./schema";
import { reorderEntry } from "./usecase";

export const reorderEntryAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = reorderEntrySchema.safeParse({
    entryId: String(formData.get("entryId") ?? ""),
    direction: String(formData.get("direction") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    reorderEntry(
      reorderEntryInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  // moved: false は「端まで来ている」。エラーにする必要はない。
  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null };
};
```

- [ ] **Step 8: テストが通ることを確認**

Run: `pnpm test src/features/division/ && pnpm typecheck && pnpm lint`
Expected: 全て PASS、型エラー・lint エラーなし

- [ ] **Step 9: コミット**

```bash
git add src/features/division/reorder-entry
git commit -m "feat(division): add reorder-entry slice"
```

---

### Task 10: 表示用の変換（view.ts）と参加者のかな

保存済みの木を「1 回戦のカード一覧」に変換する。スロットの添字は
`swap-slots` が受け取る添字と同じものでなければならないので、
`toSlots` と同じ並べ方をここで使う。

**Files:**
- Create: `src/features/division/single-elimination/view.ts`
- Test: `src/features/division/single-elimination/view.test.ts`
- Modify: `src/features/division/repository.ts`（`DivisionParticipant` に `nameKana` を足す）

**Interfaces:**
- Consumes: `toSlots`（Task 1）、`DivisionEntries` / `MatchingConfig`（`@/lib/division/types`）
- Produces:
  - `type SetupSlotView = { index: number; label: string | null }`（`label: null` は bye）
  - `type SetupMatchView = { matchId: string; slots: [SetupSlotView, SetupSlotView] }`
  - `toSetupView(config: MatchingConfig, entries: DivisionEntries, participants: { id: string; name: string }[]): SetupMatchView[]`
  - `DivisionParticipant` に `nameKana: string` が加わる

- [ ] **Step 1: 失敗するテストを書く**

Create `src/features/division/single-elimination/view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntries } from "@/lib/division/types";
import { buildFromSlots } from "./build";
import { toSetupView } from "./view";

const entries: DivisionEntries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
  ],
};

const participants = [
  { id: "p1", name: "山田太郎" },
  { id: "p2", name: "佐藤花子" },
  { id: "p3", name: "鈴木一郎" },
];

const config = buildFromSlots([
  { kind: "entry", entryId: "e1" },
  { kind: "bye" },
  { kind: "entry", entryId: "e2" },
  { kind: "entry", entryId: "e3" },
]);

describe("toSetupView", () => {
  it("1 回戦のカードだけを返す", () => {
    const view = toSetupView(config, entries, participants);
    expect(view).toHaveLength(2);
    expect(view.map((match) => match.matchId)).toEqual(["m1-0", "m1-1"]);
  });

  it("スロットの添字は通し番号で振る", () => {
    // swap-slots が受け取る添字と一致していないと、別の人が入れ替わってしまう。
    const view = toSetupView(config, entries, participants);
    expect(view[0].slots.map((slot) => slot.index)).toEqual([0, 1]);
    expect(view[1].slots.map((slot) => slot.index)).toEqual([2, 3]);
  });

  it("エントリー経由で参加者の氏名を引く", () => {
    const view = toSetupView(config, entries, participants);
    expect(view[0].slots[0].label).toBe("山田太郎");
    expect(view[1].slots[1].label).toBe("鈴木一郎");
  });

  it("bye は label が null", () => {
    const view = toSetupView(config, entries, participants);
    expect(view[0].slots[1].label).toBeNull();
  });

  it("参加者が引けないスロットは label が null", () => {
    // 参加者一覧が古いなど、突き合わせに失敗しても画面を落とさない。
    const view = toSetupView(config, entries, []);
    expect(view[0].slots[0].label).toBeNull();
  });

  it("組み合わせが未作成なら空配列", () => {
    expect(toSetupView({ version: 1, matches: [] }, entries, participants)).toEqual(
      [],
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/division/single-elimination/view.test.ts`
Expected: FAIL（`Failed to resolve import "./view"`）

- [ ] **Step 3: 実装を書く**

Create `src/features/division/single-elimination/view.ts`:

```ts
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
import { toSlots } from "./build";

/** label が null なら bye、または名前を引けなかったスロット。 */
export type SetupSlotView = {
  /** 1 回戦のスロット配列における通し番号。swap-slots に渡す添字と同じ。 */
  index: number;
  label: string | null;
};

export type SetupMatchView = {
  matchId: string;
  slots: [SetupSlotView, SetupSlotView];
};

/**
 * 保存済みの木を 1 回戦のカード一覧へ変換する。
 * 添字は toSlots と同じ並べ方で振るため、画面から送った添字が
 * そのままサーバ側の配列添字として通じる。
 *
 * 名前を引けなかったスロットは null にして画面を落とさない。
 * 参加者一覧が古いなど、突き合わせに失敗しても編集は続けられる方がよい。
 */
export const toSetupView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): SetupMatchView[] => {
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const nameByEntryId = new Map(
    entries.entries.map((entry) => [
      entry.id,
      participantById.get(entry.participantId) ?? null,
    ]),
  );

  const slots = toSlots(config);
  const matches: SetupMatchView[] = [];

  for (let order = 0; order * 2 + 1 < slots.length; order += 1) {
    const toView = (index: number): SetupSlotView => {
      const slot = slots[index];
      return {
        index,
        label:
          slot.kind === "entry"
            ? (nameByEntryId.get(slot.entryId) ?? null)
            : null,
      };
    };

    matches.push({
      matchId: `m1-${order}`,
      slots: [toView(order * 2), toView(order * 2 + 1)],
    });
  }

  return matches;
};
```

- [ ] **Step 4: 参加者にかなを足す**

`src/features/division/repository.ts` の `DivisionParticipant` に `nameKana` を足す:

```ts
/** ブラケット描画とエントリー一覧に渡す参加者。表示名は Member から解決済み。 */
export type DivisionParticipant = {
  id: string;
  name: string;
  nameKana: string;
  team?: string;
};
```

`listParticipantsInTournament` の `select` と戻り値を直す:

```ts
  const rows = await prisma.participant.findMany({
    where: { tournament: { id: tournamentId, organizationId } },
    select: {
      id: true,
      team: true,
      member: { select: { name: true, nameKana: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.member.name,
    nameKana: row.member.nameKana,
    // bracket 側の Participant.team は省略可能なプロパティ。null は運ばない。
    team: row.team ?? undefined,
  }));
```

`features/bracket` の `DivisionSourceParticipant` は `{ id, name, team? }` なので、
`nameKana` が増えても構造的に代入できる。既存のブラケット描画に変更は要らない。

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm test src/features/division/ src/features/bracket/ && pnpm typecheck`
Expected: 全て PASS、型エラーなし

既存の `repository.test.ts` が `select` の形を検証している場合は、`nameKana` を含む形へ直す。

- [ ] **Step 6: コミット**

```bash
git add src/features/division/single-elimination/view.ts src/features/division/single-elimination/view.test.ts src/features/division/repository.ts src/features/division/repository.test.ts
git commit -m "feat(division): add setup view mapping and participant name kana"
```

---

### Task 11: エントリー一覧のコンポーネント

**Files:**
- Create: `src/components/division/AddEntryForm.tsx`
- Create: `src/components/division/EntryRowActions.tsx`
- Create: `src/components/division/EntryList.tsx`
- Test: `src/components/division/AddEntryForm.test.tsx`
- Test: `src/components/division/EntryList.test.tsx`

**Interfaces:**
- Consumes: `DivisionFormAction` / `INITIAL_DIVISION_FORM_STATE`（`@/features/division/state`）、`MemberSummary`（`@/features/organization/repository`）、`DivisionParticipant`（`@/features/division/repository`）、`DivisionEntry`（`@/lib/division/types`）
- Produces:
  - `AddEntryForm({ action, slug, tournamentId, divisionId, members, disabled })`
  - `EntryRowActions({ reorderAction, removeAction, slug, tournamentId, divisionId, entryId, canMoveUp, canMoveDown, disabled })`
  - `EntryList({ entries, participants, slug, tournamentId, divisionId, reorderAction, removeAction, disabled })`
    - `entries` は seed 昇順で渡す

- [ ] **Step 1: AddEntryForm の失敗するテストを書く**

Create `src/components/division/AddEntryForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddEntryForm } from "./AddEntryForm";

const members = [
  { id: "m1", name: "山田太郎", nameKana: "やまだたろう" },
  { id: "m2", name: "佐藤花子", nameKana: "さとうはなこ" },
];

const props = {
  action: vi.fn(async () => ({ error: null })),
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  members,
  disabled: false,
};

describe("AddEntryForm", () => {
  it("既存メンバーの選択を初期表示にする", () => {
    render(<AddEntryForm {...props} />);

    expect(screen.getByLabelText("既存のメンバーから選ぶ")).toBeChecked();
    expect(screen.getByLabelText("メンバー")).toBeInTheDocument();
    expect(screen.queryByLabelText("氏名")).not.toBeInTheDocument();
  });

  it("メンバーを選択肢として並べる", () => {
    render(<AddEntryForm {...props} />);

    expect(
      screen.getByRole("option", { name: "山田太郎" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "佐藤花子" }),
    ).toBeInTheDocument();
  });

  it("新規登録へ切り替えると氏名とかなの入力が出る", async () => {
    const user = userEvent.setup();
    render(<AddEntryForm {...props} />);

    await user.click(screen.getByLabelText("新しく登録する"));

    expect(screen.getByLabelText("氏名")).toBeInTheDocument();
    expect(screen.getByLabelText("氏名（かな）")).toBeInTheDocument();
    expect(screen.queryByLabelText("メンバー")).not.toBeInTheDocument();
  });

  it("メンバーが 1 人も居なければ新規登録だけを見せる", () => {
    render(<AddEntryForm {...props} members={[]} />);

    expect(screen.getByLabelText("氏名")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("既存のメンバーから選ぶ"),
    ).not.toBeInTheDocument();
  });

  it("disabled なら追加ボタンを押せない", () => {
    render(<AddEntryForm {...props} disabled />);

    expect(screen.getByRole("button", { name: "エントリーを追加" })).toBeDisabled();
  });

  it("id を hidden で送る", () => {
    const { container } = render(<AddEntryForm {...props} />);

    expect(container.querySelector('input[name="slug"]')).toHaveValue("acme");
    expect(container.querySelector('input[name="tournamentId"]')).toHaveValue(
      "t1",
    );
    expect(container.querySelector('input[name="divisionId"]')).toHaveValue(
      "d1",
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/components/division/AddEntryForm.test.tsx`
Expected: FAIL（`Failed to resolve import "./AddEntryForm"`）

- [ ] **Step 3: AddEntryForm を実装する**

Create `src/components/division/AddEntryForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";

type Mode = "existing" | "new";

export function AddEntryForm({
  action,
  slug,
  tournamentId,
  divisionId,
  members,
  disabled,
}: {
  action: DivisionFormAction;
  slug: string;
  tournamentId: string;
  divisionId: string;
  members: MemberSummary[];
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );
  // メンバーが 1 人も居ないうちは選びようがないので、新規登録だけを見せる。
  const [mode, setMode] = useState<Mode>(
    members.length === 0 ? "new" : "existing",
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-bold text-slate-700">エントリーを追加</h3>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />
      <input type="hidden" name="mode" value={mode} />

      {members.length > 0 && (
        <div className="flex gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="modeChoice"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
            />
            既存のメンバーから選ぶ
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="modeChoice"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            新しく登録する
          </label>
        </div>
      )}

      {mode === "existing" ? (
        <div className="space-y-1">
          <label
            htmlFor="memberId"
            className="block text-sm font-medium text-slate-700"
          >
            メンバー
          </label>
          <select
            id="memberId"
            name="memberId"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-700"
            >
              氏名
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="nameKana"
              className="block text-sm font-medium text-slate-700"
            >
              氏名（かな）
            </label>
            <input
              id="nameKana"
              name="nameKana"
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== undefined && (
        <p role="status" className="text-sm text-slate-600">
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "追加中..." : "エントリーを追加"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: EntryList の失敗するテストを書く**

Create `src/components/division/EntryList.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionEntry } from "@/lib/division/types";
import { EntryList } from "./EntryList";

const entries: DivisionEntry[] = [
  { id: "e1", participantId: "p1", seed: 0 },
  { id: "e2", participantId: "p2", seed: 1 },
];

const participants = [
  { id: "p1", name: "山田太郎", nameKana: "やまだたろう" },
  { id: "p2", name: "佐藤花子", nameKana: "さとうはなこ" },
];

const props = {
  entries,
  participants,
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  reorderAction: vi.fn(async () => ({ error: null })),
  removeAction: vi.fn(async () => ({ error: null })),
  disabled: false,
};

describe("EntryList", () => {
  it("エントリーが無ければその旨を出す", () => {
    render(<EntryList {...props} entries={[]} />);

    expect(screen.getByText("まだエントリーがありません")).toBeInTheDocument();
  });

  it("渡された順に氏名とかなを並べる", () => {
    render(<EntryList {...props} />);

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("山田太郎")).toBeInTheDocument();
    expect(within(rows[0]).getByText("やまだたろう")).toBeInTheDocument();
    expect(within(rows[1]).getByText("佐藤花子")).toBeInTheDocument();
  });

  it("参加者を引けない行は代わりの文言を出す", () => {
    render(<EntryList {...props} participants={[]} />);

    expect(screen.getAllByText("（不明な参加者）")).toHaveLength(2);
  });

  it("先頭では上へ、末尾では下へ動かせない", () => {
    render(<EntryList {...props} />);

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByLabelText("上へ移動")).toBeDisabled();
    expect(within(rows[0]).getByLabelText("下へ移動")).toBeEnabled();
    expect(within(rows[1]).getByLabelText("上へ移動")).toBeEnabled();
    expect(within(rows[1]).getByLabelText("下へ移動")).toBeDisabled();
  });

  it("削除すると組み合わせが作り直されることを伝える", () => {
    render(<EntryList {...props} />);

    expect(
      screen.getByText("削除すると組み合わせは再生成されます"),
    ).toBeInTheDocument();
  });

  it("disabled なら削除ボタンを押せない", () => {
    render(<EntryList {...props} disabled />);

    for (const button of screen.getAllByLabelText("削除")) {
      expect(button).toBeDisabled();
    }
  });
});
```

- [ ] **Step 5: EntryRowActions と EntryList を実装する**

Create `src/components/division/EntryRowActions.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 1 行ぶんの並べ替えと削除。並べ替えは 2 つの submit ボタンが同じ name を持ち、
 * 押された方の value が direction として送られる（DivisionReorderButtons と同じ形）。
 * 削除は別のフォームに分ける。同じフォームに入れると direction が一緒に飛ぶため。
 */
export function EntryRowActions({
  reorderAction,
  removeAction,
  slug,
  tournamentId,
  divisionId,
  entryId,
  canMoveUp,
  canMoveDown,
  disabled,
}: {
  reorderAction: DivisionFormAction;
  removeAction: DivisionFormAction;
  slug: string;
  tournamentId: string;
  divisionId: string;
  entryId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
}) {
  const [reorderState, reorderFormAction, reorderPending] = useActionState(
    reorderAction,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [removeState, removeFormAction, removePending] = useActionState(
    removeAction,
    INITIAL_DIVISION_FORM_STATE,
  );

  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />
      <input type="hidden" name="entryId" value={entryId} />
    </>
  );

  return (
    <div className="flex items-center gap-2">
      <form action={reorderFormAction} className="flex items-center gap-1">
        {hidden}
        <button
          type="submit"
          name="direction"
          value="up"
          aria-label="上へ移動"
          // 活性の判定は体感のためで、境界ではない。端の要求は handler が受け流す。
          disabled={reorderPending || disabled || !canMoveUp}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          aria-label="下へ移動"
          disabled={reorderPending || disabled || !canMoveDown}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
        >
          ↓
        </button>
      </form>

      <form action={removeFormAction}>
        {hidden}
        <button
          type="submit"
          aria-label="削除"
          disabled={removePending || disabled}
          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-30"
        >
          削除
        </button>
      </form>

      {reorderState.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {reorderState.error}
        </p>
      )}
      {removeState.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {removeState.error}
        </p>
      )}
    </div>
  );
}
```

Create `src/components/division/EntryList.tsx`:

```tsx
import type { DivisionParticipant } from "@/features/division/repository";
import type { DivisionFormAction } from "@/features/division/state";
import type { DivisionEntry } from "@/lib/division/types";
import { EntryRowActions } from "./EntryRowActions";

export function EntryList({
  entries,
  participants,
  slug,
  tournamentId,
  divisionId,
  reorderAction,
  removeAction,
  disabled,
}: {
  /** seed 昇順で渡す。端の判定にこの並びを使う。 */
  entries: DivisionEntry[];
  participants: DivisionParticipant[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  reorderAction: DivisionFormAction;
  removeAction: DivisionFormAction;
  disabled: boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-600">まだエントリーがありません</p>;
  }

  const participantById = new Map(
    participants.map((participant) => [participant.id, participant]),
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        削除すると組み合わせは再生成されます
      </p>

      <ul className="space-y-2">
        {entries.map((entry, index) => {
          const participant = participantById.get(entry.participantId);
          return (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-4 rounded border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                {/* 参加者を引けなくても行は出す。編集を続けられる方がよい。 */}
                <p className="font-medium text-slate-800">
                  {participant?.name ?? "（不明な参加者）"}
                </p>
                {participant !== undefined && (
                  <p className="text-xs text-slate-500">
                    {participant.nameKana}
                  </p>
                )}
              </div>

              <EntryRowActions
                reorderAction={reorderAction}
                removeAction={removeAction}
                slug={slug}
                tournamentId={tournamentId}
                divisionId={divisionId}
                entryId={entry.id}
                canMoveUp={index > 0}
                canMoveDown={index < entries.length - 1}
                disabled={disabled}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `pnpm test src/components/division/ && pnpm typecheck`
Expected: 全て PASS、型エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/components/division/AddEntryForm.tsx src/components/division/AddEntryForm.test.tsx src/components/division/EntryRowActions.tsx src/components/division/EntryList.tsx src/components/division/EntryList.test.tsx
git commit -m "feat(division): add entry list and add-entry form components"
```

---

### Task 12: ドラッグ＆ドロップの組み合わせエディタ

`@dnd-kit` を足し、1 回戦のカード上でスロットを入れ替えられるようにする。
D&D の実操作は jsdom で再現しにくいので、**添字の解決を純粋関数へ切り出して**
そこをテストする。コンポーネント側は `onSwap` を props で受け取るだけにする。

**Files:**
- Modify: `package.json`（`@dnd-kit/core` の追加）
- Create: `src/components/division/matching-drag.ts`
- Create: `src/components/division/matching-drag.test.ts`
- Create: `src/components/division/MatchingEditor.tsx`
- Test: `src/components/division/MatchingEditor.test.tsx`

**Interfaces:**
- Consumes: `SetupMatchView` / `SetupSlotView`（Task 10）
- Produces:
  - `slotDomId(index: number): string`
  - `resolveDragSwap(activeId: string, overId: string | null): [number, number] | null`
  - `MatchingEditor({ matches, onSwap, disabled })`
    - `onSwap: (indexA: number, indexB: number) => void`

- [ ] **Step 1: 依存を足す**

Run: `pnpm add @dnd-kit/core`

`@dnd-kit/sortable` は使わない。ここで要るのは「並べ替え」ではなく
「2 つのスロットの交換」で、`sortable` の並べ替えモデルとは挙動が違うため。

- [ ] **Step 2: 添字解決の失敗するテストを書く**

Create `src/components/division/matching-drag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveDragSwap, slotDomId } from "./matching-drag";

describe("slotDomId", () => {
  it("添字から一意な id を作る", () => {
    expect(slotDomId(0)).toBe("slot-0");
    expect(slotDomId(12)).toBe("slot-12");
  });
});

describe("resolveDragSwap", () => {
  it("2 つの id から添字の組を返す", () => {
    expect(resolveDragSwap("slot-0", "slot-3")).toEqual([0, 3]);
  });

  it("ドロップ先が無ければ null", () => {
    expect(resolveDragSwap("slot-0", null)).toBeNull();
  });

  it("同じスロットへ落としたら null", () => {
    expect(resolveDragSwap("slot-2", "slot-2")).toBeNull();
  });

  it("スロット以外の id なら null", () => {
    expect(resolveDragSwap("slot-0", "trash")).toBeNull();
    expect(resolveDragSwap("card-1", "slot-0")).toBeNull();
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm test src/components/division/matching-drag.test.ts`
Expected: FAIL（`Failed to resolve import "./matching-drag"`）

- [ ] **Step 4: 添字解決を実装する**

Create `src/components/division/matching-drag.ts`:

```ts
const PREFIX = "slot-";

/** D&D の識別子。サーバへ送る添字と 1 対 1 に対応させる。 */
export const slotDomId = (index: number): string => `${PREFIX}${index}`;

const toIndex = (id: string): number | null => {
  if (!id.startsWith(PREFIX)) {
    return null;
  }
  const index = Number(id.slice(PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

/**
 * ドラッグの結果を入れ替えの添字へ直す。入れ替えにならない場合は null。
 *
 * D&D の実操作は jsdom で再現しにくいので、判断をここへ切り出して
 * 単体でテストできるようにしてある。コンポーネントは呼ぶだけにする。
 */
export const resolveDragSwap = (
  activeId: string,
  overId: string | null,
): [number, number] | null => {
  if (overId === null || activeId === overId) {
    return null;
  }

  const from = toIndex(activeId);
  const to = toIndex(overId);
  if (from === null || to === null) {
    return null;
  }

  return [from, to];
};
```

- [ ] **Step 5: MatchingEditor の失敗するテストを書く**

Create `src/components/division/MatchingEditor.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SetupMatchView } from "@/features/division/single-elimination/view";
import { MatchingEditor } from "./MatchingEditor";

const matches: SetupMatchView[] = [
  {
    matchId: "m1-0",
    slots: [
      { index: 0, label: "山田太郎" },
      { index: 1, label: null },
    ],
  },
  {
    matchId: "m1-1",
    slots: [
      { index: 2, label: "佐藤花子" },
      { index: 3, label: "鈴木一郎" },
    ],
  },
];

describe("MatchingEditor", () => {
  it("組み合わせが無ければその旨を出す", () => {
    render(<MatchingEditor matches={[]} onSwap={vi.fn()} disabled={false} />);

    expect(screen.getByText("組み合わせが未作成です")).toBeInTheDocument();
  });

  it("1 回戦のカードを並べる", () => {
    render(
      <MatchingEditor matches={matches} onSwap={vi.fn()} disabled={false} />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("スロットに氏名を出す", () => {
    render(
      <MatchingEditor matches={matches} onSwap={vi.fn()} disabled={false} />,
    );

    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("山田太郎")).toBeInTheDocument();
    expect(within(cards[1]).getByText("鈴木一郎")).toBeInTheDocument();
  });

  it("bye は不戦勝として出す", () => {
    render(
      <MatchingEditor matches={matches} onSwap={vi.fn()} disabled={false} />,
    );

    expect(screen.getByText("（不戦勝）")).toBeInTheDocument();
  });

  it("入れ替えの操作方法を案内する", () => {
    render(
      <MatchingEditor matches={matches} onSwap={vi.fn()} disabled={false} />,
    );

    expect(
      screen.getByText(
        "スロットをドラッグして別のスロットへ落とすと入れ替わります",
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: MatchingEditor を実装する**

Create `src/components/division/MatchingEditor.tsx`:

```tsx
"use client";

import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type {
  SetupMatchView,
  SetupSlotView,
} from "@/features/division/single-elimination/view";
import { resolveDragSwap, slotDomId } from "./matching-drag";

function Slot({
  slot,
  disabled,
}: {
  slot: SetupSlotView;
  disabled: boolean;
}) {
  const id = slotDomId(slot.index);
  // 同じスロットが掴む側にも落とされる側にもなる。交換なので両方要る。
  const draggable = useDraggable({ id, disabled });
  const droppable = useDroppable({ id, disabled });

  return (
    <div
      ref={droppable.setNodeRef}
      className={
        droppable.isOver
          ? "rounded border border-slate-800 bg-slate-100 px-3 py-2"
          : "rounded border border-slate-200 px-3 py-2"
      }
    >
      <button
        type="button"
        ref={draggable.setNodeRef}
        disabled={disabled}
        className="w-full text-left text-sm text-slate-800 disabled:opacity-50"
        {...draggable.listeners}
        {...draggable.attributes}
      >
        {slot.label ?? "（不戦勝）"}
      </button>
    </div>
  );
}

export function MatchingEditor({
  matches,
  onSwap,
  disabled,
}: {
  matches: SetupMatchView[];
  onSwap: (indexA: number, indexB: number) => void;
  disabled: boolean;
}) {
  if (matches.length === 0) {
    return (
      <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
        組み合わせが未作成です
      </p>
    );
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const swap = resolveDragSwap(
      String(event.active.id),
      event.over === null ? null : String(event.over.id),
    );
    if (swap !== null) {
      onSwap(swap[0], swap[1]);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        スロットをドラッグして別のスロットへ落とすと入れ替わります
      </p>

      <DndContext onDragEnd={handleDragEnd}>
        <ul className="space-y-2">
          {matches.map((match) => (
            <li
              key={match.matchId}
              className="space-y-1 rounded border border-slate-200 bg-white p-3"
            >
              <Slot slot={match.slots[0]} disabled={disabled} />
              <Slot slot={match.slots[1]} disabled={disabled} />
            </li>
          ))}
        </ul>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 7: テストが通ることを確認**

Run: `pnpm test src/components/division/ && pnpm typecheck`
Expected: 全て PASS、型エラーなし

- [ ] **Step 8: コミット**

```bash
git add package.json pnpm-lock.yaml src/components/division/matching-drag.ts src/components/division/matching-drag.test.ts src/components/division/MatchingEditor.tsx src/components/division/MatchingEditor.test.tsx
git commit -m "feat(division): add drag and drop matching editor"
```

---

### Task 13: 画面の組み立てとページ

**Files:**
- Create: `src/components/division/MatchingSection.tsx`
- Create: `src/components/division/DivisionSetup.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Test: `src/components/division/DivisionSetup.test.tsx`
- Test: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx`
- Modify: `src/components/division/DivisionDetail.tsx`（編集画面へのリンクを足す）
- Test: `src/components/division/DivisionDetail.test.tsx`（無ければ作らず、既存があれば追記）

**Interfaces:**
- Consumes: 5 つの Server Action、`toSetupView`（Task 10）、`MatchingEditor`（Task 12）、`EntryList` / `AddEntryForm`（Task 11）、`DivisionBracket`（既存）
- Produces:
  - `MatchingSection({ matches, slug, tournamentId, divisionId, generateAction, swapAction, disabled })`
  - `DivisionSetup({ division, participants, members, slug, tournamentId, actions })`
  - `DivisionSetupPage`（デフォルトエクスポート）

- [ ] **Step 1: MatchingSection を実装する**

Create `src/components/division/MatchingSection.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { SetupMatchView } from "@/features/division/single-elimination/view";
import { MatchingEditor } from "./MatchingEditor";

/**
 * 生成ボタンと D&D エディタのサーバ配線。MatchingEditor を
 * onSwap だけを見る形に保つため、Server Action の呼び出しはここに寄せる。
 */
export function MatchingSection({
  matches,
  slug,
  tournamentId,
  divisionId,
  generateAction,
  swapAction,
  disabled,
}: {
  matches: SetupMatchView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  generateAction: DivisionFormAction;
  swapAction: DivisionFormAction;
  disabled: boolean;
}) {
  const [generateState, generateFormAction, generatePending] = useActionState(
    generateAction,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [swapState, swapFormAction, swapPending] = useActionState(
    swapAction,
    INITIAL_DIVISION_FORM_STATE,
  );

  const handleSwap = (indexA: number, indexB: number): void => {
    // useActionState が返す関数は FormData をそのまま受け取れる。
    // D&D にはフォームの submit が無いので、ここで組み立てて渡す。
    const data = new FormData();
    data.set("slug", slug);
    data.set("tournamentId", tournamentId);
    data.set("divisionId", divisionId);
    data.set("indexA", String(indexA));
    data.set("indexB", String(indexB));
    swapFormAction(data);
  };

  return (
    <div className="space-y-3">
      <form action={generateFormAction}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <button
          type="submit"
          disabled={generatePending || disabled}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          {generatePending ? "生成中..." : "組み合わせを生成"}
        </button>
      </form>

      {generateState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {generateState.error}
        </p>
      )}
      {generateState.notice !== undefined && (
        <p role="status" className="text-sm text-slate-600">
          {generateState.notice}
        </p>
      )}
      {swapState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {swapState.error}
        </p>
      )}

      <MatchingEditor
        matches={matches}
        onSwap={handleSwap}
        disabled={disabled || swapPending}
      />
    </div>
  );
}
```

- [ ] **Step 2: DivisionSetup の失敗するテストを書く**

Create `src/components/division/DivisionSetup.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { DivisionSetup } from "./DivisionSetup";

// ブラケットの組み立てまでは踏み込まないので、区画ごと差し替える。
vi.mock("./DivisionBracket", () => ({
  DivisionBracket: () => <div>bracket</div>,
}));

const action = vi.fn(async () => ({ error: null }));

const actions = {
  addEntry: action,
  removeEntry: action,
  reorderEntry: action,
  generateMatching: action,
  swapSlots: action,
};

const division = (overrides: Partial<DivisionDetail> = {}): DivisionDetail => ({
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION",
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const props = {
  slug: "acme",
  tournamentId: "t1",
  participants: [],
  members: [],
  actions,
};

describe("DivisionSetup", () => {
  it("エントリーと組み合わせの区画を出す", () => {
    render(<DivisionSetup {...props} division={division()} />);

    expect(
      screen.getByRole("heading", { name: "エントリー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "組み合わせ" }),
    ).toBeInTheDocument();
  });

  it("シングルエリミネーション以外は案内だけを出す", () => {
    render(
      <DivisionSetup {...props} division={division({ format: "ROUND_ROBIN" })} />,
    );

    expect(
      screen.getByText(
        "「リーグ（総当たり）」のエントリー編集はまだ対応していません",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "エントリー" }),
    ).not.toBeInTheDocument();
  });

  it("勝敗が記録済みなら理由を出して操作させない", () => {
    render(
      <DivisionSetup
        {...props}
        division={division({
          results: {
            version: 1,
            matches: [{ matchId: "m1-0", winnerEntryId: "e1" }],
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "勝敗が記録されているため、エントリーと組み合わせは変更できません",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "エントリーを追加" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "組み合わせを生成" }),
    ).toBeDisabled();
  });

  it("Json が壊れていてもページを落とさない", () => {
    render(
      <DivisionSetup {...props} division={division({ entries: { version: 2 } })} />,
    );

    expect(
      screen.getByText("部門のデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });
});
```

`DIVISION_FORMAT_LABELS` の `ROUND_ROBIN` の文言が「リーグ（総当たり）」でない場合は、
テストの期待値を実際の値に合わせる（`src/features/division/format.ts` を確認する）。

- [ ] **Step 3: DivisionSetup を実装する**

Create `src/components/division/DivisionSetup.tsx`:

```tsx
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { toSetupView } from "@/features/division/single-elimination/view";
import type { DivisionFormAction } from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { AddEntryForm } from "./AddEntryForm";
import { DivisionBracket } from "./DivisionBracket";
import { EntryList } from "./EntryList";
import { MatchingSection } from "./MatchingSection";

export type DivisionSetupActions = {
  addEntry: DivisionFormAction;
  removeEntry: DivisionFormAction;
  reorderEntry: DivisionFormAction;
  generateMatching: DivisionFormAction;
  swapSlots: DivisionFormAction;
};

const Notice = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
    {children}
  </p>
);

export function DivisionSetup({
  division,
  participants,
  members,
  slug,
  tournamentId,
  actions,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  members: MemberSummary[];
  slug: string;
  tournamentId: string;
  actions: DivisionSetupActions;
}) {
  // 描画側と同じ理由で、他の形式は編集に対応していない。
  if (division.format !== "SINGLE_ELIMINATION") {
    return (
      <Notice>
        「{DIVISION_FORMAT_LABELS[division.format]}
        」のエントリー編集はまだ対応していません
      </Notice>
    );
  }

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

  // 勝敗が入ったあとに組み合わせを変えると結果の参照が壊れる。
  // サーバ側でも拒否するが、押せてしまう前に理由を見せる。
  const locked = parsed.results.matches.length > 0;

  const entries = [...parsed.entries.entries].sort(
    (left, right) => left.seed - right.seed,
  );

  return (
    <div className="space-y-6">
      {locked && (
        <p
          role="status"
          className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          勝敗が記録されているため、エントリーと組み合わせは変更できません
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">エントリー</h2>
        <EntryList
          entries={entries}
          participants={participants}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          reorderAction={actions.reorderEntry}
          removeAction={actions.removeEntry}
          disabled={locked}
        />
        <AddEntryForm
          action={actions.addEntry}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          members={members}
          disabled={locked}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">組み合わせ</h2>
        <MatchingSection
          matches={toSetupView(parsed.matchingConfig, parsed.entries, participants)}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          generateAction={actions.generateMatching}
          swapAction={actions.swapSlots}
          disabled={locked}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">プレビュー</h2>
        <DivisionBracket division={division} participants={participants} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test src/components/division/DivisionSetup.test.tsx`
Expected: PASS（4 tests）

- [ ] **Step 5: ページのテストを書く**

Create `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const findDivisionInTournament = vi.fn();
const listParticipantsInTournament = vi.fn();
const listMembersInOrganization = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("@/features/tournament/repository", () => ({
  findTournamentInOrganization: (
    organizationId: string,
    tournamentId: string,
  ) => findTournamentInOrganization(organizationId, tournamentId),
}));

vi.mock("@/features/division/repository", () => ({
  findDivisionInTournament: (
    organizationId: string,
    tournamentId: string,
    divisionId: string,
  ) => findDivisionInTournament(organizationId, tournamentId, divisionId),
  listParticipantsInTournament: (
    organizationId: string,
    tournamentId: string,
  ) => listParticipantsInTournament(organizationId, tournamentId),
}));

vi.mock("@/features/organization/repository", () => ({
  listMembersInOrganization: (organizationId: string) =>
    listMembersInOrganization(organizationId),
}));

// 5 つの Server Action は "use server" を持つので、テストでは差し替える。
vi.mock("@/features/division/add-entry/handler", () => ({
  addEntryAction: vi.fn(),
}));
vi.mock("@/features/division/remove-entry/handler", () => ({
  removeEntryAction: vi.fn(),
}));
vi.mock("@/features/division/reorder-entry/handler", () => ({
  reorderEntryAction: vi.fn(),
}));
vi.mock("@/features/division/generate-matching/handler", () => ({
  generateMatchingAction: vi.fn(),
}));
vi.mock("@/features/division/swap-slots/handler", () => ({
  swapSlotsAction: vi.fn(),
}));

vi.mock("@/components/division/DivisionSetup", () => ({
  DivisionSetup: () => <div>setup</div>,
}));

const { default: DivisionSetupPage } = await import("./page");

const pageProps = () => ({
  params: Promise.resolve({
    slug: "acme",
    tournamentId: "t1",
    divisionId: "d1",
  }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "u1", name: "竹添" } };

beforeEach(() => {
  requireOrganization.mockReset();
  findTournamentInOrganization.mockReset();
  findDivisionInTournament.mockReset();
  listParticipantsInTournament.mockReset();
  listMembersInOrganization.mockReset();
  notFound.mockClear();

  requireOrganization.mockResolvedValue({
    session,
    organization: { id: "o1", name: "アクメ", slug: "acme" },
  });
  findTournamentInOrganization.mockResolvedValue({ id: "t1", name: "春季大会" });
  findDivisionInTournament.mockResolvedValue({
    id: "d1",
    name: "男子シングルス",
    order: 0,
    format: "SINGLE_ELIMINATION",
    entries: { version: 1, entries: [] },
    matchingConfig: { version: 1, matches: [] },
    results: { version: 1, matches: [] },
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  listParticipantsInTournament.mockResolvedValue([]);
  listMembersInOrganization.mockResolvedValue([]);
});

describe("DivisionSetupPage", () => {
  it("組織の認可を確かめてから描く", async () => {
    render(await DivisionSetupPage(pageProps()));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(screen.getByText("setup")).toBeInTheDocument();
  });

  it("パンくずに大会と部門を出す", async () => {
    render(await DivisionSetupPage(pageProps()));

    expect(screen.getByText("春季大会")).toBeInTheDocument();
    expect(screen.getByText("男子シングルス")).toBeInTheDocument();
  });

  it("部門が無ければ 404 にする", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(DivisionSetupPage(pageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(DivisionSetupPage(pageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
```

- [ ] **Step 6: ページを実装する**

Create `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { DivisionSetup } from "@/components/division/DivisionSetup";
import { AppHeader } from "@/components/layout/AppHeader";
import { addEntryAction } from "@/features/division/add-entry/handler";
import { generateMatchingAction } from "@/features/division/generate-matching/handler";
import { removeEntryAction } from "@/features/division/remove-entry/handler";
import { reorderEntryAction } from "@/features/division/reorder-entry/handler";
import {
  findDivisionInTournament,
  listParticipantsInTournament,
} from "@/features/division/repository";
import { swapSlotsAction } from "@/features/division/swap-slots/handler";
import { listMembersInOrganization } from "@/features/organization/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function DivisionSetupPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup">) {
  const { slug, tournamentId, divisionId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const [tournament, division, participants, members] = await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
    listParticipantsInTournament(organization.id, tournamentId),
    listMembersInOrganization(organization.id),
  ]);
  if (!tournament || !division) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          {
            label: tournament.name,
            href: `/orgs/${slug}/tournaments/${tournament.id}`,
          },
          {
            label: division.name,
            href: `/orgs/${slug}/tournaments/${tournament.id}/divisions/${division.id}`,
          },
          { label: "エントリー・組み合わせ" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">
          {division.name} のエントリー・組み合わせ
        </h1>

        <DivisionSetup
          division={division}
          participants={participants}
          members={members}
          slug={slug}
          tournamentId={tournament.id}
          actions={{
            addEntry: addEntryAction,
            removeEntry: removeEntryAction,
            reorderEntry: reorderEntryAction,
            generateMatching: generateMatchingAction,
            swapSlots: swapSlotsAction,
          }}
        />
      </div>
    </main>
  );
}
```

詳細ページと違い、参加者とメンバーを常に引く。この画面は
`SINGLE_ELIMINATION` を編集するために開くもので、どちらも必ず使うため。

- [ ] **Step 7: 詳細ページから導線を張る**

`src/components/division/DivisionDetail.tsx` の「部門を編集」リンクの隣に足す:

```tsx
        <Link
          href={`/orgs/${slug}/tournaments/${tournamentId}/divisions/${division.id}/setup`}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
        >
          エントリー・組み合わせ
        </Link>
```

2 つのリンクが並ぶので、`<h1>` の隣の要素を `<div className="flex gap-2">` で包む。

- [ ] **Step 8: テストが通ることを確認**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全て PASS、型エラー・lint エラーなし

`PageProps` が見つからない場合は `pnpm exec next typegen` を実行してから再実行する。

- [ ] **Step 9: コミット**

```bash
git add src/components/division src/app/orgs
git commit -m "feat(division): add entry and matching setup page"
```

---

### Task 14: 設計文書の更新と最終確認

**Files:**
- Modify: `docs/code-design/architecture.md`

- [ ] **Step 1: architecture.md に追記する**

「features/bracket と features/tournament の違い」の節の後に足す:

```markdown
## features/division の共有ドメイン

`features/division/single-elimination/` はスライスではなく、カテゴリ直下に置く
共有ドメインである。`handler.ts` と `repository.ts` を持たないことで
スライスと見分けられる。5 つの編集スライス（`add-entry` / `remove-entry` /
`reorder-entry` / `generate-matching` / `swap-slots`）がここへ祖先方向に依存するため、
スライス同士の依存は発生しない。

シングルエリミネーションのブラケットは「1 回戦のスロット割当配列（長さ 2 の冪）」
だけで完全に決まる。2 回戦以降のスロットは必ず `winnerOf` だからである。
この配列を唯一の状態とし、木は `buildFromSlots` で毎回組み立て直す。
試合 id を `m{round}-{order}` の決定的な形にしてあるため、組み立て直しても
`winnerOf` の参照が壊れる経路が存在しない。

`setup-store.ts` は 5 スライス共通の read-modify-write を持つ。所有権つきの読み出し、
Json のパース、勝敗が記録済みかの確認、保存前の検証、`updateMany` での書き戻しを
1 つのトランザクションにまとめる。スライス側の `repository.ts` は
「配列をどう変えるか」だけを書けばよくなる。
```

「テナント分離の 2 原則」の節の末尾に足す:

```markdown
編集スライス（`add-entry` / `remove-entry` / `reorder-entry` / `generate-matching` /
`swap-slots`）も同じ原則に従う。所有権は `setup-store.ts` の `load` / `save` が
`where` に入れて担保する。`add-entry` だけは `Member` と `Participant` を作るため
`create` を使うが、`Member` は `organizationId` を直接持ち、`Participant` は
所有権を確かめた `tournamentId` の下に作るので、境界は保たれる。

`reorder-entry` と `swap-slots` の 0 件応答は `features/division/reorder` と同じ扱いで、
「端まで来ている」と「その対象が無い」を区別せず、どちらも成功として返す。
```

- [ ] **Step 2: 全体を確認する**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全て PASS

- [ ] **Step 3: 手で動かして確かめる**

`BYPASS_AUTH=1` を設定し、Cookie に `USER_ID=1` を入れて `pnpm dev` で起動する。
部門詳細ページから「エントリー・組み合わせ」を開き、次を順に確かめる。

1. 新規登録でエントリーを 3 人足せる
2. 「組み合わせを生成」で 4 枠・bye 1 つのブラケットができる
3. スロットをドラッグして別のスロットへ落とすと入れ替わる
4. 4 人目を足すと、余っていた bye が埋まる
5. 5 人目を足すと、ブラケットが 8 枠へ広がる
6. エントリーを 1 人消すと「組み合わせを再生成しました」が出る
7. ↑↓ でシード順を変えられ、端では押せない
8. プレビューのブラケットが編集内容に追随する

- [ ] **Step 4: コミット**

```bash
git add docs/code-design/architecture.md
git commit -m "docs(division): describe single elimination shared domain and setup store"
```

---

## 完了の条件

- `pnpm test` / `pnpm typecheck` / `pnpm lint` が全て通る
- 仕様書のスコープ「含む」4 項目が全て動く
- `SINGLE_ELIMINATION` 以外の部門でこの URL を開いても 404 にはならず、案内が出る
- `results` がある部門ではフォームが押せず、サーバ側でも拒否される
