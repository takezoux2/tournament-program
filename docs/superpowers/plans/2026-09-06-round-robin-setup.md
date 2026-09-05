# リーグ（総当たり）編集画面 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `DivisionFormat.ROUND_ROBIN` の部門について、エントリーと総当たり対戦表を編集できる専用画面（`/divisions/[divisionId]/league`）を作る。

**Architecture:** 円卓法で対戦表を組む純粋ドメイン `features/division/round-robin/` を新設し、`matching-strategy.ts` に「形式ごとに組み合わせをどう作り直すか」の分岐を閉じ込める。エントリー編集の 5 スライスは `setup-store.ts` の形式チェックを広げるだけで両形式に効くようにし、新しいスライスは作らない。画面は既存の `/setup`（トーナメント専用）とは別 URL に置き、`EntryList` / `AddEntryForm` など形式に依存しないコンポーネントを再利用する。

**Tech Stack:** Next.js 16 (App Router, Server Actions) / React 19 / TypeScript / Prisma 7 / Effect / Zod 4 / Vitest + Testing Library / Biome

設計書: `docs/superpowers/specs/2026-09-05-round-robin-setup-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`pnpm test` / `pnpm typecheck` / `pnpm lint` を使う。
- 単体テストは `pnpm exec vitest run <path>` で個別に実行できる。
- 新規ファイルのコメントは**日本語**で、「なぜそうしたか」を書く。既存ファイル群の密度に合わせる（`src/features/division/setup-store.ts` が見本）。
- `src/features/` 配下に `.tsx` は置かない。画面のコンポーネントは `src/components/` に置く。
- `features` は同列・下位のディレクトリに依存しない。共有したいものは `src/lib/` へ下ろす。
- Server Action は冒頭で `requireOrganization(slug)` を独立に呼ぶ。所有権チェックはクエリの `where` に入れる。
- 対応形式は `SINGLE_ELIMINATION` と `ROUND_ROBIN` の 2 つ。ダブルエリミネーション 2 種は未対応のまま。
- ROUND_ROBIN のエントリー上限は **16 人**。SINGLE_ELIMINATION は **128 人**のまま。
- リーグの試合 id は `r{節}-{節内の位置}`。トーナメントの `m{round}-{order}` と接頭辞を変える。
- 奇数人の「休み」は `matchingConfig` に試合として保存しない。
- Windows のチェックアウトのため、Biome が CRLF 由来のエラーを大量に出すことがある。lint は**変更した内容**で判断する。
- コミットメッセージの末尾に必ず付ける:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: 円卓法の純粋ドメイン

**Files:**
- Create: `src/features/division/round-robin/build.ts`
- Test: `src/features/division/round-robin/build.test.ts`

**Interfaces:**
- Consumes: `DivisionEntry` / `BracketMatch` / `MatchingConfig`（`src/lib/division/types.ts`）
- Produces:
  - `circleRounds(count: number): [number, number][][]`
  - `buildRoundRobin(entries: DivisionEntry[]): MatchingConfig`
  - `isRoundRobinShape(config: MatchingConfig): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/round-robin/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntry } from "@/lib/division/types";
import { buildRoundRobin, circleRounds, isRoundRobinShape } from "./build";

/** seed 0..n-1 のエントリーを n 件作る。id は e1..en。 */
const entriesOf = (count: number): DivisionEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  }));

/** 組を "a-b"（小さい添字が先）の文字列にして比較しやすくする。 */
const pairKey = ([left, right]: [number, number]): string =>
  left < right ? `${left}-${right}` : `${right}-${left}`;

