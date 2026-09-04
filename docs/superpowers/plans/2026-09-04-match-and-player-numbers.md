# 試合番号・選手番号 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各試合に文字列の試合番号（デフォルト連番）、各参加者に文字列の選手番号（デフォルト 1 始まり連番）を持たせ、部門セットアップ画面から編集できるようにする。

**Architecture:** 試合番号は `Division.matchingConfig` JSON 内の `BracketMatch.matchNumber` として保持し、`buildFromSlots` が再生成のたびに連番で振り直す。選手番号は `Participant.playerNumber` 列（一意制約なし）として保持し、作成時にアプリ側で採番する。編集は既存の Server Action スライス（schema / repository / usecase / handler）のパターンに倣い `set-match-number` / `set-player-number` を追加する。

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 (PostgreSQL), Effect, Zod 4, Vitest, Testing Library, Biome, Tailwind。

**Spec:** `docs/superpowers/specs/2026-09-04-match-and-player-numbers-design.md`

## Global Constraints

- パッケージ管理・スクリプト実行は必ず `pnpm`（例: `pnpm test`, `pnpm typecheck`, `pnpm lint:fix`）。
- この Next.js はトレーニングデータと異なる。API に迷ったら `node_modules/next/dist/docs/` を読む。
- 新しい worktree では `pnpm install` 後に `pnpm exec next typegen` を実行しないと `pnpm typecheck` が `LayoutProps` で落ちる。
- コミット前に `pnpm lint:fix` で biome を通す。
- テストは `pnpm test <path>` で個別実行できる（vitest run）。
- コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` を付ける。
- repository のテストは DB を使わず、`vi.mock` で `runDivisionSetup` や tx をモックする既存流儀（`src/features/division/add-entry/repository.test.ts` 参照）に従う。

---

### Task 1: `BracketMatch.matchNumber` 型の追加と `buildFromSlots` の採番

**Files:**
- Modify: `src/lib/division/types.ts`
- Modify: `src/features/division/single-elimination/build.ts`
- Test: `src/features/division/single-elimination/build.test.ts`
- Modify（コンパイル修正）: `BracketMatch` リテラルを組み立てている既存テスト・fixture 全部（`pnpm typecheck` が列挙してくれる。`src/lib/division/parse.test.ts`, `src/lib/division/validate.test.ts`, `src/features/division/single-elimination/view.test.ts`, `src/features/bracket/from-division.test.ts` など）

**Interfaces:**
- Produces: `BracketMatch` に必須フィールド `matchNumber: string` が増える。`buildFromSlots` は round 昇順 → order 昇順（＝生成順）で `"1", "2", ...` を採番する。bye 試合にも振る。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/single-elimination/build.test.ts` の `buildFromSlots` の describe に追記:

```ts
it("試合番号を round 昇順 → order 昇順で 1 始まりの連番で振る", () => {
  const entry = (id: string): SlotSource => ({ kind: "entry", entryId: id });
  const config = buildFromSlots([
    entry("e1"),
    entry("e2"),
    entry("e3"),
    entry("e4"),
  ]);

  const numbers = config.matches
    .sort((a, b) => a.round - b.round || a.order - b.order)
    .map((match) => match.matchNumber);
  expect(numbers).toEqual(["1", "2", "3"]);
});

it("bye 試合にも試合番号を振る", () => {
  const config = buildFromSlots([
    { kind: "entry", entryId: "e1" },
    { kind: "entry", entryId: "e2" },
    { kind: "entry", entryId: "e3" },
  ]);

  for (const match of config.matches) {
    expect(match.matchNumber).toMatch(/^\d+$/);
  }
});
```

（`SlotSource` の import が無ければ既存 import に足す。既存テストのヘルパーがあればそれを使う。）

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/division/single-elimination/build.test.ts`
Expected: FAIL（`matchNumber` が `undefined`）。TypeScript エラーの場合もこの時点では失敗として扱う。

- [ ] **Step 3: 型とビルダーを実装**

`src/lib/division/types.ts` の `BracketMatch` に追加:

```ts
export type BracketMatch = {
  /** 部門内で一意 */
  id: string;
  bracket: BracketSide;
  /** 1 = 1 回戦。ROUND_ROBIN では節番号 */
  round: number;
  /** ラウンド内の上からの位置。0 始まり */
  order: number;
  /** 表示用の試合番号。部門内で一意。デフォルトは round/order 順の連番 */
  matchNumber: string;
  slots: [SlotSource, SlotSource];
};
```

`src/features/division/single-elimination/build.ts` の `buildFromSlots` で、matches へ push している 2 箇所に `matchNumber` を追加する。push は round 昇順 → order 昇順で行われるため、`String(matches.length + 1)` で連番になる:

```ts
// 1 回戦のループ内
matches.push({
  id: matchId(1, order),
  bracket: "winners",
  round: 1,
  order,
  matchNumber: String(matches.length + 1),
  slots: [paddedSlots[order * 2], paddedSlots[order * 2 + 1]],
});

// 2 回戦以降のループ内
matches.push({
  id: matchId(round, order),
  bracket: "winners",
  round,
  order,
  matchNumber: String(matches.length + 1),
  slots: [
    { kind: "winnerOf", matchId: matchId(round - 1, order * 2) },
    { kind: "winnerOf", matchId: matchId(round - 1, order * 2 + 1) },
  ],
});
```

- [ ] **Step 4: typecheck を通す（既存 fixture の修正）**

Run: `pnpm typecheck`

`BracketMatch` をリテラルで組み立てている箇所が `matchNumber` 欠落でエラーになる。エラーになった各 fixture に `matchNumber: "1"`（同一 config 内では `"1"`, `"2"`, ... と一意に）を機械的に追加する。プロダクションコードでエラーが出た場合は Task 2 以降の担当箇所なのでこの Task では触らず、テスト・fixture のみ直す（`buildFromSlots` 経由で組み立てている箇所は自動的に直る）。

Expected: exit 0

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm test src/features/division/single-elimination/build.test.ts && pnpm test`
Expected: 全 PASS（parse/validate の新ルールはまだ無いので既存テストは fixture 修正だけで通る）

- [ ] **Step 6: コミット**

```bash
pnpm lint:fix
git add -A
git commit -m "feat(division): number bracket matches sequentially on build"
```

---

### Task 2: `parse` の試合番号補完と `validate` の重複・空チェック

**Files:**
- Modify: `src/lib/division/parse.ts`
- Modify: `src/lib/division/validate.ts`
- Test: `src/lib/division/parse.test.ts`
- Test: `src/lib/division/validate.test.ts`

**Interfaces:**
- Consumes: Task 1 の `BracketMatch.matchNumber: string`。
- Produces: `parseMatchingConfig` は `matchNumber` が無い試合に「未使用の最小の正整数（文字列）」を round/order 順に補完して返す（既存 JSON のデータ移行は不要）。`validateMatchingConfig` は matchNumber の空文字と部門内重複をエラーにする。

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/parse.test.ts` に追記（既存のテストデータ組み立てヘルパーの流儀に合わせる）:

```ts
it("matchNumber を持つ試合はそのまま読む", () => {
  const config = parseMatchingConfig({
    version: 1,
    matches: [
      {
        id: "m1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        matchNumber: "A",
        slots: [{ kind: "bye" }, { kind: "bye" }],
      },
    ],
  });
  expect(config.matches[0].matchNumber).toBe("A");
});