describe("circleRounds", () => {
  it("2 人未満は組を作らない", () => {
    expect(circleRounds(0)).toEqual([]);
    expect(circleRounds(1)).toEqual([]);
  });

  it("2 人は 1 節 1 試合", () => {
    expect(circleRounds(2)).toEqual([[[0, 1]]]);
  });

  it("偶数人は n-1 節で、各節に全員が 1 回ずつ出る", () => {
    const rounds = circleRounds(4);
    expect(rounds).toHaveLength(3);
    for (const pairs of rounds) {
      expect(pairs).toHaveLength(2);
      expect(pairs.flat().sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it("偶数人の割り当ては固定席と回転から決まる", () => {
    // 設計書の 4 人の例。回転の向きを変えると割り当てが変わるので固定する。
    expect(circleRounds(4)).toEqual([
      [
        [0, 3],
        [1, 2],
      ],
      [
        [0, 2],
        [3, 1],
      ],
      [
        [0, 1],
        [2, 3],
      ],
    ]);
  });

  it("奇数人は n 節で、各節にちょうど 1 人が休む", () => {
    const rounds = circleRounds(5);
    expect(rounds).toHaveLength(5);
    for (const pairs of rounds) {
      // 5 人なら 2 試合 = 4 人ぶんで、残り 1 人が休み。
      expect(pairs).toHaveLength(2);
      expect(new Set(pairs.flat()).size).toBe(4);
    }
  });

  it("奇数人でも架空の 1 人は組に現れない", () => {
    for (const pair of circleRounds(5).flat()) {
      expect(pair[0]).toBeLessThan(5);
      expect(pair[1]).toBeLessThan(5);
    }
  });

  it("全ペアがちょうど 1 回ずつ現れる", () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      const keys = circleRounds(count).flat().map(pairKey);
      expect(keys).toHaveLength((count * (count - 1)) / 2);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("同じ節に同じ人が 2 回出ない", () => {
    for (const count of [4, 5, 6, 7]) {
      for (const pairs of circleRounds(count)) {
        const seats = pairs.flat();
        expect(new Set(seats).size).toBe(seats.length);
      }
    }
  });
});

describe("buildRoundRobin", () => {
  it("2 人未満は空の組み合わせを返す", () => {
    expect(buildRoundRobin(entriesOf(1))).toEqual({ version: 1, matches: [] });
    expect(buildRoundRobin([])).toEqual({ version: 1, matches: [] });
  });

  it("試合数は n(n-1)/2 になる", () => {
    expect(buildRoundRobin(entriesOf(4)).matches).toHaveLength(6);
    expect(buildRoundRobin(entriesOf(5)).matches).toHaveLength(10);
  });

  it("round は節番号、order は節内の位置、id は r{節}-{位置}", () => {
    const { matches } = buildRoundRobin(entriesOf(4));
    expect(matches.map((match) => match.id)).toEqual([
      "r1-0",
      "r1-1",
      "r2-0",
      "r2-1",
      "r3-0",
      "r3-1",
    ]);
    expect(matches[2].round).toBe(2);
    expect(matches[2].order).toBe(0);
  });

  it("matchNumber は全節を通した連番", () => {
    expect(
      buildRoundRobin(entriesOf(4)).matches.map((match) => match.matchNumber),
    ).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("スロットは両方とも entry で、bracket は winners 固定", () => {
    for (const match of buildRoundRobin(entriesOf(5)).matches) {
      expect(match.bracket).toBe("winners");
      expect(match.slots[0].kind).toBe("entry");
      expect(match.slots[1].kind).toBe("entry");
    }
  });

  it("シード順で組む。配列の並びではなく seed を見る", () => {
    // 逆順に渡しても seed 昇順で組むので、結果は entriesOf(4) と同じになる。
    const reversed = [...entriesOf(4)].reverse();
    expect(buildRoundRobin(reversed)).toEqual(buildRoundRobin(entriesOf(4)));
  });

  it("設計書の 4 人の例どおりに組む", () => {
    const cards = buildRoundRobin(entriesOf(4)).matches.map((match) =>
      match.slots.map((slot) =>
        slot.kind === "entry" ? slot.entryId : slot.kind,
      ),
    );
    expect(cards).toEqual([
      ["e1", "e4"],
      ["e2", "e3"],
      ["e1", "e3"],
      ["e4", "e2"],
      ["e1", "e2"],
      ["e3", "e4"],
    ]);
  });

  it("奇数人の休みは試合として保存しない", () => {
    // 5 人なら 5 節 10 試合。BYE スロットは 1 つも出ない。
    const { matches } = buildRoundRobin(entriesOf(5));
    expect(matches).toHaveLength(10);
    expect(
      matches.some((match) =>
        match.slots.some((slot) => slot.kind === "bye"),
      ),
    ).toBe(false);
  });

  it("同じ入力からは同じ id が出る", () => {
    expect(buildRoundRobin(entriesOf(6))).toEqual(
      buildRoundRobin(entriesOf(6)),
    );
  });
});

describe("isRoundRobinShape", () => {
  it("全スロットが entry なら true", () => {
    expect(isRoundRobinShape(buildRoundRobin(entriesOf(4)))).toBe(true);
  });

  it("空の組み合わせは true（まだ作っていないだけ）", () => {
    expect(isRoundRobinShape({ version: 1, matches: [] })).toBe(true);
  });

  it("winnerOf を含むトーナメントの木は false", () => {
    expect(
      isRoundRobinShape({
        version: 1,
        matches: [
          {
            id: "m2-0",
            bracket: "winners",
            round: 2,
            order: 0,
            matchNumber: "3",
            slots: [
              { kind: "winnerOf", matchId: "m1-0" },
              { kind: "winnerOf", matchId: "m1-1" },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("bye を含む木も false", () => {
    expect(
      isRoundRobinShape({
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchNumber: "1",
            slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
          },
        ],
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/features/division/round-robin/build.test.ts`
Expected: FAIL —`Failed to resolve import "./build"`

- [ ] **Step 3: 実装する**

`src/features/division/round-robin/build.ts`:

```ts
import type {
  BracketMatch,
  DivisionEntry,
  MatchingConfig,
} from "@/lib/division/types";

/**
 * 円卓法（サークル法）の節ごとの組を返す。数値は「seed 昇順に並べた
 * エントリー配列の添字」で、エントリー id ではない。
 *
 * 先頭の席を固定し、残りを 1 つずつ回転させながら向かい合う席と組む。
 * 奇数人のときは架空の 1 人を末尾（添字 count）に足して偶数にし、
 * その相手に当たった人はその節を休む（＝その組は返さない）。
 * この作り方だと全ペアがちょうど 1 回ずつ現れ、同じ節に同じ人が
 * 2 回出ないことが構造的に保証される。
 *
 * 2 人未満は対戦が成立しないので空を返す。
 */
export const circleRounds = (count: number): [number, number][][] => {
  if (count < 2) {
    return [];
  }

  // 奇数なら架空の 1 人を足す。添字 count がその 1 人で、実在しない。
  const size = count % 2 === 0 ? count : count + 1;
  const rotating = Array.from({ length: size - 1 }, (_, index) => index + 1);
  const rounds: [number, number][][] = [];

  for (let round = 0; round < size - 1; round += 1) {
    // 右へ round 回転させた並び。固定席 0 と合わせて 1 節ぶんの席順になる。
    const seats = [
      0,
      ...rotating.map(
        (_, index) =>
          rotating[(index - round + rotating.length) % rotating.length],
      ),
    ];

    const pairs: [number, number][] = [];
    for (let index = 0; index < size / 2; index += 1) {
      const left = seats[index];
      const right = seats[size - 1 - index];
      // 架空の 1 人が入る組は試合にしない。保存すると大会の進行順画面に
      // 実在しない試合の行が出てしまう。
      if (left < count && right < count) {
        pairs.push([left, right]);
      }
    }
    rounds.push(pairs);
  }

  return rounds;
};

/**
 * 試合 id。節と節内の位置だけから決まるので、組み立て直しても同じ id になる。
 * 接頭辞を single-elimination の `m{round}-{order}` と変えてあるのは、
 * 形式を取り違えたデータが混ざったときに見分けられるようにするため。
 */
const matchId = (round: number, order: number): string => `r${round}-${order}`;

/**
 * エントリーのシード順から総当たりの組み合わせを組み立てる。
 * 2 人未満なら空を返す。呼び出し側はそれを「作れなかった」と読める。
 */
export const buildRoundRobin = (entries: DivisionEntry[]): MatchingConfig => {
  const sorted = [...entries].sort((left, right) => left.seed - right.seed);
  const matches: BracketMatch[] = [];

  circleRounds(sorted.length).forEach((pairs, index) => {
    const round = index + 1;
    pairs.forEach(([left, right], order) => {
      matches.push({
        id: matchId(round, order),
        bracket: "winners",
        round,
        order,
        matchNumber: String(matches.length + 1),
        slots: [
          { kind: "entry", entryId: sorted[left].id },
          { kind: "entry", entryId: sorted[right].id },
        ],
      });
    });
  });

  return { version: 1, matches };
};

/**
 * 保存されている組み合わせがリーグの形をしているか。
 *
 * 部門の編集画面（/edit）は format を無条件に書き換えられるため、
 * トーナメントで組んだ木を持ったまま ROUND_ROBIN になった部門が存在しうる。
 * その木は winnerOf や bye を含むので、全スロットが entry かどうかで見分けられる。
 * 空の組み合わせは「まだ作っていない」であって形が違うわけではないので true。
 */
export const isRoundRobinShape = (config: MatchingConfig): boolean =>
  config.matches.every((match) =>
    match.slots.every((slot) => slot.kind === "entry"),
  );
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/round-robin/build.test.ts`
Expected: PASS（全 20 件）

- [ ] **Step 5: コミット**

```bash
git add src/features/division/round-robin
git commit -m "$(cat <<'EOF'
feat(division): build round-robin matchings with the circle method

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 試合の位置文言を節に対応させる

リーグの対戦表を作ると、その試合は大会の進行順画面が自動的に拾う。位置の文言が
`${round}回戦` 固定のままだと、節が「1回戦」と表示されて事実と食い違う。

**Files:**
- Modify: `src/lib/division/label.ts:61-62`
- Modify: `src/lib/division/label.test.ts`
- Modify: `src/features/division/single-elimination/view.ts:114`
- Modify: `src/features/schedule/types.ts:13-20`
- Modify: `src/features/schedule/repository.ts:31-55`
- Modify: `src/features/schedule/domain.ts:71`
- Modify: `src/features/schedule/domain.test.ts:34-60`
- Modify: `src/features/schedule/repository.test.ts:46-48`
- Modify: `src/features/schedule/schedule-store.test.ts:65-67`

**Interfaces:**
- Produces: `matchPositionLabel(match: BracketMatch, format: DivisionFormat): string`
- Produces: `ScheduleDivision` に `format: DivisionFormat` が増える

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/label.test.ts` の末尾に追記する（既存の `describe("matchPositionLabel")` があればその中に足す。無ければこの describe ごと足す）:

```ts
describe("matchPositionLabel（形式ごとの文言）", () => {
  const match = {
    id: "x1-0",
    bracket: "winners",
    round: 2,
    order: 1,
    matchNumber: "5",
    slots: [
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
    ],
  } as const;

  it("トーナメントは回戦で表す", () => {
    expect(matchPositionLabel(match, "SINGLE_ELIMINATION")).toBe(
      "2回戦 第2試合",
    );
  });

  it("リーグは節で表す", () => {
    // リーグの round は節番号。「2回戦」と出すと進行順画面が嘘をつく。
    expect(matchPositionLabel(match, "ROUND_ROBIN")).toBe("第2節 第2試合");
  });
});
```

`src/features/schedule/domain.test.ts` に追記する:

```ts
it("リーグの部門は節の文言で並べる", () => {
  const league: ScheduleDivision = {
    id: "dL",
    name: "リーグ",
    order: 2,
    format: "ROUND_ROBIN",
    entries: {
      version: 1,
      entries: [
        { id: "g1", participantId: "p1", seed: 0 },
        { id: "g2", participantId: "p2", seed: 1 },
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
          matchNumber: "1",
          slots: [
            { kind: "entry", entryId: "g1" },
            { kind: "entry", entryId: "g2" },
          ],
        },
      ],
    },
  };

  const rows = buildScheduleView([league], participants, []);

  expect(rows).toHaveLength(1);
  expect(rows[0].kind).toBe("match");
  expect(rows[0].kind === "match" && rows[0].label).toBe("第1節 第1試合");
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/lib/division/label.test.ts src/features/schedule/domain.test.ts`
Expected: FAIL — `matchPositionLabel` が引数を 1 つしか取らない型エラー、および `ScheduleDivision` に `format` が無いエラー

- [ ] **Step 3: 実装する**

`src/lib/division/label.ts` — 先頭の import に足す:

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
```

末尾の `matchPositionLabel` を置き換える:

```ts
/**
 * 「1回戦 第1試合」のような構造上の位置。
 * リーグの round は節番号なので、形式によって数え方の言葉を変える。
 * 形式を引数に取るのは、この関数が大会の進行順（複数の部門が混ざる）でも
 * 使われるため。呼び出し側がその試合の部門の形式を知っている。
 */
export const matchPositionLabel = (
  match: BracketMatch,
  format: DivisionFormat,
): string =>
  format === "ROUND_ROBIN"
    ? `第${match.round}節 第${match.order + 1}試合`
    : `${match.round}回戦 第${match.order + 1}試合`;
```

`src/features/division/single-elimination/view.ts` — `toMatchNumberView` の中の呼び出しを変える。このモジュールは扱う形式が決まっているので、引数では受け取らず定数を渡す:

```ts
      label: matchPositionLabel(match, "SINGLE_ELIMINATION"),
```

`src/features/schedule/types.ts` — 先頭の import と `ScheduleDivision` を変える:

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
```

```ts
/** マージの材料になる部門。Json は検証済みの形で受け取る。 */
export type ScheduleDivision = {
  id: string;
  name: string;
  /** 大会内での表示順。行の無い試合を末尾へ足すときの並び順に使う。 */
  order: number;
  /** 試合の位置の文言（回戦か節か）を決めるのに使う。 */
  format: DivisionFormat;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
};
```

`src/features/schedule/repository.ts` — `loadDivisions` の `select` と写し取りに `format` を足す:

```ts
    select: {
      id: true,
      name: true,
      order: true,
      format: true,
      entries: true,
      matchingConfig: true,
    },
```

```ts
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    order: row.order,
    format: row.format,
    entries: parseDivisionEntries(row.entries),
    matchingConfig: parseMatchingConfig(row.matchingConfig),
  }));
```

`src/features/schedule/domain.ts` — `buildMatchRows` の中の呼び出しを変える:

```ts
            label: matchPositionLabel(match, division.format),
```

- [ ] **Step 4: 既存のテスト用データに format を足す**

`src/features/schedule/domain.test.ts` の `divisionA` と `divisionB` に足す:

```ts
const divisionA: ScheduleDivision = {
  id: "dA",
  name: "男子",
  order: 0,
  format: "SINGLE_ELIMINATION",
  entries: {
```

```ts
const divisionB: ScheduleDivision = {
  id: "dB",
  name: "女子",
  order: 1,
  format: "SINGLE_ELIMINATION",
  entries: {
```

`src/features/schedule/repository.test.ts` の `divisionFindMany.mockResolvedValue`:

```ts
  divisionFindMany.mockResolvedValue([
    {
      id: "dA",
      name: "男子",
      order: 0,
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig,
    },
  ]);
```

`src/features/schedule/schedule-store.test.ts` の `divisionFindMany.mockResolvedValue` にも同じ形で `format: "SINGLE_ELIMINATION"` を足す。

- [ ] **Step 5: テストと型検査が通ることを確認する**

Run: `pnpm exec vitest run src/lib/division src/features/schedule src/features/division/single-elimination`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラー 0 件

- [ ] **Step 6: コミット**

```bash
git add src/lib/division src/features/schedule src/features/division/single-elimination
git commit -m "$(cat <<'EOF'
feat(division): label round-robin matches by matchday, not by round

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: リーグの表示用ビュー

**Files:**
- Create: `src/features/division/match-number-view.ts`
- Create: `src/features/division/round-robin/view.ts`
- Create: `src/features/division/round-robin/view.test.ts`
- Modify: `src/features/division/single-elimination/view.ts`（`MatchNumberRowView` の定義を移す）
- Modify: `src/components/division/MatchNumberList.tsx:3`（import 元を変える）

**Interfaces:**
- Consumes: `buildRoundRobin`（Task 1）、`matchPositionLabel(match, format)`（Task 2）
- Produces:
  - `MatchNumberRowView = { matchId: string; matchNumber: string; label: string; card: string }`（`src/features/division/match-number-view.ts`）
  - `LeagueRoundView = { round: number; matches: MatchNumberRowView[]; restingLabels: string[] }`
  - `toRoundView(config, entries, participants): LeagueRoundView[]`
  - `CrossTableCell` / `CrossTableView`
  - `toCrossTableView(config, entries, participants): CrossTableView`

`participants` の型はどちらも `{ id: string; name: string }[]`（`single-elimination/view.ts` と同じ）。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/round-robin/view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntries, DivisionEntry } from "@/lib/division/types";
import { buildRoundRobin } from "./build";
import { toCrossTableView, toRoundView } from "./view";

const list: DivisionEntry[] = [
  { id: "e1", participantId: "p1", seed: 0 },
  { id: "e2", participantId: "p2", seed: 1 },
  { id: "e3", participantId: "p3", seed: 2 },
  { id: "e4", participantId: "p4", seed: 3 },
];

const entries: DivisionEntries = { version: 1, entries: list };

const participants = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
  { id: "p4", name: "田中" },
];

const config = buildRoundRobin(list);

describe("toRoundView", () => {
  it("節ごとにまとめて、節番号の昇順で返す", () => {
    const rounds = toRoundView(config, entries, participants);
    expect(rounds.map((round) => round.round)).toEqual([1, 2, 3]);
    expect(rounds[0].matches).toHaveLength(2);
  });

  it("位置は節の文言、対戦は名前どうしで表す", () => {
    const rounds = toRoundView(config, entries, participants);
    expect(rounds[0].matches[0].label).toBe("第1節 第1試合");
    expect(rounds[0].matches[0].card).toBe("山田 vs 田中");
    expect(rounds[0].matches[0].matchId).toBe("r1-0");
    expect(rounds[0].matches[0].matchNumber).toBe("1");
  });

  it("偶数人なら休みは居ない", () => {
    for (const round of toRoundView(config, entries, participants)) {
      expect(round.restingLabels).toEqual([]);
    }
  });

  it("奇数人はその節に出ていない人を休みとして返す", () => {
    const odd = list.slice(0, 3);
    const oddEntries: DivisionEntries = { version: 1, entries: odd };
    const rounds = toRoundView(
      buildRoundRobin(odd),
      oddEntries,
      participants,
    );

    expect(rounds).toHaveLength(3);
    for (const round of rounds) {
      expect(round.restingLabels).toHaveLength(1);
    }
    // 3 節を通すと全員が 1 回ずつ休む。
    expect(rounds.flatMap((round) => round.restingLabels).sort()).toEqual([
      "山田",
      "佐藤",
      "鈴木",
    ].sort());
  });

  it("組み合わせが空なら空を返す", () => {
    expect(
      toRoundView({ version: 1, matches: [] }, entries, participants),
    ).toEqual([]);
  });

  it("名前を引けないエントリーも行を落とさない", () => {
    // 参加者一覧が古いだけで編集不能になるのは困る。
    const rounds = toRoundView(config, entries, []);
    expect(rounds[0].matches[0].card).toBe("（不明な参加者） vs （不明な参加者）");
    expect(rounds[0].restingLabels).toEqual([]);
  });
});

describe("toCrossTableView", () => {
  it("見出しはシード順のエントリー", () => {
    const table = toCrossTableView(config, entries, participants);
    expect(table.headers.map((header) => header.label)).toEqual([
      "山田",
      "佐藤",
      "鈴木",
      "田中",
    ]);
    expect(table.rows.map((row) => row.entryId)).toEqual([
      "e1",
      "e2",
      "e3",
      "e4",
    ]);
  });

  it("対角は self", () => {
    const table = toCrossTableView(config, entries, participants);
    expect(table.rows[0].cells[0]).toEqual({ kind: "self" });
    expect(table.rows[2].cells[2]).toEqual({ kind: "self" });
  });

  it("対戦がある組には試合番号が入り、左右対称になる", () => {
    const table = toCrossTableView(config, entries, participants);
    // e1 vs e4 は第1節第1試合 = 通し番号 1。
    expect(table.rows[0].cells[3]).toEqual({ kind: "match", matchNumber: "1" });
    expect(table.rows[3].cells[0]).toEqual({ kind: "match", matchNumber: "1" });
  });

  it("対戦が無い組は none", () => {
    const table = toCrossTableView(
      { version: 1, matches: [] },
      entries,
      participants,
    );
    expect(table.rows[0].cells[1]).toEqual({ kind: "none" });
  });

  it("エントリーが空なら見出しも行も空", () => {
    const table = toCrossTableView(
      { version: 1, matches: [] },
      { version: 1, entries: [] },
      participants,
    );
    expect(table.headers).toEqual([]);
    expect(table.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/features/division/round-robin/view.test.ts`
Expected: FAIL — `Failed to resolve import "./view"`

- [ ] **Step 3: 行の型を共有の場所へ移す**

`src/features/division/match-number-view.ts` を作る:

```ts
/**
 * 試合番号の編集行 1 つぶんの表示内容。
 *
 * トーナメントの試合番号一覧（single-elimination/view.ts）と
 * リーグの節ごとの一覧（round-robin/view.ts）が同じ行を描くため、
 * どちらの祖先でもあるカテゴリ直下に置いて共有する。
 */
export type MatchNumberRowView = {
  /** BracketMatch.id。保存時にこの id を送る */
  matchId: string;
  matchNumber: string;
  /** 「1回戦 第1試合」「第1節 第1試合」のような構造上の位置 */
  label: string;
  /** 「山田 vs 佐藤」のような対戦の表示 */
  card: string;
};
```

`src/features/division/single-elimination/view.ts` — `MatchNumberRowView` の型定義を消し、代わりに import して再エクスポートする（既存の import 元を壊さないため）:

```ts
import type { MatchNumberRowView } from "../match-number-view";

export type { MatchNumberRowView };
```

`src/components/division/MatchNumberList.tsx` の import 元を変える:

```ts
import type { MatchNumberRowView } from "@/features/division/match-number-view";
```

- [ ] **Step 4: ビューを実装する**

`src/features/division/round-robin/view.ts`:

```ts
import {
  createSlotLabeler,
  matchCardLabel,
  matchPositionLabel,
} from "@/lib/division/label";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
import type { MatchNumberRowView } from "../match-number-view";

/** 1 節ぶんの表示内容。 */
export type LeagueRoundView = {
  /** 節番号（1 始まり） */
  round: number;
  matches: MatchNumberRowView[];
  /**
   * その節に試合が無いエントリーの表示名。偶数人なら常に空。
   * 休みは matchingConfig に保存しないので、ここで差分から算出する。
   */
  restingLabels: string[];
};

/** エントリーを seed 昇順に並べ、表示名を解決した一覧を返す。 */
const labeledEntries = (
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): { entryId: string; label: string }[] => {
  const nameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  return [...entries.entries]
    .sort((left, right) => left.seed - right.seed)
    .map((entry) => ({
      entryId: entry.id,
      // 名前を引けなくても行は出す。参加者一覧が古いだけで編集不能に
      // なるのは困る。文言は lib/division/label.ts と揃える。
      label: nameById.get(entry.participantId) ?? "（不明な参加者）",
    }));
};

/**
 * 保存済みの組み合わせを節ごとの一覧に変換する。
 * 節の昇順、節の中は order の昇順。試合番号の編集フォームもこの行を使う。
 */
export const toRoundView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): LeagueRoundView[] => {
  const labelSlot = createSlotLabeler(config, entries, participants);
  const all = labeledEntries(entries, participants);

  const byRound = new Map<number, typeof config.matches>();
  for (const match of config.matches) {
    byRound.set(match.round, [...(byRound.get(match.round) ?? []), match]);
  }

  return [...byRound.keys()]
    .sort((left, right) => left - right)
    .map((round) => {
      const matches = [...(byRound.get(round) ?? [])].sort(
        (left, right) => left.order - right.order,
      );

      const playing = new Set(
        matches.flatMap((match) =>
          match.slots.flatMap((slot) =>
            slot.kind === "entry" ? [slot.entryId] : [],
          ),
        ),
      );

      return {
        round,
        matches: matches.map((match) => ({
          matchId: match.id,
          matchNumber: match.matchNumber,
          label: matchPositionLabel(match, "ROUND_ROBIN"),
          card: matchCardLabel(match, labelSlot),
        })),
        restingLabels: all
          .filter((entry) => !playing.has(entry.entryId))
          .map((entry) => entry.label),
      };
    });
};

/** 星取表の 1 マス。 */
export type CrossTableCell =
  | { kind: "self" }
  | { kind: "match"; matchNumber: string }
  | { kind: "none" };

/** 星取表の全体。headers と各 rows[].cells は同じ並び・同じ長さ。 */
export type CrossTableView = {
  headers: { entryId: string; label: string }[];
  rows: { entryId: string; label: string; cells: CrossTableCell[] }[];
};

/**
 * 誰と誰が当たるかを一目で見せる表。マスには試合番号を入れる。
 * 対戦の向き（どちらがスロット 0 か）は表示上の意味を持たないので、
 * 表は左右対称になる。
 */
export const toCrossTableView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): CrossTableView => {
  const headers = labeledEntries(entries, participants);

  // 「エントリー 2 つの組 → 試合番号」の対照表。キーは順序を持たせない。
  const pairKey = (left: string, right: string): string =>
    left < right ? `${left} ${right}` : `${right} ${left}`;
  const numberByPair = new Map<string, string>();
  for (const match of config.matches) {
    const [first, second] = match.slots;
    if (first.kind === "entry" && second.kind === "entry") {
      numberByPair.set(
        pairKey(first.entryId, second.entryId),
        match.matchNumber,
      );
    }
  }

  return {
    headers,
    rows: headers.map((row) => ({
      entryId: row.entryId,
      label: row.label,
      cells: headers.map((column): CrossTableCell => {
        if (row.entryId === column.entryId) {
          return { kind: "self" };
        }
        const matchNumber = numberByPair.get(
          pairKey(row.entryId, column.entryId),
        );
        return matchNumber === undefined
          ? { kind: "none" }
          : { kind: "match", matchNumber };
      }),
    })),
  };
};
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division src/components/division`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラー 0 件

- [ ] **Step 6: コミット**

```bash
git add src/features/division src/components/division/MatchNumberList.tsx
git commit -m "$(cat <<'EOF'
feat(division): view round-robin matchings by matchday and as a cross table

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 形式別の組み直し規則

format による分岐をこの 1 ファイルに閉じ込める。各スライスは「エントリー配列を
どう変えるか」だけを書き、組み合わせの作り直しはここへ委ねる。

**Files:**
- Create: `src/features/division/matching-strategy.ts`
- Create: `src/features/division/matching-strategy.test.ts`

**Interfaces:**
- Consumes: `buildRoundRobin`（Task 1）、`buildFromSlots` / `toSlots`（`single-elimination/build.ts`）、`generateSlots` / `placeEntry`（`single-elimination/edit.ts`）
- Produces:
  - `EDITABLE_FORMATS` / `EditableFormat` / `isEditableFormat(format: DivisionFormat): format is EditableFormat`
  - `maxEntries(format: EditableFormat): number`
  - `regenerateMatching(format: EditableFormat, entries: DivisionEntry[]): MatchingConfig`
  - `applyEntryAdded(format, current: MatchingConfig, entries: DivisionEntry[], addedEntryId: string): MatchingConfig`
  - `applyEntryReordered(format, current: MatchingConfig, entries: DivisionEntry[]): MatchingConfig`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/matching-strategy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntry, MatchingConfig } from "@/lib/division/types";
import {
  applyEntryAdded,
  applyEntryReordered,
  isEditableFormat,
  maxEntries,
  regenerateMatching,
} from "./matching-strategy";
import { buildRoundRobin } from "./round-robin/build";
import { buildFromSlots } from "./single-elimination/build";
import { generateSlots } from "./single-elimination/edit";

const entriesOf = (count: number): DivisionEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  }));

const EMPTY: MatchingConfig = { version: 1, matches: [] };

describe("isEditableFormat", () => {
  it("編集画面のある 2 形式だけを通す", () => {
    expect(isEditableFormat("SINGLE_ELIMINATION")).toBe(true);
    expect(isEditableFormat("ROUND_ROBIN")).toBe(true);
    expect(isEditableFormat("DOUBLE_ELIMINATION_GRAND_FINAL")).toBe(false);
    expect(isEditableFormat("DOUBLE_ELIMINATION_THIRD_PLACE")).toBe(false);
  });
});

describe("maxEntries", () => {
  it("リーグは試合数が二乗で増えるため小さい上限にする", () => {
    expect(maxEntries("ROUND_ROBIN")).toBe(16);
  });

  it("トーナメントは従来どおり 128 人", () => {
    expect(maxEntries("SINGLE_ELIMINATION")).toBe(128);
  });
});

describe("regenerateMatching", () => {
  it("トーナメントはシード順から木を作る", () => {
    expect(regenerateMatching("SINGLE_ELIMINATION", entriesOf(4))).toEqual(
      buildFromSlots(generateSlots(entriesOf(4))),
    );
  });

  it("リーグはシード順から総当たりを作る", () => {
    expect(regenerateMatching("ROUND_ROBIN", entriesOf(4))).toEqual(
      buildRoundRobin(entriesOf(4)),
    );
  });

  it("どちらも 2 人未満なら空を返す", () => {
    expect(regenerateMatching("SINGLE_ELIMINATION", entriesOf(1))).toEqual(
      EMPTY,
    );
    expect(regenerateMatching("ROUND_ROBIN", entriesOf(1))).toEqual(EMPTY);
  });
});

describe("applyEntryAdded", () => {
  it("トーナメントは末尾の bye を埋め、既存のカードを壊さない", () => {
    // 2 人ぶんの木に 3 人目を足すと 1 段拡張されて 4 席になる。
    const current = buildFromSlots(generateSlots(entriesOf(2)));
    const next = applyEntryAdded(
      "SINGLE_ELIMINATION",
      current,
      entriesOf(3),
      "e3",
    );
    expect(next.matches.filter((match) => match.round === 1)).toHaveLength(2);
  });

  it("リーグは丸ごと作り直す。1 人増えれば全員の試合が増えるため", () => {
    const current = buildRoundRobin(entriesOf(3));
    expect(applyEntryAdded("ROUND_ROBIN", current, entriesOf(4), "e4")).toEqual(
      buildRoundRobin(entriesOf(4)),
    );
  });

  it("組み合わせが未作成ならどちらの形式でも空のまま", () => {
    // 生成は運営者が明示的にボタンを押したときだけ起きる。
    expect(
      applyEntryAdded("ROUND_ROBIN", EMPTY, entriesOf(4), "e4"),
    ).toEqual(EMPTY);
    expect(
      applyEntryAdded("SINGLE_ELIMINATION", EMPTY, entriesOf(4), "e4"),
    ).toEqual(EMPTY);
  });
});

describe("applyEntryReordered", () => {
  it("トーナメントは組み合わせに触らない", () => {
    const current = buildFromSlots(generateSlots(entriesOf(4)));
    expect(
      applyEntryReordered("SINGLE_ELIMINATION", current, entriesOf(4)),
    ).toBe(current);
  });

  it("リーグは新しいシード順で作り直す", () => {
    // 円卓法の出力はシード順から決まるので、並べ替えたのに古い対戦表が
    // 残ると画面の 2 箇所が食い違う。
    const swapped = [
      { id: "e2", participantId: "p2", seed: 0 },
      { id: "e1", participantId: "p1", seed: 1 },
      { id: "e3", participantId: "p3", seed: 2 },
      { id: "e4", participantId: "p4", seed: 3 },
    ];
    const current = buildRoundRobin(entriesOf(4));
    expect(applyEntryReordered("ROUND_ROBIN", current, swapped)).toEqual(
      buildRoundRobin(swapped),
    );
  });

  it("組み合わせが未作成ならリーグでも空のまま", () => {
    expect(applyEntryReordered("ROUND_ROBIN", EMPTY, entriesOf(4))).toEqual(
      EMPTY,
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/features/division/matching-strategy.test.ts`
Expected: FAIL — `Failed to resolve import "./matching-strategy"`

- [ ] **Step 3: 実装する**

`src/features/division/matching-strategy.ts`:

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
import type { DivisionEntry, MatchingConfig } from "@/lib/division/types";
import { buildRoundRobin } from "./round-robin/build";
import { buildFromSlots, toSlots } from "./single-elimination/build";
import { generateSlots, placeEntry } from "./single-elimination/edit";

/**
 * エントリー・組み合わせの編集画面を持つ形式。setup-store の読み出しが
 * これで弾くため、ここに無い形式へは Server Action からも書き込めない。
 */
export const EDITABLE_FORMATS = [
  "SINGLE_ELIMINATION",
  "ROUND_ROBIN",
] as const satisfies readonly DivisionFormat[];

export type EditableFormat = (typeof EDITABLE_FORMATS)[number];

export const isEditableFormat = (
  format: DivisionFormat,
): format is EditableFormat =>
  (EDITABLE_FORMATS as readonly DivisionFormat[]).includes(format);

/**
 * 部門あたりのエントリー上限。
 *
 * リーグは試合数が n(n-1)/2 で増えるため、トーナメントと同じ 128 人だと
 * 8128 試合の Json と一覧が生まれる。1 つのリーグとして現実に回せる
 * 人数で切り、それ以上は部門を分けて並行リーグにする運用に倒す。
 *
 * Record のキーを EditableFormat に固定しているので、対応形式を足して
 * 上限を書き忘れるとコンパイルエラーになる。
 */
const MAX_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 128,
  ROUND_ROBIN: 16,
};

export const maxEntries = (format: EditableFormat): number =>
  MAX_ENTRIES[format];

/**
 * エントリーのシード順から組み合わせを丸ごと作り直す。
 * 2 人未満ならどちらの形式でも空を返す。
 */
export const regenerateMatching = (
  format: EditableFormat,
  entries: DivisionEntry[],
): MatchingConfig => {
  switch (format) {
    case "SINGLE_ELIMINATION":
      return buildFromSlots(generateSlots(entries));
    case "ROUND_ROBIN":
      return buildRoundRobin(entries);
  }
};

/**
 * エントリーを 1 人足したあとの組み合わせ。
 *
 * トーナメントは「一番下の bye を埋める」だけで既存の対戦カードが残る。
 * リーグには対応する操作が無い（1 人増えれば全員の試合が 1 つずつ増え、
 * 円卓法の割り当ても全部ずれる）ので丸ごと作り直す。
 *
 * 組み合わせが未作成のときは空のままにする。エントリーを足しただけで
 * 対戦表が生えると、生成を押していない運営者を驚かせる。
 */
export const applyEntryAdded = (
  format: EditableFormat,
  current: MatchingConfig,
  entries: DivisionEntry[],
  addedEntryId: string,
): MatchingConfig => {
  if (current.matches.length === 0) {
    return current;
  }

  switch (format) {
    case "SINGLE_ELIMINATION":
      return buildFromSlots(placeEntry(toSlots(current), addedEntryId));
    case "ROUND_ROBIN":
      return buildRoundRobin(entries);
  }
};

/**
 * シード順を入れ替えたあとの組み合わせ。
 *
 * トーナメントは触らない（反映したければ運営者が「生成」を押す）。
 * リーグの割り当てはシード順から決まるので、触らないと画面の
 * 「エントリー」と「対戦表」が食い違ったままになる。作り直す。
 */
export const applyEntryReordered = (
  format: EditableFormat,
  current: MatchingConfig,
  entries: DivisionEntry[],
): MatchingConfig => {
  if (current.matches.length === 0) {
    return current;
  }

  switch (format) {
    case "SINGLE_ELIMINATION":
      return current;
    case "ROUND_ROBIN":
      return buildRoundRobin(entries);
  }
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/matching-strategy.test.ts`
Expected: PASS（全 12 件）

- [ ] **Step 5: コミット**

```bash
git add src/features/division/matching-strategy.ts src/features/division/matching-strategy.test.ts
git commit -m "$(cat <<'EOF'
feat(division): pick the matching rebuild rule by division format

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: setup-store を 2 形式に広げる

**Files:**
- Modify: `src/features/division/setup-store.ts:32-36`（`DivisionSetup` 型）と `:56-90`（`load`）
- Modify: `src/features/division/setup-store.test.ts:32-38`（`emptyRow`）と `:73-` のテスト

**Interfaces:**
- Consumes: `isEditableFormat` / `EditableFormat`（Task 4）
- Produces: `DivisionSetup` に `format: EditableFormat` が増える。`runDivisionSetup` の `mutate` が受け取る `current` から形式を引ける。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/setup-store.test.ts` の既存のテスト
「シングルエリミネーション以外は found: false を返し mutate を呼ばない」を消し、
次の 3 件に置き換える:

```ts
  it("リーグは編集できる形式なので mutate を呼び、形式を渡す", async () => {
    divisionFindFirst.mockResolvedValue({ ...emptyRow, format: "ROUND_ROBIN" });
    const mutate = vi.fn(async () => ({ next: null, value: null }));

    const result = await Effect.runPromise(runDivisionSetup(ids, mutate));

    expect(result).toEqual({ found: true, value: null });
    expect(mutate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ format: "ROUND_ROBIN" }),
    );
  });

  it("編集画面の無い形式は found: false を返し mutate を呼ばない", async () => {
    // Server Action は画面を経由せず直接叩けるので、対象外の形式の部門へ
    // 組み合わせを書き込まれないことをこの層で保証する。
    divisionFindFirst.mockResolvedValue({
      ...emptyRow,
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
    });
    // 素通りしたときに mutate 側で落ちるのではなく assertion で落ちるよう、
    // 呼ばれれば成立する戻り値を持たせておく。
    const mutate = vi.fn(async () => ({ next: null, value: null }));

    const result = await Effect.runPromise(runDivisionSetup(ids, mutate));

    expect(result).toEqual({ found: false });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("書き戻しでは format を更新しない", async () => {
    // 形式は /edit の責務。この経路では読み出すだけで書かない。
    divisionFindFirst.mockResolvedValue(emptyRow);

    await Effect.runPromise(
      runDivisionSetup(ids, async (_tx, current) => ({
        next: current,
        value: null,
      })),
    );

    expect(divisionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          entries: EMPTY_DIVISION_ENTRIES,
          matchingConfig: EMPTY_MATCHING_CONFIG,
        },
      }),
    );
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/features/division/setup-store.test.ts`
Expected: FAIL — リーグの部門で `{ found: false }` が返る

- [ ] **Step 3: 実装する**

`src/features/division/setup-store.ts` — import に足す:

```ts
import { type EditableFormat, isEditableFormat } from "./matching-strategy";
```

`DivisionSetup` を変える:

```ts
/**
 * 編集対象の Json 2 列と、その組み直し規則を選ぶための形式。
 * results は変更しないので運ばない。
 */
export type DivisionSetup = {
  format: EditableFormat;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
};
```

`load` の形式判定と戻り値を変える。コメントも実態に合わせる:

```ts
/**
 * 所有権を where に入れて読み、Json を検証済みの形にして返す。
 * 勝敗が 1 件でも記録されていれば、この画面からは編集させない。
 *
 * 形式の判定をここに置くのは、Server Action がページを経由せず叩ける
 * 別の入口だから。画面の分岐だけでは、例えば編集画面を持たない
 * ダブルエリミネーションの部門へ generateMatching を投げられると、
 * どの画面にも出ない組み合わせが matchingConfig に書き込まれてしまう。
 * 全スライスが必ず通るこの読み出しで弾いておけば、スライスごとに
 * 同じ判定を書き写す必要がなくなる。
 * 対象外の形式は「その部門は無い」と同じ扱いにして 404 に倒す。
 */
```

```ts
  if (!isEditableFormat(row.format)) {
    return null;
  }

  if (parseDivisionResults(row.results).matches.length > 0) {
    throw new DivisionResultsRecordedError({ divisionId: ids.divisionId });
  }

  return {
    format: row.format,
    entries: parseDivisionEntries(row.entries),
    matchingConfig: parseMatchingConfig(row.matchingConfig),
  };
```

`save` は `format` を書かない。`data` は現状のまま `{ entries, matchingConfig }` にしておく:

```ts
  await tx.division.updateMany({
    where: {
      id: ids.divisionId,
      tournament: { id: ids.tournamentId, organizationId: ids.organizationId },
    },
    // format は書かない。形式の変更は /edit が持つ責務で、この経路では変えない。
    data: { entries: next.entries, matchingConfig: next.matchingConfig },
  });
```

- [ ] **Step 4: この時点で残る型エラーを確認する**

`format` が必須になったことで、`next` に `DivisionSetup` を返している各スライスの
`repository.ts` が型エラーになる。この Task では**まだ直さない**（Task 6〜8 で
各スライスと一緒に直す）。ここでは `setup-store.test.ts` だけを通す。

Run: `pnpm exec vitest run src/features/division/setup-store.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/division/setup-store.ts src/features/division/setup-store.test.ts
git commit -m "$(cat <<'EOF'
feat(division): let the setup store load both editable formats

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 組み合わせ生成と形式ガード

`generate-matching` を両形式に効かせ、リーグに意味の無い `swap-slots` を
トーナメント限定のまま保ち、`set-match-number` の独自の形式判定を広げる。

**Files:**
- Modify: `src/features/division/generate-matching/repository.ts`
- Modify: `src/features/division/generate-matching/repository.test.ts`
- Modify: `src/features/division/swap-slots/repository.ts`
- Modify: `src/features/division/swap-slots/repository.test.ts`
- Modify: `src/features/division/set-match-number/repository.ts:44-47`
- Modify: `src/features/division/set-match-number/repository.test.ts`

**Interfaces:**
- Consumes: `regenerateMatching` / `isEditableFormat`（Task 4）、`DivisionSetup.format`（Task 5）

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/generate-matching/repository.test.ts` に追記する（既存の
モック構成をそのまま使い、`division.findFirst` が返す行の `format` を変える）:

```ts
  it("リーグの部門は総当たりの組み合わせを書く", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
          { id: "e3", participantId: "p3", seed: 2 },
        ],
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    await Effect.runPromise(generateMatchingInDb(ids));

    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    // 3 人なら 3 節 3 試合。勝者参照は 1 つも無い。
    expect(written.matches).toHaveLength(3);
    expect(written.matches.map((match: { id: string }) => match.id)).toEqual([
      "r1-0",
      "r2-0",
      "r3-0",
    ]);
  });

  it("リーグでも 2 人未満は拒否する", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [{ id: "e1", participantId: "p1", seed: 0 }],
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const exit = await Effect.runPromiseExit(generateMatchingInDb(ids));

    expect(failureTag(exit)).toBe("DivisionNotEnoughEntriesError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
```

`src/features/division/swap-slots/repository.test.ts` に追記する:

```ts
  it("リーグの部門では入れ替えを受け付けない", async () => {
    // 1 回戦スロットの入れ替えは総当たりに意味が無い。setup-store の
    // 形式チェックが広がったぶん、このスライスで弾く。
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: { version: 1, entries: [] },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const result = await Effect.runPromise(
      swapSlotsInDb(ids, { indexA: 0, indexB: 1 }),
    );

    // setup-store は 2 形式を通すので、スライスからは found: false を返せない。
    // 「何も起きなかった」という既存の応答に倒す。端まで来ているケースと
    // 区別が付かないため、リーグの部門であることも漏れない。
    expect(result).toEqual({ found: true, value: { swapped: false } });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
```

`src/features/division/set-match-number/repository.test.ts` に追記する:

```ts
  it("リーグの部門でも試合番号を変えられる", async () => {
    divisionFindFirst.mockResolvedValue({
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
            matchNumber: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
    });

    const result = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "r1-0", matchNumber: "A-1" }),
    );

    expect(result).toEqual({ found: true, value: null });
    expect(divisionUpdateMany).toHaveBeenCalled();
  });

  it("編集画面の無い形式は found: false を返す", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: { version: 1, entries: [] },
      matchingConfig: { version: 1, matches: [] },
    });

    const result = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "2" }),
    );

    expect(result).toEqual({ found: false });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/features/division/generate-matching src/features/division/swap-slots src/features/division/set-match-number`
Expected: FAIL

- [ ] **Step 3: generate-matching を実装する**

`src/features/division/generate-matching/repository.ts` を丸ごと置き換える:

```ts
import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionNotEnoughEntriesError } from "../errors";
import { regenerateMatching } from "../matching-strategy";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";

export type GenerateMatchingPort = (
  ids: DivisionIds,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const generateMatchingInDb: GenerateMatchingPort = (ids) =>
  runDivisionSetup(ids, async (_tx, current) => {
    const matchingConfig = regenerateMatching(
      current.format,
      current.entries.entries,
    );
    // 2 人未満だと組み合わせが作れない。黙って空を書くと「生成した」と
    // 読めてしまうので弾く。この判定は両形式で共通。
    if (matchingConfig.matches.length === 0) {
      throw new DivisionNotEnoughEntriesError({ divisionId: ids.divisionId });
    }

    return {
      next: {
        format: current.format,
        entries: current.entries,
        matchingConfig,
      },
      value: null,
    };
  });
```

- [ ] **Step 4: swap-slots を実装する**

`src/features/division/swap-slots/repository.ts` の `runDivisionSetup` の中身の
先頭にガードを足し、`next` に `format` を運ぶ:

```ts
export const swapSlotsInDb: SwapSlotsPort = (ids, input) =>
  runDivisionSetup<{ swapped: boolean }>(ids, async (_tx, current) => {
    // 1 回戦スロットの入れ替えは勝ち上がり木にしか意味が無い。
    // setup-store は編集画面を持つ 2 形式を通すので、ここで絞る。
    // 存在を漏らさないため、対象外の形式は「その部門は無い」と同じに倒す。
    if (current.format !== "SINGLE_ELIMINATION") {
      return { next: null, value: { swapped: false } };
    }

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
        format: current.format,
        entries: current.entries,
        matchingConfig: buildFromSlots(slots),
      },
      value: { swapped: true },
    };
  });
```

- [ ] **Step 5: set-match-number を実装する**

`src/features/division/set-match-number/repository.ts` — import に足す:

```ts
import { isEditableFormat } from "../matching-strategy";
```

形式判定を変える:

```ts
        // 編集画面を持たない形式は setup-store と同じく「無い」に倒す。
        if (!row || !isEditableFormat(row.format)) {
          return { found: false };
        }
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/generate-matching src/features/division/swap-slots src/features/division/set-match-number`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/features/division/generate-matching src/features/division/swap-slots src/features/division/set-match-number
git commit -m "$(cat <<'EOF'
feat(division): generate round-robin matchings and guard format-specific edits

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: エントリー追加を形式別の上限と組み直しに合わせる

**Files:**
- Modify: `src/features/division/errors.ts:46-51`（`DivisionEntryLimitError`）
- Modify: `src/features/division/messages.ts:37`
- Modify: `src/features/division/messages.test.ts`
- Modify: `src/features/division/add-entry/schema.ts:3-4`（`MAX_DIVISION_ENTRIES` を消す）
- Modify: `src/features/division/add-entry/repository.ts`
- Modify: `src/features/division/add-entry/repository.test.ts`

**Interfaces:**
- Consumes: `maxEntries` / `applyEntryAdded`（Task 4）、`DivisionSetup.format`（Task 5）
- Produces: `DivisionEntryLimitError` が `{ divisionId: string; limit: number }` を持つ

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/add-entry/repository.test.ts` に追記する:

```ts
  it("リーグは 16 人を超える追加を拒否する", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: Array.from({ length: 16 }, (_, index) => ({
          id: `e${index}`,
          participantId: `p${index}`,
          seed: index,
        })),
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const exit = await Effect.runPromiseExit(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(failureTag(exit)).toBe("DivisionEntryLimitError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("トーナメントは 16 人でも追加できる", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: {
        version: 1,
        entries: Array.from({ length: 16 }, (_, index) => ({
          id: `e${index}`,
          participantId: `p${index}`,
          seed: index,
        })),
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue({ id: "pNew" });
    participantFindMany.mockResolvedValue(
      Array.from({ length: 16 }, (_, index) => ({ id: `p${index}` })).concat([
        { id: "pNew" },
      ]),
    );

    const result = await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(result).toEqual({ found: true, value: null });
  });

  it("リーグは組み合わせがあると丸ごと作り直す", async () => {
    // 1 人増えれば全員の試合が増えるので、席を 1 つ埋める操作が無い。
    divisionFindFirst.mockResolvedValue({
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
            matchNumber: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
    });
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue({ id: "p3" });
    participantFindMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    // 3 人の総当たりは 3 節 3 試合。
    expect(written.matches).toHaveLength(3);
  });
```

**注意:** 既存のモック変数名（`memberFindFirst` / `participantFindFirst` /
`participantFindMany` / `divisionFindFirst` / `divisionUpdateMany`）は
`add-entry/repository.test.ts` の冒頭で定義済みのものを使う。無い場合は
既存のテストが使っている名前に合わせる。

`src/features/division/messages.test.ts` に追記する:

```ts
  it("エントリー上限の文言は形式ごとの上限を出す", () => {
    // 形式で上限が変わるのに文言が固定だと、リーグで 17 人目を弾いたときに
    // 「128人まで」と嘘を表示してしまう。
    expect(
      divisionErrorMessage(
        new DivisionEntryLimitError({ divisionId: "d1", limit: 16 }),
      ),
    ).toBe("エントリーは16人までです");
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/features/division/add-entry src/features/division/messages.test.ts`
Expected: FAIL

- [ ] **Step 3: エラーと文言を変える**

`src/features/division/errors.ts`:

```ts
/** エントリー数の上限に達していることを表す。上限は形式によって変わる。 */
export class DivisionEntryLimitError extends Data.TaggedError(
  "DivisionEntryLimitError",
)<{
  readonly divisionId: string;
  readonly limit: number;
}> {}
```

`src/features/division/messages.ts`:

```ts
    Match.tag(
      "DivisionEntryLimitError",
      (error) => `エントリーは${error.limit}人までです`,
    ),
```

- [ ] **Step 4: add-entry を変える**

`src/features/division/add-entry/schema.ts` から `MAX_DIVISION_ENTRIES` の定義を消す
（上限は形式で変わるので `matching-strategy.ts` が持つ）:

```ts
import { z } from "zod";

const trimmedName = (label: string) =>
```

`src/features/division/add-entry/repository.ts` — import を変える:

```ts
import { applyEntryAdded, maxEntries } from "../matching-strategy";
```

```ts
import type { AddEntryInput } from "./schema";
```

`buildFromSlots` / `toSlots` / `placeEntry` の import は不要になるので消す。

本体の上限判定と組み直しを変える:

```ts
export const addEntryInDb: AddEntryPort = (ids, input) =>
  runDivisionSetup(ids, async (tx, current) => {
    const limit = maxEntries(current.format);
    if (current.entries.entries.length >= limit) {
      throw new DivisionEntryLimitError({ divisionId: ids.divisionId, limit });
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

    // 組み合わせが未作成なら空のまま。生成は運営者が押したときだけ起きる。
    const matchingConfig = applyEntryAdded(
      current.format,
      current.matchingConfig,
      entries.entries,
      added.id,
    );

    return {
      next: { format: current.format, entries, matchingConfig },
      value: null,
    };
  });
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division`
Expected: `remove-entry` / `reorder-entry` を除いて PASS（この 2 つは Task 8 で直す）

Run: `pnpm exec vitest run src/features/division/add-entry src/features/division/messages.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/features/division/errors.ts src/features/division/messages.ts src/features/division/messages.test.ts src/features/division/add-entry
git commit -m "$(cat <<'EOF'
feat(division): cap league entries at 16 and rebuild the table on add

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: エントリーの削除と並べ替え

**Files:**
- Modify: `src/features/division/remove-entry/repository.ts`
- Modify: `src/features/division/remove-entry/repository.test.ts`
- Modify: `src/features/division/reorder-entry/repository.ts`
- Modify: `src/features/division/reorder-entry/repository.test.ts`
- Modify: `src/features/division/reorder-entry/handler.ts:44-47`
- Modify: `src/features/division/reorder-entry/handler.test.ts`

**Interfaces:**
- Consumes: `regenerateMatching` / `applyEntryReordered`（Task 4）、`DivisionSetup.format`（Task 5）
- Produces: `ReorderEntryPort` の戻り値が `{ moved: boolean; regenerated: boolean }` になる

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/remove-entry/repository.test.ts` に追記する:

```ts
  it("リーグは残りのシード順から総当たりを作り直す", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
          { id: "e3", participantId: "p3", seed: 2 },
          { id: "e4", participantId: "p4", seed: 3 },
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
            matchNumber: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e4" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
      { id: "p4" },
    ]);

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e4" }),
    );

    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "regenerated" },
    });
    // 残り 3 人の総当たりは 3 試合。
    expect(
      divisionUpdateMany.mock.calls[0][0].data.matchingConfig.matches,
    ).toHaveLength(3);
  });

  it("リーグでも残りが 2 人未満なら組み合わせを空にする", async () => {
    divisionFindFirst.mockResolvedValue({
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
            matchNumber: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e2" }),
    );

    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "cleared" },
    });
  });
```

`src/features/division/reorder-entry/repository.test.ts` に追記する（既存のテストは
戻り値が `{ moved: boolean }` を期待しているので、`{ moved, regenerated }` に直す）:

```ts
  it("トーナメントは並べ替えても組み合わせを作り直さない", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const result = await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );

    expect(result).toEqual({
      found: true,
      value: { moved: true, regenerated: false },
    });
  });

  it("リーグは新しいシード順で対戦表を作り直す", async () => {
    // 円卓法の割り当てはシード順から決まる。触らないとエントリー欄と
    // 対戦表が食い違ったままになる。
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
          { id: "e3", participantId: "p3", seed: 2 },
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
            matchNumber: "1",
            slots: [
              { kind: "entry", entryId: "e2" },
              { kind: "entry", entryId: "e3" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    const result = await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e3", direction: "up" }),
    );

    expect(result).toEqual({
      found: true,
      value: { moved: true, regenerated: true },
    });
    expect(
      divisionUpdateMany.mock.calls[0][0].data.matchingConfig.matches,
    ).toHaveLength(3);
  });

  it("組み合わせが未作成なら作り直さない", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const result = await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );

    expect(result).toEqual({
      found: true,
      value: { moved: true, regenerated: false },
    });
  });
```

`src/features/division/reorder-entry/handler.test.ts` に追記する:

```ts
  it("作り直したときだけ通知を出す", async () => {
    reorderEntryInDb.mockReturnValue(
      Effect.succeed({
        found: true,
        value: { moved: true, regenerated: true },
      }),
    );

    const state = await reorderEntryAction(INITIAL_DIVISION_FORM_STATE, form());

    expect(state).toEqual({
      error: null,
      notice: "並べ替えに合わせて対戦表を作り直しました",
    });
  });
```

**注意:** `handler.test.ts` の既存のモックの作り方（`vi.mock` で
`./repository` を差し替えているか、`Effect.succeed` を返しているか）に合わせて
書く。既存の成功ケースの期待値も `{ moved: true, regenerated: false }` に直す。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/features/division/remove-entry src/features/division/reorder-entry`
Expected: FAIL

- [ ] **Step 3: remove-entry を実装する**

`src/features/division/remove-entry/repository.ts` — import を変える:

```ts
import { regenerateMatching } from "../matching-strategy";
```

`buildFromSlots` / `generateSlots` の import を消す。組み直しと戻り値を変える:

```ts
    // 穴を残すより、シード順から作り直した方が結果が読みやすい。
    // トーナメントで手動入れ替えした配置と、両形式で手で変えた試合番号は
    // ここで失われるので、画面には再生成した旨を出す。
    const hadMatching = current.matchingConfig.matches.length > 0;
    const matchingConfig = hadMatching
      ? regenerateMatching(current.format, entries.entries)
      : current.matchingConfig;

    // 判定は除去「後」の結果で行う。残りが 2 人未満だと組み合わせは作れず
    // 空になるため、除去前だけを見て「再生成しました」と伝えると
    // 画面の文言が事実とずれる。
    const matching = !hadMatching
      ? "unchanged"
      : matchingConfig.matches.length === 0
        ? "cleared"
        : "regenerated";

    return {
      next: { format: current.format, entries, matchingConfig },
      value: { removed: true, matching },
    };
```

- [ ] **Step 4: reorder-entry を実装する**

`src/features/division/reorder-entry/repository.ts` を丸ごと置き換える:

```ts
import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import { applyEntryReordered } from "../matching-strategy";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { reorderEntries } from "./domain";
import type { ReorderEntryInput } from "./schema";

/**
 * 並べ替えの結果。組み合わせを作り直したかどうかを分けて返すのは、
 * 画面の通知が事実とずれないようにするため。リーグはシード順から
 * 割り当てが決まるので作り直すが、トーナメントは触らない。
 */
export type ReorderEntryResult = { moved: boolean; regenerated: boolean };

export type ReorderEntryPort = (
  ids: DivisionIds,
  input: ReorderEntryInput,
) => Effect.Effect<DivisionSetupOutcome<ReorderEntryResult>, DivisionError>;

export const reorderEntryInDb: ReorderEntryPort = (ids, input) =>
  runDivisionSetup<ReorderEntryResult>(ids, async (_tx, current) => {
    const reordered = reorderEntries(
      current.entries.entries,
      input.entryId,
      input.direction,
    );

    // null は「端まで来ている」か「その対象が無い」。どちらも画面上は
    // 何も起きなかったのと同じで、応答を区別させない。
    if (reordered === null) {
      return { next: null, value: { moved: false, regenerated: false } };
    }

    const entries: DivisionEntries = { version: 1, entries: reordered };
    const matchingConfig = applyEntryReordered(
      current.format,
      current.matchingConfig,
      entries.entries,
    );

    return {
      next: { format: current.format, entries, matchingConfig },
      value: {
        moved: true,
        regenerated: matchingConfig !== current.matchingConfig,
      },
    };
  });
```

- [ ] **Step 5: reorder-entry の handler で通知を出す**

`src/features/division/reorder-entry/handler.ts` の末尾を変える:

```ts
  // moved: false は「端まで来ている」。エラーにする必要はない。
  revalidateDivisionSetup(slug, tournamentId, divisionId);

  // 手で変えた試合番号が消えるのは驚きになりうるので、起きたことを明示する。
  return exit.value.value.regenerated
    ? { error: null, notice: "並べ替えに合わせて対戦表を作り直しました" }
    : { error: null };
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラー 0 件

- [ ] **Step 7: コミット**

```bash
git add src/features/division/remove-entry src/features/division/reorder-entry
git commit -m "$(cat <<'EOF'
feat(division): rebuild the league table when entries move or leave

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 共有コンポーネントの切り出し

リーグ画面が使う「試合番号の行」と「生成ボタン」を、既存のコンポーネントから
切り出して両方から使えるようにする。

**Files:**
- Create: `src/components/division/MatchNumberRow.tsx`
- Create: `src/components/division/GenerateMatchingForm.tsx`
- Create: `src/components/division/GenerateMatchingForm.test.tsx`
- Modify: `src/components/division/MatchNumberList.tsx`
- Modify: `src/components/division/MatchingSection.tsx`

**Interfaces:**
- Consumes: `MatchNumberRowView`（Task 3）、`DivisionFormAction`（`features/division/state.ts`）
- Produces:
  - `MatchNumberRow({ row, slug, tournamentId, divisionId, action })`
  - `GenerateMatchingForm({ slug, tournamentId, divisionId, action, disabled, label })` — `label` はボタンの文言（トーナメントは「組み合わせを生成」、リーグは「対戦表を生成」）

- [ ] **Step 1: 生成フォームのテストを書く**

`src/components/division/GenerateMatchingForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionFormState } from "@/features/division/state";
import { GenerateMatchingForm } from "./GenerateMatchingForm";

const noopAction = vi.fn(
  async (_state: DivisionFormState, _data: FormData) => ({ error: null }),
);

const props = {
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  action: noopAction,
  disabled: false,
};

describe("GenerateMatchingForm", () => {
  it("渡された文言のボタンを出す", () => {
    render(<GenerateMatchingForm {...props} label="対戦表を生成" />);
    expect(
      screen.getByRole("button", { name: "対戦表を生成" }),
    ).toBeInTheDocument();
  });

  it("3 つの識別子を hidden で送る", () => {
    const { container } = render(
      <GenerateMatchingForm {...props} label="組み合わせを生成" />,
    );
    for (const [name, value] of [
      ["slug", "acme"],
      ["tournamentId", "t1"],
      ["divisionId", "d1"],
    ]) {
      expect(
        container.querySelector(`input[name="${name}"]`),
      ).toHaveValue(value);
    }
  });

  it("disabled のときはボタンを押せない", () => {
    render(
      <GenerateMatchingForm {...props} disabled label="対戦表を生成" />,
    );
    expect(screen.getByRole("button", { name: "対戦表を生成" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/components/division/GenerateMatchingForm.test.tsx`
Expected: FAIL — `Failed to resolve import "./GenerateMatchingForm"`

- [ ] **Step 3: 試合番号の行を切り出す**

`src/components/division/MatchNumberRow.tsx` を新設する。中身は
`MatchNumberList.tsx` の中にある `MatchNumberRow` をそのまま移す:

```tsx
"use client";

import { useActionState } from "react";
import type { MatchNumberRowView } from "@/features/division/match-number-view";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 1 行 1 フォーム。useActionState を行ごとに持たせ、エラーをその行の隣に出す。
 * 試合番号は組み合わせの構造を変えないため、勝敗記録後も編集できる
 * （disabled を受け取らないのは意図）。
 *
 * トーナメントの試合番号一覧とリーグの節ごとの一覧が同じ行を描くので、
 * どちらからも使えるよう独立したファイルに置く。
 */
export function MatchNumberRow({
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
```

`src/components/division/MatchNumberList.tsx` を、切り出した行を使う形に置き換える:

```tsx
"use client";

import type { MatchNumberRowView } from "@/features/division/match-number-view";
import type { DivisionFormAction } from "@/features/division/state";
import { MatchNumberRow } from "./MatchNumberRow";

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
    return <p className="text-sm text-slate-600">まだ組み合わせがありません</p>;
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

- [ ] **Step 4: 生成フォームを切り出す**

`src/components/division/GenerateMatchingForm.tsx` を新設する:

```tsx
"use client";

import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 組み合わせの生成ボタンと、その結果の表示。
 * トーナメントとリーグで文言だけが違うので label を受け取る。
 */
export function GenerateMatchingForm({
  slug,
  tournamentId,
  divisionId,
  action,
  disabled,
  label,
}: {
  slug: string;
  tournamentId: string;
  divisionId: string;
  action: DivisionFormAction;
  disabled: boolean;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          {pending ? "生成中..." : label}
        </button>
      </form>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== undefined && (
        <output className="text-sm text-slate-600">{state.notice}</output>
      )}
    </div>
  );
}
```

`src/components/division/MatchingSection.tsx` を、生成フォームを使う形に置き換える:

```tsx
"use client";

import { useActionState } from "react";
import type { SetupMatchView } from "@/features/division/single-elimination/view";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import { GenerateMatchingForm } from "./GenerateMatchingForm";
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
      <GenerateMatchingForm
        slug={slug}
        tournamentId={tournamentId}
        divisionId={divisionId}
        action={generateAction}
        disabled={disabled}
        label="組み合わせを生成"
      />

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

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division`
Expected: PASS（既存の `MatchNumberList.test.tsx` と `MatchingSection.test.tsx` を含む）

既存テストが「生成中...」やボタン名で落ちる場合は、切り出し後も同じ文言を
出しているか確認する。文言は変えていないので、落ちるなら配線の間違いである。

- [ ] **Step 6: コミット**

```bash
git add src/components/division
git commit -m "$(cat <<'EOF'
refactor(division): extract the match-number row and generate form

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 節ごとの試合一覧

**Files:**
- Create: `src/components/division/LeagueRoundList.tsx`
- Create: `src/components/division/LeagueRoundList.test.tsx`

**Interfaces:**
- Consumes: `LeagueRoundView`（Task 3）、`MatchNumberRow`（Task 9）
- Produces: `LeagueRoundList({ rounds, slug, tournamentId, divisionId, action })`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/LeagueRoundList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LeagueRoundView } from "@/features/division/round-robin/view";
import type { DivisionFormState } from "@/features/division/state";
import { LeagueRoundList } from "./LeagueRoundList";

const noopAction = vi.fn(
  async (_state: DivisionFormState, _data: FormData) => ({ error: null }),
);

const rounds: LeagueRoundView[] = [
  {
    round: 1,
    matches: [
      {
        matchId: "r1-0",
        matchNumber: "1",
        label: "第1節 第1試合",
        card: "山田 vs 田中",
      },
    ],
    restingLabels: ["鈴木"],
  },
  {
    round: 2,
    matches: [
      {
        matchId: "r2-0",
        matchNumber: "2",
        label: "第2節 第1試合",
        card: "山田 vs 鈴木",
      },
    ],
    restingLabels: [],
  },
];

const props = {
  rounds,
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  action: noopAction,
};

describe("LeagueRoundList", () => {
  it("節ごとに見出しを出す", () => {
    render(<LeagueRoundList {...props} />);
    expect(screen.getByRole("heading", { name: "第1節" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "第2節" })).toBeInTheDocument();
  });

  it("試合の位置と対戦を出す", () => {
    render(<LeagueRoundList {...props} />);
    expect(screen.getByText("第1節 第1試合")).toBeInTheDocument();
    expect(screen.getByText("山田 vs 田中")).toBeInTheDocument();
  });

  it("試合番号を編集できる", () => {
    render(<LeagueRoundList {...props} />);
    expect(screen.getByLabelText("第1節 第1試合の試合番号")).toHaveValue("1");
  });

  it("休みが居る節だけ休みを出す", () => {
    render(<LeagueRoundList {...props} />);
    expect(screen.getByText("休み: 鈴木")).toBeInTheDocument();
    expect(screen.queryByText("休み: ")).not.toBeInTheDocument();
  });

  it("対戦表が未作成なら案内を出す", () => {
    render(<LeagueRoundList {...props} rounds={[]} />);
    expect(screen.getByText("まだ対戦表がありません")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/components/division/LeagueRoundList.test.tsx`
Expected: FAIL — `Failed to resolve import "./LeagueRoundList"`

- [ ] **Step 3: 実装する**

`src/components/division/LeagueRoundList.tsx`:

```tsx
"use client";

import type { LeagueRoundView } from "@/features/division/round-robin/view";
import type { DivisionFormAction } from "@/features/division/state";
import { MatchNumberRow } from "./MatchNumberRow";

/**
 * 節ごとの試合一覧。行は試合番号の編集フォームを兼ねる。
 *
 * 一覧と番号編集を 1 つの区画にまとめるのは、同じ試合が 2 区画に
 * 重複して並ぶのを避けるため。トーナメントの /setup が一覧と番号編集を
 * 分けているのは、あちらの一覧側が 1 回戦スロットの D&D で別物だからで、
 * リーグにはその区別が無い。
 */
export function LeagueRoundList({
  rounds,
  slug,
  tournamentId,
  divisionId,
  action,
}: {
  rounds: LeagueRoundView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  action: DivisionFormAction;
}) {
  if (rounds.length === 0) {
    return <p className="text-sm text-slate-600">まだ対戦表がありません</p>;
  }

  return (
    <div className="space-y-4">
      {rounds.map((round) => (
        <section key={round.round} className="space-y-2">
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-bold text-slate-700">
              第{round.round}節
            </h3>
            {/* 休みは matchingConfig に保存しないので、出ていない人として算出する */}
            {round.restingLabels.length > 0 && (
              <p className="text-xs text-slate-500">
                休み: {round.restingLabels.join("、")}
              </p>
            )}
          </div>

          <ul className="space-y-2">
            {round.matches.map((row) => (
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
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division/LeagueRoundList.test.tsx`
Expected: PASS（全 5 件）

- [ ] **Step 5: コミット**

```bash
git add src/components/division/LeagueRoundList.tsx src/components/division/LeagueRoundList.test.tsx
git commit -m "$(cat <<'EOF'
feat(division): list league matches by matchday with number editing

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: 星取表グリッド

**Files:**
- Create: `src/components/division/LeagueCrossTable.tsx`
- Create: `src/components/division/LeagueCrossTable.test.tsx`

**Interfaces:**
- Consumes: `CrossTableView` / `CrossTableCell`（Task 3）
- Produces: `LeagueCrossTable({ table })`（server component）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/LeagueCrossTable.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CrossTableView } from "@/features/division/round-robin/view";
import { LeagueCrossTable } from "./LeagueCrossTable";

const table: CrossTableView = {
  headers: [
    { entryId: "e1", label: "山田" },
    { entryId: "e2", label: "佐藤" },
    { entryId: "e3", label: "鈴木" },
  ],
  rows: [
    {
      entryId: "e1",
      label: "山田",
      cells: [
        { kind: "self" },
        { kind: "match", matchNumber: "1" },
        { kind: "none" },
      ],
    },
    {
      entryId: "e2",
      label: "佐藤",
      cells: [
        { kind: "match", matchNumber: "1" },
        { kind: "self" },
        { kind: "match", matchNumber: "2" },
      ],
    },
    {
      entryId: "e3",
      label: "鈴木",
      cells: [
        { kind: "none" },
        { kind: "match", matchNumber: "2" },
        { kind: "self" },
      ],
    },
  ],
};

describe("LeagueCrossTable", () => {
  it("エントリーを行と列の見出しに出す", () => {
    render(<LeagueCrossTable table={table} />);
    // 行見出しと列見出しで 2 回ずつ出る。
    expect(screen.getAllByText("山田")).toHaveLength(2);
    expect(screen.getAllByText("鈴木")).toHaveLength(2);
  });

  it("対戦があるマスに試合番号を出す", () => {
    render(<LeagueCrossTable table={table} />);
    // 見出し行にも「山田」が出るので、行の名前ではなく位置で選ぶ。
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("第1試合")).toBeInTheDocument();
  });

  it("対角は自分自身なので印を出す", () => {
    render(<LeagueCrossTable table={table} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("エントリーが無いときは案内を出す", () => {
    render(<LeagueCrossTable table={{ headers: [], rows: [] }} />);
    expect(screen.getByText("まだエントリーがありません")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/components/division/LeagueCrossTable.test.tsx`
Expected: FAIL — `Failed to resolve import "./LeagueCrossTable"`

- [ ] **Step 3: 実装する**

`src/components/division/LeagueCrossTable.tsx`:

```tsx
import type {
  CrossTableCell,
  CrossTableView,
} from "@/features/division/round-robin/view";

/** 1 マスの表示。対戦の向きは表示上の意味を持たないので表は左右対称になる。 */
const cellText = (cell: CrossTableCell): string => {
  switch (cell.kind) {
    case "self":
      return "—";
    case "match":
      return `第${cell.matchNumber}試合`;
    case "none":
      return "";
  }
};

/**
 * 誰と誰が当たるかを一目で見せる星取表。マスには試合番号を入れる。
 * 人数が増えると横に広がるので、横スクロールできる箱に入れる。
 */
export function LeagueCrossTable({ table }: { table: CrossTableView }) {
  if (table.headers.length === 0) {
    return <p className="text-sm text-slate-600">まだエントリーがありません</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500">
              {/* 行見出しの列。ここに文字を置くと 1 行目が読みにくくなる */}
            </th>
            {table.headers.map((header) => (
              <th
                key={header.entryId}
                scope="col"
                className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-500"
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.entryId}>
              <th
                scope="row"
                className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-left font-medium text-slate-800"
              >
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  // 列の並びは headers と 1 対 1 なので、列の entryId を鍵にする。
                  key={table.headers[index].entryId}
                  className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-center text-xs text-slate-600"
                >
                  {cellText(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division/LeagueCrossTable.test.tsx`
Expected: PASS（全 4 件）

- [ ] **Step 5: コミット**

```bash
git add src/components/division/LeagueCrossTable.tsx src/components/division/LeagueCrossTable.test.tsx
git commit -m "$(cat <<'EOF'
feat(division): show the league pairings as a cross table

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: リーグ編集画面の全体

**Files:**
- Create: `src/components/division/LeagueSetup.tsx`
- Create: `src/components/division/LeagueSetup.test.tsx`

**Interfaces:**
- Consumes: `EntryList` / `AddEntryForm`（既存、変更なし）、`GenerateMatchingForm`（Task 9）、`LeagueRoundList`（Task 10）、`LeagueCrossTable`（Task 11）、`toRoundView` / `toCrossTableView`（Task 3）、`isRoundRobinShape`（Task 1）
- Produces:
  - `LeagueSetupActions = { addEntry; removeEntry; reorderEntry; generateMatching; setMatchNumber; setPlayerNumber }`（全て `DivisionFormAction`）
  - `LeagueSetup({ division, participants, members, slug, tournamentId, actions })`（server component）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/LeagueSetup.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { LeagueSetup } from "./LeagueSetup";

// 6 つとも別の vi.fn にする。同じ参照を使い回すと、配線で prop を
// 取り違えても（例: reorderEntry と removeEntry の入れ替え）検知できない。
const actions = {
  addEntry: vi.fn(async () => ({ error: null })),
  removeEntry: vi.fn(async () => ({ error: null })),
  reorderEntry: vi.fn(async () => ({ error: null })),
  generateMatching: vi.fn(async () => ({ error: null })),
  setMatchNumber: vi.fn(async () => ({ error: null })),
  setPlayerNumber: vi.fn(async () => ({ error: null })),
};

const leagueMatching = {
  version: 1,
  matches: [
    {
      id: "r1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchNumber: "1",
      slots: [
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ],
    },
  ],
};

const division = (overrides: Partial<DivisionDetail> = {}): DivisionDetail => ({
  id: "d1",
  name: "総当たりリーグ",
  order: 0,
  format: "ROUND_ROBIN",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: leagueMatching,
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const props = {
  slug: "acme",
  tournamentId: "t1",
  participants: [
    { id: "p1", name: "山田", nameKana: "やまだ", playerNumber: "1" },
    { id: "p2", name: "佐藤", nameKana: "さとう", playerNumber: "2" },
  ],
  members: [],
  actions,
};

describe("LeagueSetup", () => {
  it("エントリー・対戦表・節ごとの試合の 3 区画を出す", () => {
    render(<LeagueSetup {...props} division={division()} />);

    expect(
      screen.getByRole("heading", { name: "エントリー" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "対戦表" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "節ごとの試合" }),
    ).toBeInTheDocument();
  });

  it("リーグ以外の形式は案内だけを出す", () => {
    render(
      <LeagueSetup
        {...props}
        division={division({ format: "SINGLE_ELIMINATION" })}
      />,
    );

    expect(
      screen.getByText(
        "「シングルエリミネーション」はこの画面では編集できません",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "エントリー" }),
    ).not.toBeInTheDocument();
  });

  it("勝敗が記録されていると編集ロックの案内を出す", () => {
    render(
      <LeagueSetup
        {...props}
        division={division({
          results: {
            version: 1,
            matches: [{ matchId: "r1-0", winnerEntryId: "e1" }],
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "勝敗が記録されているため、エントリーと対戦表は変更できません",
      ),
    ).toBeInTheDocument();
  });

  it("トーナメントの木が残っていると作り直しを促す", () => {
    // /edit は format を無条件に書き換えられるので、この状態は実在しうる。
    render(
      <LeagueSetup
        {...props}
        division={division({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m2-0",
                bracket: "winners",
                round: 2,
                order: 0,
                matchNumber: "3",
                slots: [
                  { kind: "winnerOf", matchId: "m1-0" },
                  { kind: "winnerOf", matchId: "m1-1" },
                ],
              },
            ],
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "この対戦表はリーグの形ではありません。作り直してください",
      ),
    ).toBeInTheDocument();
    // 生成ボタンは残す。押せば直る。
    expect(
      screen.getByRole("button", { name: "対戦表を生成" }),
    ).toBeInTheDocument();
  });

  it("Json が壊れていてもページを落とさない", () => {
    render(
      <LeagueSetup {...props} division={division({ entries: "壊れた値" })} />,
    );

    expect(
      screen.getByText("部門のデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/components/division/LeagueSetup.test.tsx`
Expected: FAIL — `Failed to resolve import "./LeagueSetup"`

- [ ] **Step 3: 実装する**

`src/components/division/LeagueSetup.tsx`:

```tsx
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isRoundRobinShape } from "@/features/division/round-robin/build";
import {
  toCrossTableView,
  toRoundView,
} from "@/features/division/round-robin/view";
import type { DivisionFormAction } from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { AddEntryForm } from "./AddEntryForm";
import { EntryList } from "./EntryList";
import { GenerateMatchingForm } from "./GenerateMatchingForm";
import { LeagueCrossTable } from "./LeagueCrossTable";
import { LeagueRoundList } from "./LeagueRoundList";

/**
 * トーナメントの DivisionSetup と違い swapSlots を取らない。
 * 1 回戦スロットの入れ替えは総当たりに意味が無いため。
 */
export type LeagueSetupActions = {
  addEntry: DivisionFormAction;
  removeEntry: DivisionFormAction;
  reorderEntry: DivisionFormAction;
  generateMatching: DivisionFormAction;
  setMatchNumber: DivisionFormAction;
  setPlayerNumber: DivisionFormAction;
};

const Notice = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
    {children}
  </p>
);

export function LeagueSetup({
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
  actions: LeagueSetupActions;
}) {
  // ページ側でも弾いているが、この画面はリーグ専用であることを型より外でも守る。
  if (division.format !== "ROUND_ROBIN") {
    return (
      <Notice>
        「{DIVISION_FORMAT_LABELS[division.format]}
        」はこの画面では編集できません
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

  // 勝敗が入ったあとに対戦表を変えると結果の参照が壊れる。
  // サーバ側でも拒否するが、押せてしまう前に理由を見せる。
  const locked = parsed.results.matches.length > 0;

  const entries = [...parsed.entries.entries].sort(
    (left, right) => left.seed - right.seed,
  );

  // /edit は format を無条件に書き換えられるので、トーナメントの木を
  // 持ったままリーグになった部門が存在しうる。その木を星取表として
  // 描くと嘘になるため、作り直しを促すだけにする。
  const mismatched = !isRoundRobinShape(parsed.matchingConfig);

  return (
    <div className="space-y-6">
      {locked && (
        <output className="block rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          勝敗が記録されているため、エントリーと対戦表は変更できません
        </output>
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
          setPlayerNumberAction={actions.setPlayerNumber}
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
        <h2 className="text-sm font-bold text-slate-700">対戦表</h2>
        <GenerateMatchingForm
          slug={slug}
          tournamentId={tournamentId}
          divisionId={division.id}
          action={actions.generateMatching}
          disabled={locked}
          label="対戦表を生成"
        />
        {mismatched ? (
          <Notice>
            この対戦表はリーグの形ではありません。作り直してください
          </Notice>
        ) : (
          <LeagueCrossTable
            table={toCrossTableView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
            )}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">節ごとの試合</h2>
        {/* 番号の変更は構造を変えないため、locked でも編集できる */}
        {mismatched ? (
          <Notice>対戦表を作り直すと、ここに節ごとの試合が出ます</Notice>
        ) : (
          <LeagueRoundList
            rounds={toRoundView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
            )}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            action={actions.setMatchNumber}
          />
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division/LeagueSetup.test.tsx`
Expected: PASS（全 5 件）

`mismatched` のテストで「節ごとの試合」の見出しが 2 度目の Notice を出すため、
`screen.getByRole("heading", { name: "節ごとの試合" })` は引き続き見つかる。

- [ ] **Step 5: コミット**

```bash
git add src/components/division/LeagueSetup.tsx src/components/division/LeagueSetup.test.tsx
git commit -m "$(cat <<'EOF'
feat(division): assemble the league setup screen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: /league ページと再検証、/setup の形式ガード

**Files:**
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.test.tsx`
- Modify: `src/features/division/revalidate.ts`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx`

**Interfaces:**
- Consumes: `LeagueSetup` / `LeagueSetupActions`（Task 12）、既存の 6 つの Server Action

- [ ] **Step 1: 型を生成する**

新しいルートを足すと `PageProps<"...">` の型が要る。

Run: `pnpm exec next typegen`
Expected: 成功（`.env` が無いと落ちる場合は、メインのチェックアウトから `.env` をコピーする）

**注:** `league/page.tsx` を作ってから typegen を走らせる必要があるので、
Step 3 のあとにもう一度走らせる。

- [ ] **Step 2: 失敗するテストを書く**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.test.tsx`
は、`setup/page.test.tsx` と同じ骨格で書く。差分は「差し替える Server Action が
6 つ（`swapSlots` を含まない）」と「`LeagueSetup` を差し替える」ところ:

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

// 6 つの Server Action は "use server" を持つので、テストでは差し替える。
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
vi.mock("@/features/division/set-match-number/handler", () => ({
  setMatchNumberAction: vi.fn(),
}));
vi.mock("@/features/division/set-player-number/handler", () => ({
  setPlayerNumberAction: vi.fn(),
}));

const leagueSetupProps = vi.fn();
vi.mock("@/components/division/LeagueSetup", () => ({
  LeagueSetup: (props: unknown) => {
    leagueSetupProps(props);
    return <div>league</div>;
  },
}));

const { default: LeagueSetupPage } = await import("./page");

const params = Promise.resolve({
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
});

const league = {
  id: "d1",
  name: "総当たりリーグ",
  order: 0,
  format: "ROUND_ROBIN",
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  requireOrganization.mockReset();
  findTournamentInOrganization.mockReset();
  findDivisionInTournament.mockReset();
  listParticipantsInTournament.mockReset();
  listMembersInOrganization.mockReset();
  notFound.mockClear();
  leagueSetupProps.mockClear();

  requireOrganization.mockResolvedValue({
    session: { user: { name: "運営者" } },
    organization: { id: "o1", name: "アクメ" },
  });
  findTournamentInOrganization.mockResolvedValue({ id: "t1", name: "春季大会" });
  findDivisionInTournament.mockResolvedValue(league);
  listParticipantsInTournament.mockResolvedValue([]);
  listMembersInOrganization.mockResolvedValue([]);
});

describe("LeagueSetupPage", () => {
  it("リーグの部門なら編集画面を描く", async () => {
    render(await LeagueSetupPage({ params }));
    expect(screen.getByText("league")).toBeInTheDocument();
  });

  it("部門が無ければ 404 に倒す", async () => {
    findDivisionInTournament.mockResolvedValue(null);
    await expect(LeagueSetupPage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("リーグ以外の形式は 404 に倒す", async () => {
    // 専用画面が別にあるので、案内より 404 が正しい。
    findDivisionInTournament.mockResolvedValue({
      ...league,
      format: "SINGLE_ELIMINATION",
    });
    await expect(LeagueSetupPage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("6 つの Server Action を配線する", async () => {
    render(await LeagueSetupPage({ params }));
    const props = leagueSetupProps.mock.calls[0][0] as {
      actions: Record<string, unknown>;
    };
    expect(Object.keys(props.actions).sort()).toEqual([
      "addEntry",
      "generateMatching",
      "removeEntry",
      "reorderEntry",
      "setMatchNumber",
      "setPlayerNumber",
    ]);
  });
});
```

`setup/page.test.tsx` に追記する:

```tsx
  it("シングルエリミネーション以外は 404 に倒す", async () => {
    // リーグには専用画面（/league）があるので、この画面では扱わない。
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "ROUND_ROBIN",
    });
    await expect(DivisionSetupPage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
```

**注:** `division` は `setup/page.test.tsx` の中で既に定義されている部門の
テストデータ。名前が違う場合はそちらに合わせる。

- [ ] **Step 3: ページを実装する**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { LeagueSetup } from "@/components/division/LeagueSetup";
import { addEntryAction } from "@/features/division/add-entry/handler";
import { generateMatchingAction } from "@/features/division/generate-matching/handler";
import { removeEntryAction } from "@/features/division/remove-entry/handler";
import { reorderEntryAction } from "@/features/division/reorder-entry/handler";
import {
  findDivisionInTournament,
  listParticipantsInTournament,
} from "@/features/division/repository";
import { setMatchNumberAction } from "@/features/division/set-match-number/handler";
import { setPlayerNumberAction } from "@/features/division/set-player-number/handler";
import { listMembersInOrganization } from "@/features/organization/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function LeagueSetupPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league">) {
  const { slug, tournamentId, divisionId } = await params;
  const { session, organization } = await requireOrganization(slug);

  // 詳細ページと違い、参加者とメンバーを常に引く。この画面は
  // ROUND_ROBIN を編集するために開くもので、どちらも必ず使うため。
  const [tournament, division, participants, members] = await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
    listParticipantsInTournament(organization.id, tournamentId),
    listMembersInOrganization(organization.id),
  ]);
  if (!tournament || !division) {
    notFound();
  }
  // トーナメントには専用画面（/setup）がある。URL を直に叩かれたときに
  // 中途半端な画面を出さず、案内より 404 に倒す。
  if (division.format !== "ROUND_ROBIN") {
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
          { label: "エントリー・対戦表" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">
          {division.name} のエントリー・対戦表
        </h1>

        <LeagueSetup
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
            setMatchNumber: setMatchNumberAction,
            setPlayerNumber: setPlayerNumberAction,
          }}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: 再検証先に /league を足す**

`src/features/division/revalidate.ts`:

```ts
import { revalidatePath } from "next/cache";

/**
 * エントリー・組み合わせを変えたあとに再検証すべきページ。
 * 全スライスが同じ組を叩くので、書き漏らしを防ぐためここへ集約する。
 * 形式ごとに編集画面が分かれているが、スライスは形式を知らずに呼ばれるため
 * 両方を再検証する。存在しない側を叩いても害はない。
 */
export const revalidateDivisionSetup = (
  slug: string,
  tournamentId: string,
  divisionId: string,
): void => {
  const base = `/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`;
  revalidatePath(base);
  revalidatePath(`${base}/setup`);
  revalidatePath(`${base}/league`);
};
```

- [ ] **Step 5: /setup に形式ガードを足す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
の `if (!tournament || !division) { notFound(); }` の直後に足す:

```tsx
  // リーグには専用画面（/league）がある。案内を出すより 404 に倒す。
  if (division.format !== "SINGLE_ELIMINATION") {
    notFound();
  }
```

- [ ] **Step 6: 型生成とテスト**

Run: `pnpm exec next typegen`
Expected: 成功

Run: `pnpm exec vitest run "src/app/orgs"`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラー 0 件

- [ ] **Step 7: コミット**

```bash
git add "src/app/orgs" src/features/division/revalidate.ts
git commit -m "$(cat <<'EOF'
feat(division): add the /league route and split it from /setup

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: 部門詳細のボタンを形式で振り分ける

**Files:**
- Modify: `src/components/division/DivisionDetail.tsx`
- Create: `src/components/division/DivisionDetail.test.tsx`（既にあれば Modify）

**Interfaces:**
- Consumes: `DIVISION_FORMAT_LABELS`（既存）、`DivisionFormat`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/DivisionDetail.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { DivisionDetailView } from "./DivisionDetail";

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

const props = { slug: "acme", tournamentId: "t1" };

describe("DivisionDetailView", () => {
  it("トーナメントは /setup へ送る", () => {
    render(<DivisionDetailView {...props} division={division()} />);

    expect(
      screen.getByRole("link", { name: "エントリー・組み合わせ" }),
    ).toHaveAttribute(
      "href",
      "/orgs/acme/tournaments/t1/divisions/d1/setup",
    );
  });

  it("リーグは /league へ送る", () => {
    render(
      <DivisionDetailView
        {...props}
        division={division({ format: "ROUND_ROBIN" })}
      />,
    );

    expect(
      screen.getByRole("link", { name: "エントリー・対戦表" }),
    ).toHaveAttribute(
      "href",
      "/orgs/acme/tournaments/t1/divisions/d1/league",
    );
  });

  it("編集画面の無い形式ではボタンを出さない", () => {
    render(
      <DivisionDetailView
        {...props}
        division={division({ format: "DOUBLE_ELIMINATION_GRAND_FINAL" })}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /エントリー/ }),
    ).not.toBeInTheDocument();
    // 部門の編集は形式に関わらず開ける。
    expect(
      screen.getByRole("link", { name: "部門を編集" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/components/division/DivisionDetail.test.tsx`
Expected: FAIL — リーグでもリンク名が「エントリー・組み合わせ」で `/setup` を指す

- [ ] **Step 3: 実装する**

`src/components/division/DivisionDetail.tsx` を置き換える:

```tsx
import Link from "next/link";
import type { DivisionFormat } from "@/generated/prisma/enums";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionDetail } from "@/features/division/repository";
import { formatStartsAt } from "@/features/tournament/format";

/**
 * 形式ごとのエントリー編集画面。null は編集画面を持たない形式。
 * Record のキーを DivisionFormat に固定しているので、enum に値を足して
 * 行き先を書き忘れるとコンパイルエラーになる。
 */
const SETUP_LINKS: Record<
  DivisionFormat,
  { segment: string; label: string } | null
> = {
  SINGLE_ELIMINATION: { segment: "setup", label: "エントリー・組み合わせ" },
  ROUND_ROBIN: { segment: "league", label: "エントリー・対戦表" },
  DOUBLE_ELIMINATION_GRAND_FINAL: null,
  DOUBLE_ELIMINATION_THIRD_PLACE: null,
};

export function DivisionDetailView({
  slug,
  tournamentId,
  division,
}: {
  slug: string;
  tournamentId: string;
  division: DivisionDetail;
}) {
  const base = `/orgs/${slug}/tournaments/${tournamentId}/divisions/${division.id}`;
  const setup = SETUP_LINKS[division.format];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <h1 className="text-lg font-bold text-slate-800">{division.name}</h1>
        <div className="flex gap-2">
          {/* 編集画面を持たない形式ではボタンを出さない。押しても 404 になる */}
          {setup !== null && (
            <Link
              href={`${base}/${setup.segment}`}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              {setup.label}
            </Link>
          )}
          <Link
            href={`${base}/edit`}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            部門を編集
          </Link>
        </div>
      </div>

      <dl className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">試合形式</dt>
          <dd className="text-slate-800">
            {DIVISION_FORMAT_LABELS[division.format]}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">作成日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(division.createdAt)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division "src/app/orgs"`
Expected: PASS

既存の部門詳細ページのテスト（`divisions/[divisionId]/page.test.tsx`）が
リンク名で落ちる場合は、その部門の形式に合わせて期待値を直す。

- [ ] **Step 5: コミット**

```bash
git add src/components/division/DivisionDetail.tsx src/components/division/DivisionDetail.test.tsx "src/app/orgs"
git commit -m "$(cat <<'EOF'
feat(division): route the setup button by division format

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: 全体の検証とアーキテクチャ文書の追記

**Files:**
- Modify: `docs/code-design/architecture.md`（「features/division の共有ドメイン」の節）

- [ ] **Step 1: 全テストと型検査と lint を通す**

Run: `pnpm test`
Expected: 全件 PASS

Run: `pnpm typecheck`
Expected: エラー 0 件

Run: `pnpm lint`
Expected: 変更したファイルにエラーが無い（CRLF 由来の指摘は無視してよい）

失敗があれば直してから次へ進む。

- [ ] **Step 2: アーキテクチャ文書を直す**

`docs/code-design/architecture.md` の「features/division の共有ドメイン」の節を
次の内容に置き換える（`single-elimination` の説明は残し、リーグと
`matching-strategy` の記述を足す）:

```markdown
## features/division の共有ドメイン

`features/division/single-elimination/` と `features/division/round-robin/` は
スライスではなく、カテゴリ直下に置く共有ドメインである。`handler.ts` と
`repository.ts` を持たないことでスライスと見分けられる。

形式ごとの違いは `matching-strategy.ts` が引き受ける。エントリーを足した／
消した／並べ替えたときに `matchingConfig` をどう作り直すかと、形式ごとの
エントリー上限をここが決め、スライス側は「エントリー配列をどう変えるか」
だけを書く。`switch` は `EditableFormat`（編集画面を持つ形式）に対して
網羅的に書くので、対応形式を足すと分岐の書き忘れがコンパイルエラーになる。

シングルエリミネーションのブラケットは「1 回戦のスロット割当配列（長さ 2 の冪）」
だけで完全に決まる。2 回戦以降のスロットは必ず `winnerOf` だからである。
この配列を唯一の状態とし、木は `buildFromSlots` で毎回組み立て直す。
試合 id を `m{round}-{order}` の決定的な形にしてあるため、組み立て直しても
`winnerOf` の参照が壊れる経路が存在しない。

`buildFromSlots` は渡された配列の長さが 2 の冪でなくても、次の 2 の冪まで
`{ kind: "bye" }` で埋めてから組み立てる。`generateSlots` の出力や `placeEntry` が
返す配列はすでに 2 の冪だが、埋め立てが働く経路は実在する。`swap-slots` は保存済みの
`matchingConfig` を `toSlots` で取り出して `buildFromSlots` に渡し直すため、DB の値が
2 の冪でない（1 回戦の試合数が 2 の冪でない）場合、この往復で正規形に矯正される。
つまりこの埋め立ては死んだコードではなく、外から入った歪な値を直す経路そのものである。

リーグ（総当たり）は円卓法で節に割る。試合 id は `r{節}-{節内の位置}` で、
やはり決定的である。エントリーが 1 人増えれば全員の試合が増えるため、
トーナメントの「一番下の bye を埋める」に相当する部分更新が存在しない。
追加・削除・並べ替えのいずれでも対戦表を丸ごと作り直す。奇数人の休みは
試合として保存しない（保存すると `features/schedule` が実在しない試合の行を
出してしまう）。誰が休みかは `round-robin/view.ts` が節ごとの差分から算出する。

`setup-store.ts` は全スライス共通の read-modify-write を持つ。所有権つきの読み出し、
Json のパース、勝敗が記録済みかの確認、保存前の検証、`updateMany` での書き戻しを
1 つのトランザクションにまとめる。形式の判定もここに置き、編集画面を持たない形式は
「その部門は無い」として `{ found: false }` に倒す。Server Action はページを
経由せず直接叩ける別の入口なので、画面の分岐だけでは守れない。
`swap-slots` だけは 1 回戦スロットの入れ替えという勝ち上がり木専用の操作なので、
スライス側でさらに `SINGLE_ELIMINATION` に絞る。
```

同じファイルの `features/bracket と features/tournament の違い` の節にある
「対応するのは `SINGLE_ELIMINATION` のみで、それ以外は `null` を返す」は
事実のままなので変えない（部門詳細のブラケット表示はリーグ未対応）。

- [ ] **Step 3: 手で動かして確かめる**

Run: `pnpm dev`

ブラウザで次を確認する（`BYPASS_AUTH=1` のときは Cookie の `USER_ID` に `1` を入れる）:

1. 部門を「リーグ（総当たり）」で作る → 詳細ページのボタンが「エントリー・対戦表」になり `/league` へ行く
2. `/league` でメンバーを 5 人エントリーする
3. 「対戦表を生成」を押す → 星取表に 10 マス（対角と空きを除く）試合番号が入り、節ごとの一覧が 5 節ぶん出て、各節に「休み: 誰か」が出る
4. 試合番号を「A-1」に変えて保存 → 星取表と一覧の両方に反映される
5. エントリーを 1 人並べ替える → 「並べ替えに合わせて対戦表を作り直しました」が出て、対戦表が変わる
6. 大会の試合一覧（`/tournaments/[id]/matches`）を開く → リーグの試合が「第1節 第1試合」と表示される
7. `/setup` を URL で直に開く → 404 になる

- [ ] **Step 4: コミット**

```bash
git add docs/code-design/architecture.md
git commit -m "$(cat <<'EOF'
docs(division): record the round-robin domain and the matching strategy

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```