it("matchNumber の無い試合には round/order 順で未使用の連番を補完する", () => {
  const match = (id: string, round: number, order: number) => ({
    id,
    bracket: "winners",
    round,
    order,
    slots: [{ kind: "bye" }, { kind: "bye" }],
  });
  const config = parseMatchingConfig({
    version: 1,
    // 配列順は round 順と逆に置き、round/order 順で補完されることを確かめる
    matches: [match("m2-0", 2, 0), match("m1-0", 1, 0), match("m1-1", 1, 1)],
  });
  const byId = new Map(config.matches.map((m) => [m.id, m.matchNumber]));
  expect(byId.get("m1-0")).toBe("1");
  expect(byId.get("m1-1")).toBe("2");
  expect(byId.get("m2-0")).toBe("3");
});

it("補完する連番は既に使われている番号を飛ばす", () => {
  const config = parseMatchingConfig({
    version: 1,
    matches: [
      {
        id: "m1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        matchNumber: "1",
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
  const byId = new Map(config.matches.map((m) => [m.id, m.matchNumber]));
  expect(byId.get("m1-1")).toBe("2");
});

it("matchNumber が文字列以外なら DivisionJsonError", () => {
  expect(() =>
    parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchNumber: 1,
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    }),
  ).toThrow(DivisionJsonError);
});
```

`src/lib/division/validate.test.ts` に追記:

```ts
it("matchNumber が重複していたらエラー", () => {
  // 既存テストの match fixture ヘルパーを使い、2 試合に同じ matchNumber "1" を与える
  const errors = validateMatchingConfig(
    {
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchNumber: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          matchNumber: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    },
    { version: 1, entries: [] },
  );
  expect(errors).toContain(
    "matchingConfig.matches[].matchNumber が重複しています: 1",
  );
});

it("matchNumber が空文字ならエラー", () => {
  const errors = validateMatchingConfig(
    {
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchNumber: "",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    },
    { version: 1, entries: [] },
  );
  expect(errors).toContain("m1-0: matchNumber が空です");
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/lib/division/parse.test.ts src/lib/division/validate.test.ts`
Expected: FAIL（補完が無く `matchNumber` が undefined、validate の新エラーが出ない）

- [ ] **Step 3: parse に補完を実装**

`src/lib/division/parse.ts`:

`parseBracketMatch` の戻り値を「matchNumber が省略可能な形」にし、`parseMatchingConfig` で補完する。

```ts
/** matchNumber 補完前の 1 試合。旧データには matchNumber が無い。 */
type ParsedBracketMatch = Omit<BracketMatch, "matchNumber"> & {
  matchNumber?: string;
};

const parseBracketMatch = (
  value: unknown,
  path: string,
): ParsedBracketMatch => {
  const record = asRecord(value, path);
  const slots = asArray(record.slots, `${path}.slots`);
  if (slots.length !== 2) {
    return fail(`${path}.slots`, "要素 2 個の配列");
  }
  const parsed: ParsedBracketMatch = {
    id: asString(record.id, `${path}.id`),
    bracket: parseBracketSide(record.bracket, `${path}.bracket`),
    round: asInt(record.round, `${path}.round`),
    order: asInt(record.order, `${path}.order`),
    slots: [
      parseSlotSource(slots[0], `${path}.slots[0]`),
      parseSlotSource(slots[1], `${path}.slots[1]`),
    ],
  };
  if (record.matchNumber !== undefined) {
    parsed.matchNumber = asString(record.matchNumber, `${path}.matchNumber`);
  }
  return parsed;
};

/**
 * matchNumber の無い試合（列追加前に保存された旧データ）へ番号を補完する。
 * round/order 順に、既存の番号と衝突しない最小の正整数を文字列で割り当てる。
 * データ移行を行わない代わりに、読み出しが必ず完全な形へ正規化する。
 */
const fillMatchNumbers = (matches: ParsedBracketMatch[]): BracketMatch[] => {
  const used = new Set(
    matches.flatMap((match) =>
      match.matchNumber === undefined ? [] : [match.matchNumber],
    ),
  );
  let candidate = 1;
  const nextNumber = (): string => {
    while (used.has(String(candidate))) {
      candidate += 1;
    }
    used.add(String(candidate));
    return String(candidate);
  };

  const assigned = new Map<string, string>();
  for (const match of [...matches].sort(
    (left, right) => left.round - right.round || left.order - right.order,
  )) {
    if (match.matchNumber === undefined) {
      assigned.set(match.id, nextNumber());
    }
  }

  return matches.map((match) =>
    match.matchNumber === undefined
      ? { ...match, matchNumber: assigned.get(match.id) as string }
      : (match as BracketMatch),
  );
};

export const parseMatchingConfig = (value: unknown): MatchingConfig => {
  const record = asRecord(value, "matchingConfig");
  return {
    version: asVersion1(record.version, "matchingConfig.version"),
    matches: fillMatchNumbers(
      asArray(record.matches, "matchingConfig.matches").map((item, index) =>
        parseBracketMatch(item, `matchingConfig.matches[${index}]`),
      ),
    ),
  };
};
```

- [ ] **Step 4: validate にルールを実装**

`src/lib/division/validate.ts` の `validateMatchingConfig` の id 重複チェックの直後に追加:

```ts
for (const matchNumber of duplicates(
  matches.map((match) => match.matchNumber),
)) {
  errors.push(
    `matchingConfig.matches[].matchNumber が重複しています: ${matchNumber}`,
  );
}
for (const match of matches) {
  if (match.matchNumber === "") {
    errors.push(`${match.id}: matchNumber が空です`);
  }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm test src/lib/division && pnpm typecheck`
Expected: 全 PASS

- [ ] **Step 6: コミット**

```bash
pnpm lint:fix
git add -A
git commit -m "feat(division): fill and validate bracket match numbers"
```

---

### Task 3: ブラケット描画への試合番号の伝搬（MatchCard 表示）

**Files:**
- Modify: `src/features/bracket/types.ts`
- Modify: `src/features/bracket/from-division.ts`
- Modify: `src/features/bracket/resolve-bracket.ts`
- Modify: `src/components/tournament/MatchCard.tsx`
- Test: `src/features/bracket/from-division.test.ts`
- Test: `src/features/bracket/resolve-bracket.test.ts`
- Test: `src/components/tournament/MatchCard.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `BracketMatch.matchNumber: string`。
- Produces: `features/bracket` の `Match.matchNumber?: string`（mock 互換のため省略可能）、`ResolvedMatch.matchNumber: string | null`。MatchCard は番号があるとき `data-testid="match-number-<id>"` のバッジで表示する。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/bracket/from-division.test.ts` に追記（既存の入力組み立てヘルパーを使う。無ければ既存テストの形をコピーする）:

```ts
it("matchNumber を描画側の Match に写す", () => {
  // 既存の「変換できる最小の入力」を作るヘルパー／fixture を再利用し、
  // matchingConfig の試合に matchNumber: "5" を設定して fromDivision を呼ぶ
  const result = fromDivision(input);
  expect(result?.bracket.matches[0].matchNumber).toBe("5");
});
```

`src/features/bracket/resolve-bracket.test.ts` に追記:

```ts
it("matchNumber を ResolvedMatch へ通す。無ければ null", () => {
  // 既存 fixture の 1 試合に matchNumber: "3" を付けた場合と付けない場合で
  const withNumber = resolveBracket(participants, bracketWithNumber, []);
  expect(withNumber[0].matchNumber).toBe("3");
  const withoutNumber = resolveBracket(participants, bracketWithoutNumber, []);
  expect(withoutNumber[0].matchNumber).toBeNull();
});
```

`src/components/tournament/MatchCard.test.tsx` に追記:

```tsx
it("試合番号があればバッジで表示する", () => {
  // 既存テストの ResolvedMatch fixture に matchNumber: "7" を与えて render
  render(<MatchCard match={{ ...baseMatch, matchNumber: "7" }} />);
  expect(screen.getByTestId(`match-number-${baseMatch.id}`)).toHaveTextContent(
    "7",
  );
});

it("試合番号が null ならバッジを出さない", () => {
  render(<MatchCard match={{ ...baseMatch, matchNumber: null }} />);
  expect(
    screen.queryByTestId(`match-number-${baseMatch.id}`),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/bracket src/components/tournament/MatchCard.test.tsx`
Expected: FAIL（型に matchNumber が無い／バッジが無い）

- [ ] **Step 3: 型と変換を実装**

`src/features/bracket/types.ts`:

```ts
/** ブラケット構造上の 1 試合。「誰と誰がいつ当たるか」。 */
export type Match = {
  id: string;
  /** 1 = 1 回戦 */
  round: number;
  /** ラウンド内の上からの位置。0 始まり */
  order: number;
  /** 表示用の試合番号。mock など無い場合は省略可 */
  matchNumber?: string;
  slots: [SlotSource, SlotSource];
};
```

`ResolvedMatch` に追加:

```ts
export type ResolvedMatch = {
  id: string;
  round: number;
  order: number;
  /** 表示用の試合番号。元データに無ければ null */
  matchNumber: string | null;
  slots: [ResolvedSlot, ResolvedSlot];
  winnerId: string | null;
  score: string | null;
  status: MatchStatus;
  /** 各スロットの供給元試合 id。エッジ生成とレイアウトに使う */
  sourceMatchIds: [string | null, string | null];
};
```

`src/features/bracket/from-division.ts` の `matches.push({...})` に 1 行追加:

```ts
matches.push({
  id: source.id,
  round: source.round,
  order: source.order,
  matchNumber: source.matchNumber,
  slots: [first, second],
});
```

`src/features/bracket/resolve-bracket.ts` の戻り値オブジェクトに 1 行追加:

```ts
return {
  id: match.id,
  round: match.round,
  order: match.order,
  matchNumber: match.matchNumber ?? null,
  slots,
  winnerId,
  score,
  status: toStatus(hasBye, winnerId, slots),
  sourceMatchIds,
};
```

- [ ] **Step 4: MatchCard にバッジを実装**

`src/components/tournament/MatchCard.tsx` の score バッジの隣（`SlotRow` 2 つの後）に追加:

```tsx
{match.matchNumber !== null ? (
  <span
    data-testid={`match-number-${match.id}`}
    className="absolute left-1 top-1 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-500"
  >
    {match.matchNumber}
  </span>
) : null}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm test src/features/bracket src/components && pnpm typecheck`
Expected: 全 PASS（`ResolvedMatch` を組み立てる既存 fixture は `matchNumber: null` の追加が必要になったら足す）

- [ ] **Step 6: コミット**

```bash
pnpm lint:fix
git add -A
git commit -m "feat(bracket): show match numbers on match cards"
```

---

### Task 4: `set-match-number` スライス（エラー型・schema・repository・usecase・handler）

**Files:**
- Modify: `src/features/division/errors.ts`
- Modify: `src/features/division/messages.ts`
- Create: `src/features/division/set-match-number/schema.ts`
- Create: `src/features/division/set-match-number/repository.ts`
- Create: `src/features/division/set-match-number/usecase.ts`
- Create: `src/features/division/set-match-number/handler.ts`
- Test: `src/features/division/set-match-number/schema.test.ts`
- Test: `src/features/division/set-match-number/repository.test.ts`

**Interfaces:**
- Consumes: `parseMatchingConfig` / `parseDivisionEntries`（Task 2 の補完込み）、`validateMatchingConfig`、`DivisionIds` / `DivisionSetupOutcome`（setup-store）、`divisionErrorFormState`、`revalidateDivisionSetup`。
- Produces: `setMatchNumberAction: DivisionFormAction`（FormData: slug, tournamentId, divisionId, matchId, matchNumber）。新エラー `DivisionMatchNotFoundError { matchId }`, `DivisionMatchNumberConflictError { matchNumber }`。
- 注意: **勝敗記録後も編集可能にするため `runDivisionSetup` は使わない**（あれは results があると `DivisionResultsRecordedError` を投げる）。専用のトランザクションを書く。

- [ ] **Step 1: エラー型と文言を追加**

`src/features/division/errors.ts` に追加:

```ts
/** 指定された試合が組み合わせに無いことを表す。 */
export class DivisionMatchNotFoundError extends Data.TaggedError(
  "DivisionMatchNotFoundError",
)<{
  readonly matchId: string;
}> {}

/** 試合番号が部門内の別の試合と重複していることを表す。 */
export class DivisionMatchNumberConflictError extends Data.TaggedError(
  "DivisionMatchNumberConflictError",
)<{
  readonly matchNumber: string;
}> {}
```

`DivisionError` の union と `divisionErrorTags` に両タグを追記する（追記漏れは型エラーで検出される）。

`src/features/division/messages.ts` に追加:

```ts
Match.tag(
  "DivisionMatchNotFoundError",
  () => "対象の試合が見つかりません。画面を再読み込みしてください",
),
Match.tag(
  "DivisionMatchNumberConflictError",
  () => "その試合番号は別の試合で使われています",
),
```

Run: `pnpm typecheck` → exit 0（Match.exhaustive が文言漏れを検出する）

- [ ] **Step 2: schema の失敗するテストを書く**

`src/features/division/set-match-number/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { setMatchNumberSchema } from "./schema";

describe("setMatchNumberSchema", () => {
  it("前後の空白を除いて受け付ける", () => {
    const parsed = setMatchNumberSchema.safeParse({
      matchId: "m1-0",
      matchNumber: " 12 ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.matchNumber).toBe("12");
    }
  });

  it("空白だけの試合番号は拒否する", () => {
    const parsed = setMatchNumberSchema.safeParse({
      matchId: "m1-0",
      matchNumber: "  ",
    });
    expect(parsed.success).toBe(false);
  });

  it("matchId が空なら拒否する", () => {
    const parsed = setMatchNumberSchema.safeParse({
      matchId: "",
      matchNumber: "1",
    });
    expect(parsed.success).toBe(false);
  });

  it("21 文字以上の試合番号は拒否する", () => {
    const parsed = setMatchNumberSchema.safeParse({
      matchId: "m1-0",
      matchNumber: "a".repeat(21),
    });
    expect(parsed.success).toBe(false);
  });
});
```

Run: `pnpm test src/features/division/set-match-number/schema.test.ts`
Expected: FAIL（ファイルが無い）

- [ ] **Step 3: schema を実装**

`src/features/division/set-match-number/schema.ts`:

```ts
import { z } from "zod";

export const setMatchNumberSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  matchNumber: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "試合番号を入力してください")
        .max(20, "試合番号は20文字までです"),
    ),
});

export type SetMatchNumberInput = z.infer<typeof setMatchNumberSchema>;
```

Run: `pnpm test src/features/division/set-match-number/schema.test.ts`
Expected: PASS

- [ ] **Step 4: repository の失敗するテストを書く**

`src/features/division/set-match-number/repository.test.ts`（prisma をモックする。`runDivisionSetup` を使わないため add-entry とはモック対象が違う）:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFromSlots } from "../single-elimination/build";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        division: {
          findFirst: (args: unknown) => divisionFindFirst(args),
          updateMany: (args: unknown) => divisionUpdateMany(args),
        },
      }),
  },
}));

const { setMatchNumberInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

// e1 vs e2 の 1 試合だけの組み合わせ（matchNumber "1"）
const config = buildFromSlots([
  { kind: "entry", entryId: "e1" },
  { kind: "entry", entryId: "e2" },
]);
const entries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
  ],
};

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig: config,
  });
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("setMatchNumberInDb", () => {
  it("指定した試合の番号だけを書き換える", async () => {
    const outcome = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "A" }),
    );

    expect(outcome).toEqual({ found: true, value: null });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches[0].matchNumber).toBe("A");
    expect(written.matches[0].slots).toEqual(config.matches[0].slots);
  });

  it("所有権を where に入れて読む", async () => {
    await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "A" }),
    );
    expect(divisionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "d1",
          tournament: { id: "t1", organizationId: "o1" },
        },
      }),
    );
  });

  it("部門が見つからなければ found: false", async () => {
    divisionFindFirst.mockResolvedValue(null);
    const outcome = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "A" }),
    );
    expect(outcome).toEqual({ found: false });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("存在しない試合なら DivisionMatchNotFoundError", async () => {
    const exit = await Effect.runPromiseExit(
      setMatchNumberInDb(ids, { matchId: "m9-9", matchNumber: "A" }),
    );
    expect(exit._tag).toBe("Failure");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("別の試合と同じ番号なら DivisionMatchNumberConflictError", async () => {
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

    const exit = await Effect.runPromiseExit(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "2" }),
    );
    expect(exit._tag).toBe("Failure");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("同じ試合への同じ番号の再設定は重複にならない", async () => {
    const outcome = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "1" }),
    );
    expect(outcome).toEqual({ found: true, value: null });
  });
});
```

Run: `pnpm test src/features/division/set-match-number/repository.test.ts`
Expected: FAIL（ファイルが無い）

- [ ] **Step 5: repository を実装**

`src/features/division/set-match-number/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import {
  parseDivisionEntries,
  parseMatchingConfig,
} from "@/lib/division/parse";
import type { MatchingConfig } from "@/lib/division/types";
import { validateMatchingConfig } from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionMatchNotFoundError,
  DivisionMatchNumberConflictError,
  toDivisionError,
} from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SetMatchNumberInput } from "./schema";

export type SetMatchNumberPort = (
  ids: DivisionIds,
  input: SetMatchNumberInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/**
 * 試合番号だけを書き換える。組み合わせの構造も勝敗の参照も変えないため、
 * 勝敗記録後でも編集できる。runDivisionSetup は results が 1 件でもあると
 * 拒否する読み出しなので、ここでは使わず専用のトランザクションを書く。
 */
export const setMatchNumberInDb: SetMatchNumberPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(
        async (tx): Promise<DivisionSetupOutcome<null>> => {
          const row = await tx.division.findFirst({
            where: {
              id: ids.divisionId,
              tournament: {
                id: ids.tournamentId,
                organizationId: ids.organizationId,
              },
            },
            select: { format: true, entries: true, matchingConfig: true },
          });
          // 対象外の形式は setup-store と同じく「無い」に倒す。
          if (!row || row.format !== "SINGLE_ELIMINATION") {
            return { found: false };
          }

          const config = parseMatchingConfig(row.matchingConfig);
          const target = config.matches.find(
            (match) => match.id === input.matchId,
          );
          if (!target) {
            throw new DivisionMatchNotFoundError({ matchId: input.matchId });
          }
          if (
            config.matches.some(
              (match) =>
                match.id !== input.matchId &&
                match.matchNumber === input.matchNumber,
            )
          ) {
            throw new DivisionMatchNumberConflictError({
              matchNumber: input.matchNumber,
            });
          }

          const next: MatchingConfig = {
            version: 1,
            matches: config.matches.map((match) =>
              match.id === input.matchId
                ? { ...match, matchNumber: input.matchNumber }
                : match,
            ),
          };

          // setup-store の save と同じく、書く直前に検証を通す。
          const errors = validateMatchingConfig(
            next,
            parseDivisionEntries(row.entries),
          );
          if (errors.length > 0) {
            throw new DivisionDataError({ reason: errors });
          }

          await tx.division.updateMany({
            where: {
              id: ids.divisionId,
              tournament: {
                id: ids.tournamentId,
                organizationId: ids.organizationId,
              },
            },
            data: { matchingConfig: next },
          });
          return { found: true, value: null };
        },
      ),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
```

Run: `pnpm test src/features/division/set-match-number/repository.test.ts`
Expected: PASS

- [ ] **Step 6: usecase と handler を実装**

`src/features/division/set-match-number/usecase.ts`（swap-slots と同じ薄い形）:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SetMatchNumberPort } from "./repository";
import type { SetMatchNumberInput } from "./schema";

export const setMatchNumberForDivision = (
  port: SetMatchNumberPort,
  ids: DivisionIds,
  input: SetMatchNumberInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> =>
  port(ids, input);
```

`src/features/division/set-match-number/handler.ts`（swap-slots/handler.ts の形をなぞる）:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { setMatchNumberInDb } from "./repository";
import { setMatchNumberSchema } from "./schema";
import { setMatchNumberForDivision } from "./usecase";

export const setMatchNumberAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = setMatchNumberSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
    matchNumber: String(formData.get("matchNumber") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    setMatchNumberForDivision(
      setMatchNumberInDb,
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
  return { error: null };
};
```

- [ ] **Step 7: 全体確認とコミット**

Run: `pnpm test src/features/division && pnpm typecheck`
Expected: 全 PASS

```bash
pnpm lint:fix
git add -A
git commit -m "feat(division): add set-match-number action"
```

---

### Task 5: 試合番号一覧の view とセットアップ画面 UI

**Files:**
- Modify: `src/features/division/single-elimination/view.ts`
- Create: `src/components/division/MatchNumberList.tsx`
- Modify: `src/components/division/DivisionSetup.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Test: `src/features/division/single-elimination/view.test.ts`
- Test: `src/components/division/MatchNumberList.test.tsx`

**Interfaces:**
- Consumes: Task 4 の `setMatchNumberAction`、`MatchingConfig`（matchNumber 込み）。
- Produces: `toMatchNumberView(config, entries, participants): MatchNumberRowView[]`。`MatchNumberList` コンポーネント（props: rows, slug, tournamentId, divisionId, action）。`DivisionSetupActions` に `setMatchNumber: DivisionFormAction` が増える。

- [ ] **Step 1: view の失敗するテストを書く**

`src/features/division/single-elimination/view.test.ts` に追記:

```ts
describe("toMatchNumberView", () => {
  it("全試合を round/order 順に並べ、対戦の表示名を組み立てる", () => {
    const entries = {
      version: 1 as const,
      entries: [
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 1 },
        { id: "e3", participantId: "p3", seed: 2 },
      ],
    };
    const config = buildFromSlots([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
      { kind: "entry", entryId: "e3" },
      { kind: "bye" },
    ]);
    const rows = toMatchNumberView(config, entries, [
      { id: "p1", name: "山田" },
      { id: "p2", name: "佐藤" },
      { id: "p3", name: "鈴木" },
    ]);

    expect(rows).toEqual([
      {
        matchId: "m1-0",
        matchNumber: "1",
        label: "1回戦 第1試合",
        card: "山田 vs 佐藤",
      },
      {
        matchId: "m1-1",
        matchNumber: "2",
        label: "1回戦 第2試合",
        card: "鈴木 vs BYE",
      },
      {
        matchId: "m2-0",
        matchNumber: "3",
        label: "2回戦 第1試合",
        card: "第1試合の勝者 vs 第2試合の勝者",
      },
    ]);
  });

  it("名前を引けない参加者は（不明な参加者）として出す", () => {
    const entries = {
      version: 1 as const,
      entries: [
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 1 },
      ],
    };
    const config = buildFromSlots([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
    ]);
    const rows = toMatchNumberView(config, entries, [
      { id: "p1", name: "山田" },
    ]);
    expect(rows[0].card).toBe("山田 vs （不明な参加者）");
  });
});
```

Run: `pnpm test src/features/division/single-elimination/view.test.ts`
Expected: FAIL（`toMatchNumberView` が無い）

- [ ] **Step 2: view を実装**

`src/features/division/single-elimination/view.ts` に追記:

```ts
import type {
  DivisionEntries,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";

/** 試合番号一覧の 1 行。 */
export type MatchNumberRowView = {
  matchId: string;
  matchNumber: string;
  /** 「1回戦 第1試合」のような構造上の位置 */
  label: string;
  /** 「山田 vs 佐藤」のような対戦の表示 */
  card: string;
};

/**
 * 全試合を round/order 順に並べた試合番号の編集用一覧。
 * toSetupView と違い 1 回戦以外も含む。勝者参照は相手の試合番号で表す。
 */
export const toMatchNumberView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): MatchNumberRowView[] => {
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const nameByEntryId = new Map(
    entries.entries.map((entry) => [
      entry.id,
      participantById.get(entry.participantId) ?? null,
    ]),
  );
  const numberByMatchId = new Map(
    config.matches.map((match) => [match.id, match.matchNumber]),
  );

  const slotLabel = (slot: SlotSource): string => {
    switch (slot.kind) {
      case "entry":
        return nameByEntryId.get(slot.entryId) ?? "（不明な参加者）";
      case "winnerOf":
        return `第${numberByMatchId.get(slot.matchId) ?? "?"}試合の勝者`;
      case "loserOf":
        return `第${numberByMatchId.get(slot.matchId) ?? "?"}試合の敗者`;
      case "bye":
        return "BYE";
    }
  };

  return [...config.matches]
    .sort((left, right) => left.round - right.round || left.order - right.order)
    .map((match) => ({
      matchId: match.id,
      matchNumber: match.matchNumber,
      label: `${match.round}回戦 第${match.order + 1}試合`,
      card: `${slotLabel(match.slots[0])} vs ${slotLabel(match.slots[1])}`,
    }));
};
```

（既存 import と重複する型はまとめる。）

Run: `pnpm test src/features/division/single-elimination/view.test.ts`
Expected: PASS

- [ ] **Step 3: コンポーネントの失敗するテストを書く**

`src/components/division/MatchNumberList.test.tsx`（既存の `EntryList.test.tsx` / `DivisionSetup.test.tsx` のセットアップ流儀に合わせる）:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DivisionFormState } from "@/features/division/state";
import { MatchNumberList } from "./MatchNumberList";

const rows = [
  {
    matchId: "m1-0",
    matchNumber: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
  {
    matchId: "m2-0",
    matchNumber: "3",
    label: "2回戦 第1試合",
    card: "第1試合の勝者 vs 第2試合の勝者",
  },
];

const noopAction = vi.fn(
  async (_state: DivisionFormState, _data: FormData) => ({
    error: null,
  }),
);

describe("MatchNumberList", () => {
  it("全試合の行と現在の番号を表示する", () => {
    render(
      <MatchNumberList
        rows={rows}
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={noopAction}
      />,
    );

    expect(screen.getByText("1回戦 第1試合")).toBeInTheDocument();
    expect(screen.getByText("山田 vs 佐藤")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
  });

  it("保存で matchId と入力した番号が送られる", async () => {
    const user = userEvent.setup();
    render(
      <MatchNumberList
        rows={[rows[0]]}
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={noopAction}
      />,
    );

    const input = screen.getByLabelText("1回戦 第1試合の試合番号");
    await user.clear(input);
    await user.type(input, "A");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const sent = noopAction.mock.calls[0][1];
    expect(sent.get("matchId")).toBe("m1-0");
    expect(sent.get("matchNumber")).toBe("A");
    expect(sent.get("slug")).toBe("org");
    expect(sent.get("tournamentId")).toBe("t1");
    expect(sent.get("divisionId")).toBe("d1");
  });

  it("試合が無ければ案内だけ出す", () => {
    render(
      <MatchNumberList
        rows={[]}
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={noopAction}
      />,
    );
    expect(screen.getByText("まだ組み合わせがありません")).toBeInTheDocument();
  });
});
```

Run: `pnpm test src/components/division/MatchNumberList.test.tsx`
Expected: FAIL（ファイルが無い）

- [ ] **Step 4: コンポーネントを実装**

`src/components/division/MatchNumberList.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { MatchNumberRowView } from "@/features/division/single-elimination/view";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 1 行 1 フォーム。useActionState を行ごとに持たせ、エラーをその行の隣に出す。
 * 試合番号は組み合わせの構造を変えないため、勝敗記録後も編集できる
 * （disabled を受け取らないのは意図）。
 */
function MatchNumberRow({
  row,
  slug,
  tournamentId,
  divisionId,
  action,
}: {
  row: MatchNumberRowView;
  slug: string;
  tournamentId: string;
  divisionId: string;
  action: DivisionFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <li className="flex items-center justify-between gap-4 rounded border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{row.label}</p>
        <p className="truncate text-xs text-slate-500">{row.card}</p>
      </div>

      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <input type="hidden" name="matchId" value={row.matchId} />
        <input
          type="text"
          name="matchNumber"
          defaultValue={row.matchNumber}
          aria-label={`${row.label}の試合番号`}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
        />
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
    </li>
  );
}

export function MatchNumberList({
  rows,
  slug,
  tournamentId,
  divisionId,
  action,
}: {
  rows: MatchNumberRowView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  action: DivisionFormAction;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-600">まだ組み合わせがありません</p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <MatchNumberRow
          key={row.matchId}
          row={row}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={divisionId}
          action={action}
        />
      ))}
    </ul>
  );
}
```

Run: `pnpm test src/components/division/MatchNumberList.test.tsx`
Expected: PASS

- [ ] **Step 5: DivisionSetup とページに配線**

`src/components/division/DivisionSetup.tsx`:

1. `DivisionSetupActions` に `setMatchNumber: DivisionFormAction;` を追加。
2. import に `toMatchNumberView` と `MatchNumberList` を追加。
3. 「組み合わせ」セクションと「プレビュー」セクションの間に追加:

```tsx
<section className="space-y-3">
  <h2 className="text-sm font-bold text-slate-700">試合番号</h2>
  {/* 番号の変更は構造を変えないため、locked でも編集できる */}
  <MatchNumberList
    rows={toMatchNumberView(
      parsed.matchingConfig,
      parsed.entries,
      participants,
    )}
    slug={slug}
    tournamentId={tournamentId}
    divisionId={division.id}
    action={actions.setMatchNumber}
  />
</section>
```

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`:

```tsx
import { setMatchNumberAction } from "@/features/division/set-match-number/handler";
// actions に追加
actions={{
  addEntry: addEntryAction,
  removeEntry: removeEntryAction,
  reorderEntry: reorderEntryAction,
  generateMatching: generateMatchingAction,
  swapSlots: swapSlotsAction,
  setMatchNumber: setMatchNumberAction,
}}
```

`DivisionSetup.test.tsx` が `actions` の全プロパティを要求する型なら、テスト側の fixture にも `setMatchNumber` のスタブを追加する。

- [ ] **Step 6: 確認とコミット**

Run: `pnpm test src/components src/features/division && pnpm typecheck`
Expected: 全 PASS

```bash
pnpm lint:fix
git add -A
git commit -m "feat(division): edit match numbers from the setup screen"
```

---

### Task 6: `Participant.playerNumber` 列の追加とデフォルト採番

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_participant_player_number/migration.sql`（`--create-only` で生成して編集）
- Modify: `src/features/division/add-entry/repository.ts`
- Modify: `src/features/division/repository.ts`（`DivisionParticipant` と `listParticipantsInTournament`）
- Test: `src/features/division/add-entry/repository.test.ts`

**Interfaces:**
- Produces: `Participant.playerNumber: String`（必須・一意制約なし）。`DivisionParticipant` に `playerNumber: string` が増える。新規 Participant 作成時は「同大会で 10 進整数として読める playerNumber の最大値 + 1（無ければ 1）」の文字列を採番。

- [ ] **Step 1: スキーマを変更してマイグレーションを作る**

`prisma/schema.prisma` の `Participant` に追加:

```prisma
model Participant {
  id           String   @id @default(uuid())
  tournamentId String
  memberId     String
  seed         Int?
  team         String?
  /// 選手番号。表示用の文字列で、デフォルトはアプリ側が振る 1 始まりの連番。
  /// 一意制約は付けない（重複は保存時に確認を挟んで許す）。
  playerNumber String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  ...（既存の relation / index はそのまま）
}
```

Run: `pnpm exec prisma migrate dev --create-only --name add_participant_player_number`

生成された `migration.sql` を既存行のバックフィル込みに書き換える:

```sql
-- 列を一旦 NULL 許容で足し、大会ごとに createdAt 順の連番で埋めてから NOT NULL にする。
ALTER TABLE "Participant" ADD COLUMN "playerNumber" TEXT;

UPDATE "Participant" AS p
SET "playerNumber" = numbered.rn::text
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tournamentId"
      ORDER BY "createdAt", "id"
    ) AS rn
  FROM "Participant"
) AS numbered
WHERE p."id" = numbered."id";

ALTER TABLE "Participant" ALTER COLUMN "playerNumber" SET NOT NULL;
```

Run: `pnpm db:migrate`（適用）→ `pnpm exec prisma generate` は postinstall/migrate が走らせるが、型が古ければ手動実行。
Expected: マイグレーション成功、`src/generated/prisma` に `playerNumber` が現れる。

- [ ] **Step 2: 採番の失敗するテストを書く**

`src/features/division/add-entry/repository.test.ts` に追記。既存の `tx` モックに `participant.findMany` を足す:

```ts
const participantFindMany = vi.fn();
// tx の participant に追加:
//   findMany: (args: unknown) => participantFindMany(args),
// beforeEach に追加:
//   participantFindMany.mockReset();
//   participantFindMany.mockResolvedValue([]);
```

```ts
describe("playerNumber の採番", () => {
  it("最初の参加者は 1", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindMany.mockResolvedValue([]);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    await callMutate(empty);

    expect(participantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ playerNumber: "1" }),
      }),
    );
  });

  it("数値として読める最大の番号 + 1 を振る", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindMany.mockResolvedValue([
      { playerNumber: "2" },
      { playerNumber: "10" },
    ]);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    await callMutate(empty);

    expect(participantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ playerNumber: "11" }),
      }),
    );
  });

  it("数値でない番号は最大値の計算から除外する", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindMany.mockResolvedValue([
      { playerNumber: "A-99" },
      { playerNumber: "3" },
    ]);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    await callMutate(empty);

    expect(participantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ playerNumber: "4" }),
      }),
    );
  });

  it("既存の Participant を使い回すときは採番しない", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue({ id: "p1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    await callMutate(empty);

    expect(participantCreate).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm test src/features/division/add-entry/repository.test.ts`
Expected: FAIL（playerNumber を渡していない）

- [ ] **Step 3: 採番を実装**

`src/features/division/add-entry/repository.ts` の `resolveParticipantId` を変更:

```ts
/**
 * 次の選手番号。同じ大会で 10 進整数として読める番号の最大値 + 1。
 * 手入力の "A-1" のような番号は序数を持たないので最大値の計算から外す。
 */
const nextPlayerNumber = async (
  tx: DivisionSetupTx,
  tournamentId: string,
): Promise<string> => {
  const rows = await tx.participant.findMany({
    where: { tournamentId },
    select: { playerNumber: true },
  });
  const max = rows.reduce(
    (acc, row) =>
      /^\d+$/.test(row.playerNumber)
        ? Math.max(acc, Number(row.playerNumber))
        : acc,
    0,
  );
  return String(max + 1);
};

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
    data: {
      tournamentId,
      memberId,
      playerNumber: await nextPlayerNumber(tx, tournamentId),
    },
    select: { id: true },
  });
  return created.id;
};
```

（`resolveParticipantId` の既存 doc コメント「seed は付けない〜」はそのまま残す。）

- [ ] **Step 4: DivisionParticipant に playerNumber を通す**

`src/features/division/repository.ts`:

```ts
export type DivisionParticipant = {
  id: string;
  name: string;
  nameKana: string;
  /** 選手番号。大会単位で Participant が持つ */
  playerNumber: string;
  team?: string;
};
```

`listParticipantsInTournament` の select に `playerNumber: true` を追加し、map で `playerNumber: row.playerNumber` を通す。

`DivisionParticipant` を組み立てているテスト fixture（`EntryList.test.tsx`, `DivisionSetup.test.tsx` など）に `playerNumber: "1"` を追加して typecheck を通す。

- [ ] **Step 5: 確認とコミット**

Run: `pnpm test && pnpm typecheck`
Expected: 全 PASS

```bash
pnpm lint:fix
git add -A
git commit -m "feat(participant): add playerNumber with sequential default"
```

---

### Task 7: `set-player-number` スライス（確認フロー付き）

**Files:**
- Modify: `src/features/division/errors.ts`
- Modify: `src/features/division/messages.ts`
- Modify: `src/features/division/state.ts`
- Create: `src/features/division/set-player-number/schema.ts`
- Create: `src/features/division/set-player-number/repository.ts`
- Create: `src/features/division/set-player-number/usecase.ts`
- Create: `src/features/division/set-player-number/handler.ts`
- Test: `src/features/division/set-player-number/schema.test.ts`
- Test: `src/features/division/set-player-number/repository.test.ts`

**Interfaces:**
- Produces: `setPlayerNumberAction: DivisionFormAction`（FormData: slug, tournamentId, divisionId, participantId, playerNumber, confirmedNumber）。`DivisionFormState` に `confirm?: { message: string; value: string }` が増える。新エラー `DivisionParticipantNotFoundError { participantId }`。
- 確認フローの契約: 同大会に同じ playerNumber の別 Participant がいる場合、`confirmedNumber !== playerNumber` の送信では更新せず `confirm` を返す。クライアントは `confirm.value` を hidden の `confirmedNumber` として再送し、番号が一致すれば確定する（確認後に番号を変えて送ると確認は無効になる）。

- [ ] **Step 1: エラー型・文言・state を追加**

`src/features/division/errors.ts`:

```ts
/** 指定された参加者がこの大会に無いことを表す。 */
export class DivisionParticipantNotFoundError extends Data.TaggedError(
  "DivisionParticipantNotFoundError",
)<{
  readonly participantId: string;
}> {}
```

union と `divisionErrorTags` にも追記。`src/features/division/messages.ts`:

```ts
Match.tag(
  "DivisionParticipantNotFoundError",
  () => "対象の参加者が見つかりません。画面を再読み込みしてください",
),
```

`src/features/division/state.ts`:

```ts
export type DivisionFormState = {
  error: string | null;
  /**
   * 成功時の補足。削除にともなう組み合わせの再生成などを画面に伝える。
   * 既存 4 スライスは返さないので省略可能にしてある。
   */
  notice?: string;
  /**
   * 重複確認待ち。value は確認対象の入力値。クライアントは value を
   * confirmedNumber として再送し、同じ値のときだけ確定される。
   */
  confirm?: { message: string; value: string };
};
```

Run: `pnpm typecheck` → exit 0

- [ ] **Step 2: schema のテストと実装**

`src/features/division/set-player-number/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { setPlayerNumberSchema } from "./schema";

describe("setPlayerNumberSchema", () => {
  it("前後の空白を除いて受け付ける", () => {
    const parsed = setPlayerNumberSchema.safeParse({
      participantId: "p1",
      playerNumber: " 7 ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.playerNumber).toBe("7");
    }
  });

  it("空白だけの番号は拒否する", () => {
    const parsed = setPlayerNumberSchema.safeParse({
      participantId: "p1",
      playerNumber: " ",
    });
    expect(parsed.success).toBe(false);
  });

  it("participantId が空なら拒否する", () => {
    const parsed = setPlayerNumberSchema.safeParse({
      participantId: "",
      playerNumber: "7",
    });
    expect(parsed.success).toBe(false);
  });

  it("21 文字以上の番号は拒否する", () => {
    const parsed = setPlayerNumberSchema.safeParse({
      participantId: "p1",
      playerNumber: "a".repeat(21),
    });
    expect(parsed.success).toBe(false);
  });
});
```

`src/features/division/set-player-number/schema.ts`:

```ts
import { z } from "zod";

export const setPlayerNumberSchema = z.object({
  participantId: z.string().min(1, "参加者の指定が不正です"),
  playerNumber: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "選手番号を入力してください")
        .max(20, "選手番号は20文字までです"),
    ),
});

export type SetPlayerNumberInput = z.infer<typeof setPlayerNumberSchema>;
```

Run: `pnpm test src/features/division/set-player-number/schema.test.ts`
Expected: PASS

- [ ] **Step 3: repository の失敗するテストを書く**

`src/features/division/set-player-number/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const participantFindFirst = vi.fn();
const participantUpdate = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        participant: {
          findFirst: (args: unknown) => participantFindFirst(args),
          update: (args: unknown) => participantUpdate(args),
        },
      }),
  },
}));

const { setPlayerNumberInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

beforeEach(() => {
  participantFindFirst.mockReset();
  participantUpdate.mockReset();
  participantUpdate.mockResolvedValue({ id: "p1" });
});

describe("setPlayerNumberInDb", () => {
  it("重複が無ければ更新する", async () => {
    // 1 回目: 対象参加者の所有権チェック / 2 回目: 重複チェック
    participantFindFirst
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce(null);

    const outcome = await Effect.runPromise(
      setPlayerNumberInDb(ids, {
        participantId: "p1",
        playerNumber: "7",
        confirmed: false,
      }),
    );

    expect(outcome).toEqual({ found: true, value: { updated: true } });
    expect(participantUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { playerNumber: "7" },
    });
  });

  it("所有権を where に入れて対象を引く", async () => {
    participantFindFirst
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce(null);

    await Effect.runPromise(
      setPlayerNumberInDb(ids, {
        participantId: "p1",
        playerNumber: "7",
        confirmed: false,
      }),
    );

    expect(participantFindFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: "p1",
        tournament: { id: "t1", organizationId: "o1" },
      },
      select: { id: true },
    });
  });

  it("重複があり未確認なら更新せず duplicated を返す", async () => {
    participantFindFirst
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce({ id: "p2" });

    const outcome = await Effect.runPromise(
      setPlayerNumberInDb(ids, {
        participantId: "p1",
        playerNumber: "7",
        confirmed: false,
      }),
    );

    expect(outcome).toEqual({ found: true, value: { updated: false } });
    expect(participantUpdate).not.toHaveBeenCalled();
  });

  it("重複があっても確認済みなら更新する", async () => {
    participantFindFirst
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce({ id: "p2" });

    const outcome = await Effect.runPromise(
      setPlayerNumberInDb(ids, {
        participantId: "p1",
        playerNumber: "7",
        confirmed: true,
      }),
    );

    expect(outcome).toEqual({ found: true, value: { updated: true } });
    expect(participantUpdate).toHaveBeenCalled();
  });

  it("大会に居ない参加者なら DivisionParticipantNotFoundError", async () => {
    participantFindFirst.mockResolvedValueOnce(null);

    const exit = await Effect.runPromiseExit(
      setPlayerNumberInDb(ids, {
        participantId: "p9",
        playerNumber: "7",
        confirmed: false,
      }),
    );

    expect(exit._tag).toBe("Failure");
    expect(participantUpdate).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm test src/features/division/set-player-number/repository.test.ts`
Expected: FAIL（ファイルが無い）

- [ ] **Step 4: repository を実装**

`src/features/division/set-player-number/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import {
  type DivisionError,
  DivisionParticipantNotFoundError,
  toDivisionError,
} from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SetPlayerNumberInput } from "./schema";

/** confirmed は「重複を承知で確定する」。handler が確認フローから導出する。 */
export type SetPlayerNumberCommand = SetPlayerNumberInput & {
  confirmed: boolean;
};

/** updated: false は「重複が見つかったので確認待ち」。 */
export type SetPlayerNumberResult = { updated: boolean };

export type SetPlayerNumberPort = (
  ids: DivisionIds,
  input: SetPlayerNumberCommand,
) => Effect.Effect<DivisionSetupOutcome<SetPlayerNumberResult>, DivisionError>;

/**
 * 選手番号は Participant（大会単位）の属性で Division の Json ではないため、
 * setup-store は使わず Participant を直接更新する。一意制約は無いので
 * 重複チェックと更新を同一トランザクションに入れて確認フローの根拠にする。
 */
export const setPlayerNumberInDb: SetPlayerNumberPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(
        async (tx): Promise<DivisionSetupOutcome<SetPlayerNumberResult>> => {
          const participant = await tx.participant.findFirst({
            where: {
              id: input.participantId,
              tournament: {
                id: ids.tournamentId,
                organizationId: ids.organizationId,
              },
            },
            select: { id: true },
          });
          if (!participant) {
            throw new DivisionParticipantNotFoundError({
              participantId: input.participantId,
            });
          }

          const duplicate = await tx.participant.findFirst({
            where: {
              tournamentId: ids.tournamentId,
              playerNumber: input.playerNumber,
              id: { not: input.participantId },
            },
            select: { id: true },
          });
          if (duplicate && !input.confirmed) {
            return { found: true, value: { updated: false } };
          }

          await tx.participant.update({
            where: { id: input.participantId },
            data: { playerNumber: input.playerNumber },
          });
          return { found: true, value: { updated: true } };
        },
      ),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
```

Run: `pnpm test src/features/division/set-player-number/repository.test.ts`
Expected: PASS

- [ ] **Step 5: usecase と handler を実装**

`src/features/division/set-player-number/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type {
  SetPlayerNumberCommand,
  SetPlayerNumberPort,
  SetPlayerNumberResult,
} from "./repository";

export const setPlayerNumberForParticipant = (
  port: SetPlayerNumberPort,
  ids: DivisionIds,
  input: SetPlayerNumberCommand,
): Effect.Effect<DivisionSetupOutcome<SetPlayerNumberResult>, DivisionError> =>
  port(ids, input);
```

`src/features/division/set-player-number/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { setPlayerNumberInDb } from "./repository";
import { setPlayerNumberSchema } from "./schema";
import { setPlayerNumberForParticipant } from "./usecase";

export const setPlayerNumberAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = setPlayerNumberSchema.safeParse({
    participantId: String(formData.get("participantId") ?? ""),
    playerNumber: String(formData.get("playerNumber") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // 確認フロー: 前回 confirm で返した値と同じ番号の再送だけを「確認済み」と扱う。
  // 確認後に番号を変えて送った場合は改めて確認を求める。
  const confirmedNumber = String(formData.get("confirmedNumber") ?? "");
  const confirmed = confirmedNumber === parsed.data.playerNumber;

  const exit = await Effect.runPromiseExit(
    setPlayerNumberForParticipant(
      setPlayerNumberInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      { ...parsed.data, confirmed },
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  if (!exit.value.value.updated) {
    return {
      error: null,
      confirm: {
        message:
          "同じ番号の選手がすでにいます。もう一度保存すると確定します",
        value: parsed.data.playerNumber,
      },
    };
  }

  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null };
};
```

- [ ] **Step 6: 確認とコミット**

Run: `pnpm test src/features/division && pnpm typecheck`
Expected: 全 PASS

```bash
pnpm lint:fix
git add -A
git commit -m "feat(participant): add set-player-number action with duplicate confirmation"
```

---

### Task 8: エントリー一覧での選手番号の表示・編集

**Files:**
- Create: `src/components/division/PlayerNumberForm.tsx`
- Modify: `src/components/division/EntryList.tsx`
- Modify: `src/components/division/DivisionSetup.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Test: `src/components/division/PlayerNumberForm.test.tsx`
- Modify: `src/components/division/EntryList.test.tsx`

**Interfaces:**
- Consumes: Task 6 の `DivisionParticipant.playerNumber`、Task 7 の `setPlayerNumberAction` と `DivisionFormState.confirm`。
- Produces: `EntryList` の props に `setPlayerNumberAction: DivisionFormAction` が増える。`DivisionSetupActions` に `setPlayerNumber: DivisionFormAction` が増える。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/PlayerNumberForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DivisionFormState } from "@/features/division/state";
import { PlayerNumberForm } from "./PlayerNumberForm";

describe("PlayerNumberForm", () => {
  it("participantId と入力した番号を送る", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (_state: DivisionFormState, _data: FormData) => ({
        error: null,
      }),
    );
    render(
      <PlayerNumberForm
        participantId="p1"
        playerNumber="1"
        participantName="山田"
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={action}
      />,
    );

    const input = screen.getByLabelText("山田の選手番号");
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const sent = action.mock.calls[0][1];
    expect(sent.get("participantId")).toBe("p1");
    expect(sent.get("playerNumber")).toBe("10");
    expect(sent.get("confirmedNumber")).toBe("");
  });

  it("確認待ちの state ではメッセージを出し confirmedNumber を積む", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (_state: DivisionFormState, _data: FormData): Promise<DivisionFormState> => ({
        error: null,
        confirm: {
          message: "同じ番号の選手がすでにいます。もう一度保存すると確定します",
          value: "10",
        },
      }),
    );
    render(
      <PlayerNumberForm
        participantId="p1"
        playerNumber="1"
        participantName="山田"
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={action}
      />,
    );

    const input = screen.getByLabelText("山田の選手番号");
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText(
        "同じ番号の選手がすでにいます。もう一度保存すると確定します",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));
    const second = action.mock.calls[1][1];
    expect(second.get("confirmedNumber")).toBe("10");
  });
});
```

`src/components/division/EntryList.test.tsx` に追記（fixture の `DivisionParticipant` は Task 6 で `playerNumber` を持っている）:

```tsx
it("選手番号の編集フォームを行ごとに出す", () => {
  // 既存の render ヘルパーに setPlayerNumberAction のスタブを渡す
  expect(screen.getByLabelText(`${participants[0].name}の選手番号`)).toHaveValue(
    participants[0].playerNumber,
  );
});
```

Run: `pnpm test src/components/division/PlayerNumberForm.test.tsx src/components/division/EntryList.test.tsx`
Expected: FAIL

- [ ] **Step 2: PlayerNumberForm を実装**

`src/components/division/PlayerNumberForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 選手番号のインライン編集。重複時はサーバが confirm を返すので、
 * その値を confirmedNumber として次の送信に積む。番号を変えて送り直すと
 * サーバ側で不一致になり、改めて確認が求められる。
 */
export function PlayerNumberForm({
  participantId,
  playerNumber,
  participantName,
  slug,
  tournamentId,
  divisionId,
  action,
}: {
  participantId: string;
  playerNumber: string;
  participantName: string;
  slug: string;
  tournamentId: string;
  divisionId: string;
  action: DivisionFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <input type="hidden" name="participantId" value={participantId} />
        <input
          type="hidden"
          name="confirmedNumber"
          value={state.confirm?.value ?? ""}
        />
        <label className="text-xs text-slate-500" htmlFor={`pn-${participantId}`}>
          選手番号
        </label>
        <input
          id={`pn-${participantId}`}
          type="text"
          name="playerNumber"
          defaultValue={playerNumber}
          aria-label={`${participantName}の選手番号`}
          className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
        >
          保存
        </button>
      </div>
      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state.confirm !== undefined && (
        <output className="text-xs text-amber-700">
          {state.confirm.message}
        </output>
      )}
    </form>
  );
}
```

- [ ] **Step 3: EntryList と DivisionSetup に配線**

`src/components/division/EntryList.tsx`:

1. props に `setPlayerNumberAction: DivisionFormAction;` を追加。
2. 名前ブロックに選手番号を表示し、行のアクション側に `PlayerNumberForm` を追加:

```tsx
<div>
  {/* 参加者を引けなくても行は出す。編集を続けられる方がよい。 */}
  <p className="font-medium text-slate-800">
    {participant !== undefined && (
      <span className="mr-2 text-xs text-slate-500">
        No.{participant.playerNumber}
      </span>
    )}
    {participant?.name ?? "（不明な参加者）"}
  </p>
  {participant !== undefined && (
    <p className="text-xs text-slate-500">{participant.nameKana}</p>
  )}
</div>

<div className="flex items-center gap-3">
  {participant !== undefined && (
    <PlayerNumberForm
      participantId={participant.id}
      playerNumber={participant.playerNumber}
      participantName={participant.name}
      slug={slug}
      tournamentId={tournamentId}
      divisionId={divisionId}
      action={setPlayerNumberAction}
    />
  )}
  <EntryRowActions ... （既存のまま） />
</div>
```

3. 一覧の注記に 1 行追加:

```tsx
<p className="text-xs text-slate-500">
  削除すると組み合わせが変わることがあります。選手番号は大会内で共通のため、
  変更は他の部門にも反映されます
</p>
```

`src/components/division/DivisionSetup.tsx`:

1. `DivisionSetupActions` に `setPlayerNumber: DivisionFormAction;` を追加。
2. `EntryList` に `setPlayerNumberAction={actions.setPlayerNumber}` を渡す。

`setup/page.tsx`:

```tsx
import { setPlayerNumberAction } from "@/features/division/set-player-number/handler";
// actions に追加
setPlayerNumber: setPlayerNumberAction,
```

`DivisionSetup.test.tsx` の actions fixture にも `setPlayerNumber` のスタブを追加する。

- [ ] **Step 4: 確認とコミット**

Run: `pnpm test src/components && pnpm typecheck`
Expected: 全 PASS

```bash
pnpm lint:fix
git add -A
git commit -m "feat(division): edit player numbers from the entry list"
```

---

### Task 9: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テスト・型・lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: すべて exit 0。失敗したら該当 Task に戻って直す（superpowers:verification-before-completion に従い、出力を確認してから完了を宣言する）。

- [ ] **Step 2: 手動確認（ローカル）**

`BYPASS_AUTH=1` で `pnpm dev` を起動し、Cookie に `USER_ID=1` を設定して確認する:

1. 部門セットアップでエントリーを 3 人追加 → 組み合わせを生成 → 「試合番号」一覧に 1〜3 が振られている。
2. 試合番号を "A" に変更 → プレビューの MatchCard 左上に "A" が出る。別の試合に "A" を付けようとするとエラー。
3. エントリー一覧に No.1〜3 が出る。番号を既存と重複させて保存 → 確認メッセージ → もう一度保存で確定。
4. エントリーを 1 人追加 → 試合番号が連番で振り直される。

- [ ] **Step 3: 完了報告**

superpowers:finishing-a-development-branch に従い、マージ／PR の選択肢を提示する。
