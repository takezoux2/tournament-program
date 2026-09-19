# 大会の参加者一覧 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大会単位の参加者一覧を管理画面に新設し、選手番号の編集・参加者の直接追加・削除をできるようにしたうえで、公開側の参加者一覧に出場部門を表示する。

**Architecture:** `Participant` エンティティを持つ新しい垂直スライスのカテゴリ `src/features/participant/` を作る。一覧は `Participant` と `Division.entries`（Json）を突き合わせて出場部門を導出する 1 つの repository 関数に集約し、管理・公開の両ページが共有する。選手番号の編集スライスは責務に合わせて `features/division` から移設する。採番規則は `features` 同士が依存できないため、純粋関数として `src/lib/participant/` に括り出して両経路で共有する。

**Tech Stack:** Next.js 16（App Router / Server Actions）、React 19、Prisma 7（PostgreSQL）、Effect-TS、Zod 4、Tailwind CSS 4、Vitest + Testing Library、Biome

## Global Constraints

- パッケージマネージャは `pnpm`。テストは `pnpm test`、型検査は `pnpm typecheck`、lint は `pnpm lint`。
- 設計の出典は `docs/superpowers/specs/2026-09-19-tournament-participant-list-design.md`。
- アーキテクチャは垂直スライス（`docs/code-design/architecture.md`）。**`src/features/` 配下で同列・下位ディレクトリへの import は禁止**。共有物はカテゴリ直下か `src/lib/` へ置く。
- `src/features/` 配下に `.tsx` を置かない。画面のコンポーネントは `src/components/` へ。
- DB を触る repository は先頭に `import "server-only";` を書く。
- 所有権は必ず Prisma の `where` に入れる（取得後に検証する形にしない）。大会配下は `{ tournament: { id: tournamentId, organizationId } }` の形。
- 呼称は管理・公開とも「参加者一覧」。「選手一覧」という語は使わない。`playerNumber` の UI ラベルだけは既存どおり「選手番号」。
- コミットメッセージは既存に倣い `<type>(<scope>): <summary>` 形式。末尾に次の行を付ける。
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
- Windows チェックアウトのため Biome が CRLF 由来の差分を出すことがある。lint の合否は自分が書いた内容で判断する。
- マイグレーションは追加しない（スキーマ変更なし）。

---

### Task 1: 選手番号の採番を `src/lib/participant/` に括り出す

採番規則「10 進整数として読める番号の最大値 + 1」は現在 `src/features/division/add-entry/repository.ts` の内部関数に閉じている。大会に直接追加する経路（Task 5）でも同じ規則が要るが、`features` 同士は依存できないため純粋関数として下位共通層へ移す。

**Files:**
- Create: `src/lib/participant/player-number.ts`
- Test: `src/lib/participant/player-number.test.ts`
- Modify: `src/features/division/add-entry/repository.ts`（内部関数 `nextPlayerNumber` を共有関数の呼び出しに置き換える）

**Interfaces:**
- Consumes: なし
- Produces: `nextPlayerNumber(existing: readonly string[]): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/participant/player-number.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextPlayerNumber } from "./player-number";

describe("nextPlayerNumber", () => {
  it("1 件も無ければ 1 を返す", () => {
    expect(nextPlayerNumber([])).toBe("1");
  });

  it("10 進整数として読める番号の最大値 + 1 を返す", () => {
    // 文字列比較だと "9" が最大になってしまう。数値として読むことを確かめる。
    expect(nextPlayerNumber(["1", "2", "9", "10"])).toBe("11");
  });

  it("10 進として読めない番号は最大値の計算から外す", () => {
    expect(nextPlayerNumber(["A-1", "3", "第2"])).toBe("4");
  });

  it("読める番号が 1 つも無ければ 1 を返す", () => {
    expect(nextPlayerNumber(["A-1", "B-2"])).toBe("1");
  });

  it("負の数や小数の表記は読める番号として扱わない", () => {
    expect(nextPlayerNumber(["-5", "1.5", "2"])).toBe("3");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/lib/participant/player-number.test.ts`
Expected: FAIL（`Failed to resolve import "./player-number"`）

- [ ] **Step 3: 実装を書く**

`src/lib/participant/player-number.ts`:

```ts
/**
 * 次の選手番号。10 進整数として読める番号の最大値 + 1。
 * 手入力の "A-1" のような番号は序数を持たないので最大値の計算から外す。
 *
 * 部門のエントリー追加（features/division/add-entry）と大会への直接追加
 * （features/participant/add）の 2 経路が同じ規則で番号を振る必要があるが、
 * features どうしは依存できないため、下位共通層に純粋関数として置く。
 */
export const nextPlayerNumber = (existing: readonly string[]): string => {
  const max = existing.reduce(
    (acc, value) => (/^\d+$/.test(value) ? Math.max(acc, Number(value)) : acc),
    0,
  );
  return String(max + 1);
};
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/lib/participant/player-number.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: `add-entry` を共有関数に差し替える**

`src/features/division/add-entry/repository.ts` の import に 1 行足す（既存の import 群の並びに合わせる。`@/lib/...` は `../errors` より前）:

```ts
import { nextPlayerNumber } from "@/lib/participant/player-number";
```

そのうえで、既存の内部関数 `nextPlayerNumber`（`/**\n * 次の選手番号。...` のコメントごと）を次で置き換える:

```ts
/**
 * この大会で使われている選手番号を集め、次の番号を決める。
 * 規則そのものは lib/participant/player-number.ts が持つ（大会への
 * 直接追加と同じ規則にするため）。ここは材料を集めるだけ。
 */
const nextPlayerNumberFor = async (
  tx: DivisionSetupTx,
  tournamentId: string,
): Promise<string> => {
  const rows = await tx.participant.findMany({
    where: { tournamentId },
    select: { playerNumber: true },
  });
  return nextPlayerNumber(rows.map((row) => row.playerNumber));
};
```

同ファイル内の唯一の呼び出し箇所（`participant.create` の `data.playerNumber`）を書き換える:

```ts
      playerNumber: await nextPlayerNumberFor(tx, tournamentId),
```

- [ ] **Step 6: 既存テストが壊れていないことを確認する**

Run: `pnpm exec vitest run src/features/division/add-entry src/lib/participant`
Expected: PASS（既存の add-entry のテストがすべて通る）

Run: `pnpm typecheck`
Expected: エラーなしで終了

- [ ] **Step 7: コミット**

```bash
git add src/lib/participant src/features/division/add-entry/repository.ts
git commit -F - <<'EOF'
refactor(participant): extract player number assignment into lib

大会への直接追加でも同じ採番規則が要るが features 同士は依存できないため、
純粋関数として lib/participant へ括り出した。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: `features/participant` の共有基盤

カテゴリ直下に置く共有物（フォーム状態・エラー・文言・再検証）を作る。以降のスライスはすべてこれに依存する。

**Files:**
- Create: `src/features/participant/state.ts`
- Create: `src/features/participant/scope.ts`
- Create: `src/features/participant/errors.ts`
- Create: `src/features/participant/messages.ts`
- Create: `src/features/participant/effect-to-form-state.ts`
- Create: `src/features/participant/revalidate.ts`
- Test: `src/features/participant/errors.test.ts`
- Test: `src/features/participant/messages.test.ts`
- Test: `src/features/participant/revalidate.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `ParticipantFormState = { error: string | null; confirm?: { message: string; value: string } }`
  - `INITIAL_PARTICIPANT_FORM_STATE: ParticipantFormState`
  - `ParticipantFormAction = (state: ParticipantFormState, formData: FormData) => Promise<ParticipantFormState>`
  - `ParticipantIds = { organizationId: string; tournamentId: string }`
  - `ParticipantOutcome<T> = { found: false } | { found: true; value: T }`
  - エラークラス `ParticipantNotFoundError({ participantId })` / `ParticipantDuplicateError({ memberId })` / `ParticipantMemberNotFoundError({ memberId })` / `ParticipantEnteredError({ divisionNames })` / `ParticipantDataError({ divisionId })` / `UnexpectedParticipantError({ reason })`、union `ParticipantError`、`toParticipantError(reason: unknown): ParticipantError`
  - `participantErrorMessage(error: ParticipantError): string`
  - `participantErrorFormState(cause: Cause.Cause<ParticipantError>): ParticipantFormState`
  - `revalidateParticipants(slug: string, tournamentId: string): void`
  - `revalidatePlayerNumber(slug: string, tournamentId: string, divisionId: string | null): void`

- [ ] **Step 1: 状態とスコープの型を書く**

テストを持たない型だけのファイルなので先に置く。

`src/features/participant/state.ts`:

```ts
/**
 * 参加者のフォームが Server Action から受け取る状態。
 * handler（features）とフォーム（components）の両方が参照するため、
 * どちらからも依存できる features 直下に置く。
 */
export type ParticipantFormState = {
  error: string | null;
  /**
   * 選手番号の重複確認待ち。value は確認対象の入力値。クライアントは value を
   * confirmedNumber として再送し、同じ値のときだけ確定される。
   */
  confirm?: { message: string; value: string };
};

export const INITIAL_PARTICIPANT_FORM_STATE: ParticipantFormState = {
  error: null,
};

export type ParticipantFormAction = (
  state: ParticipantFormState,
  formData: FormData,
) => Promise<ParticipantFormState>;
```

`src/features/participant/scope.ts`:

```ts
/**
 * 所有権の 2 段。参加者と選手番号は大会単位の属性なので、部門は要らない。
 * 全スライスがこの形で受け渡す。スライスどうしは import できないため、
 * features/division/setup-store.ts の DivisionIds と同じくカテゴリ直下に置く。
 */
export type ParticipantIds = {
  organizationId: string;
  tournamentId: string;
};

/**
 * found: false は「この組織のこの大会が見つからない」。存在しない場合と
 * 権限が無い場合を区別しない。呼び出し側は notFound() へ倒す。
 * features/division/setup-store.ts の DivisionSetupOutcome と同じ役割。
 */
export type ParticipantOutcome<T> =
  | { found: false }
  | { found: true; value: T };
```

- [ ] **Step 2: エラーの失敗するテストを書く**

`src/features/participant/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ParticipantEnteredError,
  ParticipantNotFoundError,
  toParticipantError,
  UnexpectedParticipantError,
} from "./errors";

describe("toParticipantError", () => {
  it("ドメインのエラーはそのまま通す", () => {
    const error = new ParticipantNotFoundError({ participantId: "p1" });

    expect(toParticipantError(error)).toBe(error);
  });

  it("配列の詳細を持つエラーもそのまま通す", () => {
    const error = new ParticipantEnteredError({ divisionNames: ["男子の部"] });

    expect(toParticipantError(error)).toBe(error);
  });

  it("それ以外は UnexpectedParticipantError に写す", () => {
    const reason = new Error("connect ECONNREFUSED");

    const result = toParticipantError(reason);

    expect(result).toBeInstanceOf(UnexpectedParticipantError);
    expect(result._tag).toBe("UnexpectedParticipantError");
  });

  it("_tag がプロトタイプ由来の値でもドメインのエラーと誤認しない", () => {
    // `in` でタグ表を引くと "toString" などが通ってしまい、messages.ts の
    // Match.exhaustive が文言を返せず実行時に落ちる。
    const result = toParticipantError({ _tag: "toString" });

    expect(result).toBeInstanceOf(UnexpectedParticipantError);
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/features/participant/errors.test.ts`
Expected: FAIL（`Failed to resolve import "./errors"`）

- [ ] **Step 4: エラーを実装する**

`src/features/participant/errors.ts`:

```ts
import { Data, Predicate } from "effect";

/** 指定された参加者がこの組織のこの大会に無いことを表す。 */
export class ParticipantNotFoundError extends Data.TaggedError(
  "ParticipantNotFoundError",
)<{
  readonly participantId: string;
}> {}

/** 同じ大会に同じメンバーの参加者が既に居ることを表す。 */
export class ParticipantDuplicateError extends Data.TaggedError(
  "ParticipantDuplicateError",
)<{
  readonly memberId: string;
}> {}

/** 選ばれた Member がこの組織に無いことを表す。 */
export class ParticipantMemberNotFoundError extends Data.TaggedError(
  "ParticipantMemberNotFoundError",
)<{
  readonly memberId: string;
}> {}

/** 部門にエントリー済みで削除できないことを表す。 */
export class ParticipantEnteredError extends Data.TaggedError(
  "ParticipantEnteredError",
)<{
  readonly divisionNames: readonly string[];
}> {}

/** 削除の判定中に Division.entries の Json が壊れていたことを表す。 */
export class ParticipantDataError extends Data.TaggedError(
  "ParticipantDataError",
)<{
  readonly divisionId: string;
}> {}

export class UnexpectedParticipantError extends Data.TaggedError(
  "UnexpectedParticipantError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type ParticipantError =
  | ParticipantNotFoundError
  | ParticipantDuplicateError
  | ParticipantMemberNotFoundError
  | ParticipantEnteredError
  | ParticipantDataError
  | UnexpectedParticipantError;

/**
 * ParticipantError の全タグをコンパイラに列挙させるための対照表。
 * union にタグを足してここへの追記を忘れるとコンパイルエラーになる。
 * features/division/errors.ts と同じ仕掛け。
 */
const participantErrorTags: Record<ParticipantError["_tag"], true> = {
  ParticipantNotFoundError: true,
  ParticipantDuplicateError: true,
  ParticipantMemberNotFoundError: true,
  ParticipantEnteredError: true,
  ParticipantDataError: true,
  UnexpectedParticipantError: true,
};

/**
 * `in` ではなく Object.hasOwn を使う。`in` はプロトタイプ鎖まで辿るため、
 * _tag が "toString" のオブジェクトが ParticipantError と判定され、
 * messages.ts の Match.exhaustive が文言を返せず実行時に落ちる。
 */
const isParticipantError = (reason: unknown): reason is ParticipantError =>
  Predicate.isRecord(reason) &&
  Predicate.hasProperty(reason, "_tag") &&
  typeof reason._tag === "string" &&
  Object.hasOwn(participantErrorTags, reason._tag);

/**
 * repository のトランザクション内で投げたドメインのエラーはそのまま通し、
 * それ以外（Prisma の例外など）は UnexpectedParticipantError に写す。
 * ここで写しておくことで、usecase より上の層に Prisma の型が漏れない。
 */
export const toParticipantError = (reason: unknown): ParticipantError =>
  isParticipantError(reason)
    ? reason
    : new UnexpectedParticipantError({ reason });
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant/errors.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 6: 文言の失敗するテストを書く**

`src/features/participant/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ParticipantDataError,
  type ParticipantError,
  ParticipantDuplicateError,
  ParticipantEnteredError,
  ParticipantMemberNotFoundError,
  ParticipantNotFoundError,
  UnexpectedParticipantError,
} from "./errors";
import { participantErrorMessage } from "./messages";

describe("participantErrorMessage", () => {
  // タグごとに固有の文言を返すことを確かめる。長さだけの検証だと、
  // 文言の取り違えや使い回しがあってもテストが通ってしまう。
  it.each<[string, ParticipantError, string]>([
    [
      "ParticipantNotFoundError",
      new ParticipantNotFoundError({ participantId: "p1" }),
      "対象の参加者が見つかりません。画面を再読み込みしてください",
    ],
    [
      "ParticipantDuplicateError",
      new ParticipantDuplicateError({ memberId: "m1" }),
      "その人はすでにこの大会の参加者です",
    ],
    [
      "ParticipantMemberNotFoundError",
      new ParticipantMemberNotFoundError({ memberId: "m1" }),
      "選択したメンバーが見つかりません",
    ],
    [
      "ParticipantDataError",
      new ParticipantDataError({ divisionId: "d1" }),
      "部門のデータが壊れているため削除できません",
    ],
  ])("%s の文言", (_tag, error, expected) => {
    expect(participantErrorMessage(error)).toBe(expected);
  });

  it("エントリー済みは部門名を並べて案内する", () => {
    const message = participantErrorMessage(
      new ParticipantEnteredError({ divisionNames: ["男子の部", "女子の部"] }),
    );

    expect(message).toBe(
      "男子の部、女子の部 にエントリー中です。先に部門の編集画面から外してください",
    );
  });

  it("予期しない失敗は内部の理由を画面に出さない", () => {
    const message = participantErrorMessage(
      new UnexpectedParticipantError({
        reason: new Error("connect ECONNREFUSED"),
      }),
    );

    expect(message).toBe("処理に失敗しました。時間をおいて再度お試しください");
    expect(message).not.toContain("ECONNREFUSED");
  });
});
```

- [ ] **Step 7: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/features/participant/messages.test.ts`
Expected: FAIL（`Failed to resolve import "./messages"`）

- [ ] **Step 8: 文言と form state 変換を実装する**

`src/features/participant/messages.ts`:

```ts
import { Match } from "effect";
import type { ParticipantError } from "./errors";

/**
 * Match.exhaustive により、ParticipantError にタグを足したのにここへ
 * 文言を足し忘れるとコンパイルエラーになる。
 */
export const participantErrorMessage: (error: ParticipantError) => string =
  Match.type<ParticipantError>().pipe(
    Match.tag(
      "ParticipantNotFoundError",
      () => "対象の参加者が見つかりません。画面を再読み込みしてください",
    ),
    Match.tag(
      "ParticipantDuplicateError",
      () => "その人はすでにこの大会の参加者です",
    ),
    Match.tag(
      "ParticipantMemberNotFoundError",
      () => "選択したメンバーが見つかりません",
    ),
    Match.tag(
      "ParticipantEnteredError",
      (error) =>
        `${error.divisionNames.join("、")} にエントリー中です。先に部門の編集画面から外してください`,
    ),
    Match.tag(
      "ParticipantDataError",
      () => "部門のデータが壊れているため削除できません",
    ),
    Match.tag(
      "UnexpectedParticipantError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
```

`src/features/participant/effect-to-form-state.ts`:

```ts
import { Cause, Option } from "effect";
import type { ParticipantError } from "./errors";
import { participantErrorMessage } from "./messages";
import type { ParticipantFormState } from "./state";

const FALLBACK_MESSAGE = "処理に失敗しました。時間をおいて再度お試しください";

/** add / remove / set-player-number が同じ変換を持つのを避けるため直下に置く。 */
export const participantErrorFormState = (
  cause: Cause.Cause<ParticipantError>,
): ParticipantFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? participantErrorMessage(failure.value)
      : FALLBACK_MESSAGE,
  };
};
```

- [ ] **Step 9: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant/messages.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 10: 再検証の失敗するテストを書く**

`src/features/participant/revalidate.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

const { revalidateParticipants, revalidatePlayerNumber } = await import(
  "./revalidate"
);

describe("revalidateParticipants", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
  });

  it("管理と公開の参加者一覧を再検証する", () => {
    revalidateParticipants("tennis", "t1");

    expect(revalidatePath.mock.calls.flat()).toEqual([
      "/orgs/tennis/tournaments/t1/participants",
      "/t/t1/participants",
    ]);
  });
});

describe("revalidatePlayerNumber", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
  });

  it("divisionId が無ければ参加者一覧だけを再検証する", () => {
    // 番号は大会内で共通なので、部門を経由しない編集でも一覧は必ず対象。
    revalidatePlayerNumber("tennis", "t1", null);

    expect(revalidatePath.mock.calls.flat()).toEqual([
      "/orgs/tennis/tournaments/t1/participants",
      "/t/t1/participants",
    ]);
  });

  it("divisionId があれば部門の編集画面も再検証する", () => {
    revalidatePlayerNumber("tennis", "t1", "d1");

    expect(revalidatePath.mock.calls.flat()).toEqual([
      "/orgs/tennis/tournaments/t1/participants",
      "/t/t1/participants",
      "/orgs/tennis/tournaments/t1/divisions/d1",
      "/orgs/tennis/tournaments/t1/divisions/d1/setup",
      "/orgs/tennis/tournaments/t1/divisions/d1/league",
    ]);
  });
});
```

- [ ] **Step 11: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/features/participant/revalidate.test.ts`
Expected: FAIL（`Failed to resolve import "./revalidate"`）

- [ ] **Step 12: 再検証を実装する**

`src/features/participant/revalidate.ts`:

```ts
import { revalidatePath } from "next/cache";

/**
 * 参加者を足した・消したあとに再検証すべきページ。
 * 公開側の一覧も同じ Participant を読むため一緒に叩く。
 */
export const revalidateParticipants = (
  slug: string,
  tournamentId: string,
): void => {
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}/participants`);
  revalidatePath(`/t/${tournamentId}/participants`);
};

/**
 * 選手番号を変えたあとに再検証すべきページ。番号は大会内で共通なので
 * 参加者一覧は常に対象。部門の編集画面から変えたときは divisionId が渡るので
 * その部門の 3 画面も叩く（形式ごとに編集画面が分かれているが、呼び出し側は
 * 形式を知らないため両方叩く。存在しない側を叩いても害はない）。
 *
 * features/division/revalidate.ts の revalidateDivisionSetup と同じ 3 本だが、
 * 兄弟カテゴリは import できないためここに持つ。
 */
export const revalidatePlayerNumber = (
  slug: string,
  tournamentId: string,
  divisionId: string | null,
): void => {
  revalidateParticipants(slug, tournamentId);
  if (divisionId === null) {
    return;
  }
  const base = `/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`;
  revalidatePath(base);
  revalidatePath(`${base}/setup`);
  revalidatePath(`${base}/league`);
};
```

- [ ] **Step 13: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant`
Expected: PASS（3 ファイル）

Run: `pnpm typecheck`
Expected: エラーなしで終了

- [ ] **Step 14: コミット**

```bash
git add src/features/participant
git commit -F - <<'EOF'
feat(participant): add shared foundation for the participant feature

フォーム状態・エラー・文言・再検証をカテゴリ直下に用意した。
以降の add / remove / set-player-number スライスがこれを共有する。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: 出場部門つきの参加者一覧 repository

管理・公開の両ページが共有する唯一の読み出し。

**Files:**
- Create: `src/features/participant/repository.ts`
- Test: `src/features/participant/repository.test.ts`

**Interfaces:**
- Consumes: なし（`@/lib/division/parse` の `parseDivisionEntries` / `DivisionJsonError` を使う）
- Produces:
  - `type ParticipantDivision = { id: string; name: string }`
  - `type TournamentParticipant = { id: string; name: string; nameKana: string; playerNumber: string; team?: string; divisions: ParticipantDivision[] }`
  - `listParticipantsWithDivisions(organizationId: string, tournamentId: string): Promise<TournamentParticipant[]>`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/participant/repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const participantFindMany = vi.fn();
const divisionFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    participant: { findMany: (args: unknown) => participantFindMany(args) },
    division: { findMany: (args: unknown) => divisionFindMany(args) },
  },
}));

const { listParticipantsWithDivisions } = await import("./repository");

const participantRow = (
  id: string,
  playerNumber: string,
  name = "竹添",
  team: string | null = null,
) => ({
  id,
  team,
  playerNumber,
  member: { name, nameKana: "たけぞえ" },
});

const entriesJson = (participantIds: string[]) => ({
  version: 1,
  entries: participantIds.map((participantId, index) => ({
    id: `e${index}`,
    participantId,
    seed: index,
  })),
});

describe("listParticipantsWithDivisions", () => {
  it("組織と大会の所有権を where に入れて読む", async () => {
    // organizationId を落とすと他組織の大会の名簿まで見えてしまう。
    participantFindMany.mockResolvedValue([]);
    divisionFindMany.mockResolvedValue([]);

    await listParticipantsWithDivisions("o1", "t1");

    expect(participantFindMany).toHaveBeenCalledWith({
      where: { tournament: { id: "t1", organizationId: "o1" } },
      select: {
        id: true,
        team: true,
        playerNumber: true,
        member: { select: { name: true, nameKana: true } },
      },
    });
    expect(divisionFindMany).toHaveBeenCalledWith({
      where: { tournament: { id: "t1", organizationId: "o1" } },
      orderBy: { order: "asc" },
      select: { id: true, name: true, entries: true },
    });
  });

  it("出場部門を Division.order 昇順で積む", async () => {
    participantFindMany.mockResolvedValue([participantRow("p1", "1")]);
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "男子の部", entries: entriesJson(["p1"]) },
      { id: "d2", name: "女子の部", entries: entriesJson(["p1"]) },
    ]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result[0].divisions).toEqual([
      { id: "d1", name: "男子の部" },
      { id: "d2", name: "女子の部" },
    ]);
  });

  it("どの部門にも居ない参加者は空配列になる", async () => {
    participantFindMany.mockResolvedValue([participantRow("p1", "1")]);
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "男子の部", entries: entriesJson(["p2"]) },
    ]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result[0].divisions).toEqual([]);
  });

  it("選手番号の自然順で返す", async () => {
    // 文字列順だと "10" が "2" より前に来てしまう。
    participantFindMany.mockResolvedValue([
      participantRow("p1", "10"),
      participantRow("p2", "2"),
    ]);
    divisionFindMany.mockResolvedValue([]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result.map((row) => row.playerNumber)).toEqual(["2", "10"]);
  });

  it("team の null は運ばない", async () => {
    participantFindMany.mockResolvedValue([
      participantRow("p1", "1", "竹添", null),
      participantRow("p2", "2", "山田", "A中学"),
    ]);
    divisionFindMany.mockResolvedValue([]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result[0].team).toBeUndefined();
    expect(result[1].team).toBe("A中学");
  });

  it("Json が壊れた部門は読み飛ばし、名簿と他の部門は返す", async () => {
    // 1 部門の Json が壊れただけで名簿ごと 500 にするのは釣り合わない。
    participantFindMany.mockResolvedValue([participantRow("p1", "1")]);
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "壊れた部門", entries: { version: 1, entries: "x" } },
      { id: "d2", name: "女子の部", entries: entriesJson(["p1"]) },
    ]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result).toHaveLength(1);
    expect(result[0].divisions).toEqual([{ id: "d2", name: "女子の部" }]);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/features/participant/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 3: 実装を書く**

`src/features/participant/repository.ts`:

```ts
import "server-only";
import { DivisionJsonError, parseDivisionEntries } from "@/lib/division/parse";
import { prisma } from "@/shared/db/prisma";

/** 参加者が出場する部門。表示に要る最小限だけを運ぶ。 */
export type ParticipantDivision = {
  id: string;
  name: string;
};

/** 大会の参加者。表示名は Member から、出場部門は Division.entries から解決済み。 */
export type TournamentParticipant = {
  id: string;
  name: string;
  nameKana: string;
  /** 選手番号。大会単位で Participant が持つ */
  playerNumber: string;
  team?: string;
  /** 出場部門。Division.order 昇順。どの部門にも居なければ空配列。 */
  divisions: ParticipantDivision[];
};

/**
 * 選手番号は文字列だが、閲覧者は数値として読む。numeric: true にしないと
 * "10" が "2" より前に来る。Collator はモジュール直下で 1 度だけ作る
 * （生成が重く、呼び出しのたびに作る理由がない）。
 */
const PLAYER_NUMBER_COLLATOR = new Intl.Collator("ja", { numeric: true });

/**
 * 大会の参加者を、出場部門つきで選手番号の自然順に返す。
 * where を tournament 経由にすることで、組織と大会の所有権を 1 クエリで担保する。
 *
 * 出場部門は Division.entries（Json）からしか分からないため、部門を全件読んで
 * participantId で引ける形に組み直す。出場部門が要らない呼び出し（ブラケット描画・
 * エントリー一覧）には features/division/repository.ts の
 * listParticipantsInTournament が残っており、そちらはこの読み出しを負わない。
 */
export const listParticipantsWithDivisions = async (
  organizationId: string,
  tournamentId: string,
): Promise<TournamentParticipant[]> => {
  const ownership = { tournament: { id: tournamentId, organizationId } };

  const [participants, divisions] = await Promise.all([
    prisma.participant.findMany({
      where: ownership,
      select: {
        id: true,
        team: true,
        playerNumber: true,
        member: { select: { name: true, nameKana: true } },
      },
    }),
    prisma.division.findMany({
      where: ownership,
      orderBy: { order: "asc" },
      select: { id: true, name: true, entries: true },
    }),
  ]);

  const byParticipant = new Map<string, ParticipantDivision[]>();
  for (const division of divisions) {
    let entries: ReturnType<typeof parseDivisionEntries>;
    try {
      entries = parseDivisionEntries(division.entries);
    } catch (reason) {
      // 1 部門の Json が壊れただけで名簿ごと落とさない。この一覧の主題は
      // 参加者で、出場部門はその補足である（features/schedule/repository.ts が
      // resultConfig を既定値で描くのと同じ判断）。削除の可否を決める
      // remove/repository.ts は逆に、読み飛ばさず削除を止める。
      if (reason instanceof DivisionJsonError) {
        continue;
      }
      throw reason;
    }

    for (const entry of entries.entries) {
      const item = { id: division.id, name: division.name };
      const list = byParticipant.get(entry.participantId);
      if (list === undefined) {
        byParticipant.set(entry.participantId, [item]);
      } else {
        list.push(item);
      }
    }
  }

  return participants
    .map((row) => ({
      id: row.id,
      name: row.member.name,
      nameKana: row.member.nameKana,
      playerNumber: row.playerNumber,
      // team は省略可能なプロパティ。null は運ばない。
      team: row.team ?? undefined,
      divisions: byParticipant.get(row.id) ?? [],
    }))
    .sort((left, right) =>
      PLAYER_NUMBER_COLLATOR.compare(left.playerNumber, right.playerNumber),
    );
};
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant/repository.test.ts`
Expected: PASS（6 tests）

Run: `pnpm typecheck`
Expected: エラーなしで終了

- [ ] **Step 5: コミット**

```bash
git add src/features/participant/repository.ts src/features/participant/repository.test.ts
git commit -F - <<'EOF'
feat(participant): list tournament participants with their divisions

Participant と Division.entries を突き合わせて出場部門を解決する読み出し。
壊れた Json の部門は読み飛ばし、名簿は描き切る。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: 選手番号の編集スライスを `features/participant` へ移設

`features/division/set-player-number/` は `Participant.playerNumber`（大会単位の属性）を更新するスライスで、repository のコメント自身が「Division の Json ではない」と書いている。大会の参加者一覧からも同じ操作をするため、責務に合う場所へ移す。

**Files:**
- Create: `src/features/participant/set-player-number/schema.ts`（＋`schema.test.ts`）
- Create: `src/features/participant/set-player-number/repository.ts`（＋`repository.test.ts`）
- Create: `src/features/participant/set-player-number/usecase.ts`
- Create: `src/features/participant/set-player-number/handler.ts`（＋`handler.test.ts`）
- Delete: `src/features/division/set-player-number/`（7 ファイルすべて）
- Create: `src/components/participant/PlayerNumberForm.tsx`（＋`PlayerNumberForm.test.tsx`）
- Delete: `src/components/division/PlayerNumberForm.tsx` と `src/components/division/PlayerNumberForm.test.tsx`
- Modify: `src/components/division/EntryList.tsx`（import 元と prop の型）
- Modify: `src/components/division/DivisionSetup.tsx`（`DivisionSetupActions.setPlayerNumber` の型）
- Modify: `src/components/division/LeagueSetup.tsx`（`LeagueSetupActions.setPlayerNumber` の型）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`（import 元）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx`（モックのパス）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.tsx`（import 元）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.test.tsx`（モックのパス）
- Modify: `src/features/division/errors.ts`（`DivisionParticipantNotFoundError` を削除）
- Modify: `src/features/division/messages.ts`（対応する `Match.tag` を削除）

**Interfaces:**
- Consumes: Task 2 の `ParticipantError` / `ParticipantNotFoundError` / `toParticipantError` / `ParticipantIds` / `ParticipantOutcome` / `ParticipantFormState` / `ParticipantFormAction` / `INITIAL_PARTICIPANT_FORM_STATE` / `participantErrorFormState` / `revalidatePlayerNumber`
- Produces:
  - `setPlayerNumberSchema` / `type SetPlayerNumberInput = { participantId: string; playerNumber: string }`
  - `type SetPlayerNumberCommand = SetPlayerNumberInput & { confirmed: boolean }`
  - `type SetPlayerNumberResult = { updated: boolean }`
  - `setPlayerNumberInDb: SetPlayerNumberPort`
  - `setPlayerNumberForParticipant(port, ids, input)`
  - `setPlayerNumberAction: ParticipantFormAction`（`@/features/participant/set-player-number/handler`）
  - `PlayerNumberForm`（`@/components/participant/PlayerNumberForm`）— props: `{ participantId, playerNumber, participantName, slug, tournamentId, divisionId?, action }`

- [ ] **Step 1: schema を移す**

`src/features/participant/set-player-number/schema.ts` を新規作成し、`src/features/division/set-player-number/schema.ts` の内容をそのまま写す:

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

テストも同じ内容で移す。`src/features/participant/set-player-number/schema.test.ts`:

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

- [ ] **Step 2: repository を移し、ids から divisionId を外す**

`src/features/participant/set-player-number/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import {
  type ParticipantError,
  ParticipantNotFoundError,
  toParticipantError,
} from "../errors";
import type { ParticipantIds, ParticipantOutcome } from "../scope";
import type { SetPlayerNumberInput } from "./schema";

/** confirmed は「重複を承知で確定する」。handler が確認フローから導出する。 */
export type SetPlayerNumberCommand = SetPlayerNumberInput & {
  confirmed: boolean;
};

/** updated: false は「重複が見つかったので確認待ち」。 */
export type SetPlayerNumberResult = { updated: boolean };

export type SetPlayerNumberPort = (
  ids: ParticipantIds,
  input: SetPlayerNumberCommand,
) => Effect.Effect<
  ParticipantOutcome<SetPlayerNumberResult>,
  ParticipantError
>;

/**
 * 一意制約は無いので、重複チェックと更新を同一トランザクションに入れて
 * 確認フローの根拠にする。
 *
 * 戻り値を ParticipantOutcome で包むのは、大会に直接追加する add スライスと
 * handler の形を揃えるため。この repository は対象が無ければ
 * ParticipantNotFoundError を投げるので found: false は返らない。
 */
export const setPlayerNumberInDb: SetPlayerNumberPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(
        async (tx): Promise<ParticipantOutcome<SetPlayerNumberResult>> => {
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
            throw new ParticipantNotFoundError({
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
    catch: (reason) => toParticipantError(reason),
  });
```

- [ ] **Step 3: repository のテストを移す**

移設元のテストから、`ids` の `divisionId` と、期待するエラーのタグ名だけが変わる。
`src/features/participant/set-player-number/repository.test.ts`:

```ts
import { Cause, Effect, Exit, Option } from "effect";
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

// 部門は要らない。選手番号は大会単位の属性で、絞り込みもこの 2 つだけ。
const ids = { organizationId: "o1", tournamentId: "t1" };

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

  it("重複があり未確認なら更新せず確認待ちを返す", async () => {
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

  it("大会に居ない参加者なら ParticipantNotFoundError", async () => {
    participantFindFirst.mockResolvedValueOnce(null);

    const exit = await Effect.runPromiseExit(
      setPlayerNumberInDb(ids, {
        participantId: "p9",
        playerNumber: "7",
        confirmed: false,
      }),
    );

    expect(exit._tag).toBe("Failure");
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe("ParticipantNotFoundError");
      }
    }
    expect(participantUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: usecase を移す**

`src/features/participant/set-player-number/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { ParticipantError } from "../errors";
import type { ParticipantIds, ParticipantOutcome } from "../scope";
import type {
  SetPlayerNumberCommand,
  SetPlayerNumberPort,
  SetPlayerNumberResult,
} from "./repository";

export const setPlayerNumberForParticipant = (
  port: SetPlayerNumberPort,
  ids: ParticipantIds,
  input: SetPlayerNumberCommand,
): Effect.Effect<
  ParticipantOutcome<SetPlayerNumberResult>,
  ParticipantError
> => port(ids, input);
```

- [ ] **Step 5: handler を移し、divisionId を任意にする**

`src/features/participant/set-player-number/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { participantErrorFormState } from "../effect-to-form-state";
import { revalidatePlayerNumber } from "../revalidate";
import type { ParticipantFormState } from "../state";
import { setPlayerNumberInDb } from "./repository";
import { setPlayerNumberSchema } from "./schema";
import { setPlayerNumberForParticipant } from "./usecase";

export const setPlayerNumberAction = async (
  _prevState: ParticipantFormState,
  formData: FormData,
): Promise<ParticipantFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // 部門の編集画面から送られたときだけ入る。参加者一覧からは空。
  // 再検証の対象を決めるためだけに使い、絞り込みには使わない。
  const divisionIdValue = String(formData.get("divisionId") ?? "");
  const divisionId = divisionIdValue === "" ? null : divisionIdValue;

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
      { organizationId: organization.id, tournamentId },
      { ...parsed.data, confirmed },
    ),
  );

  if (Exit.isFailure(exit)) {
    return participantErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  if (!exit.value.value.updated) {
    return {
      error: null,
      confirm: {
        message: "同じ番号の選手がすでにいます。もう一度保存すると確定します",
        value: parsed.data.playerNumber,
      },
    };
  }

  revalidatePlayerNumber(slug, tournamentId, divisionId);
  return { error: null };
};
```

- [ ] **Step 6: handler のテストを移し、再検証の検証を足す**

`src/features/participant/set-player-number/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PARTICIPANT_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const setPlayerNumberInDb = vi.fn();
const revalidatePlayerNumber = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

// 関数呼び出しの順序を追跡するための配列
let calls: string[] = [];

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => {
    calls.push("requireOrganization");
    return requireOrganization(slug);
  },
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidatePlayerNumber: (
    slug: string,
    tournamentId: string,
    divisionId: string | null,
  ) => revalidatePlayerNumber(slug, tournamentId, divisionId),
}));
vi.mock("./repository", () => ({
  setPlayerNumberInDb: (ids: unknown, input: unknown) => {
    calls.push("setPlayerNumberInDb");
    return setPlayerNumberInDb(ids, input);
  },
}));

const { setPlayerNumberAction } = await import("./handler");

/** 部門の編集画面から送られたフォーム。divisionId が入る。 */
const fromDivision = (
  participantId: string,
  playerNumber: string,
  confirmedNumber?: string,
) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("participantId", participantId);
  data.set("playerNumber", playerNumber);
  if (confirmedNumber !== undefined) {
    data.set("confirmedNumber", confirmedNumber);
  }
  return data;
};

/** 大会の参加者一覧から送られたフォーム。divisionId は無い。 */
const fromParticipantList = (participantId: string, playerNumber: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("participantId", participantId);
  data.set("playerNumber", playerNumber);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  setPlayerNumberInDb.mockReset();
  revalidatePlayerNumber.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  setPlayerNumberInDb.mockReturnValue(
    Effect.succeed({ found: true, value: { updated: true } }),
  );
});

describe("setPlayerNumberAction", () => {
  it("認可を独立に確かめ、トリム済みの入力をポートへ渡す", async () => {
    await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      fromDivision("p1", " 7 "),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    // divisionId は絞り込みに使わない。ids は大会までの 2 段だけ。
    expect(setPlayerNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { participantId: "p1", playerNumber: "7", confirmed: false },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requireOrganization", "setPlayerNumberInDb"]);
  });

  it("部門の編集画面から送られたら、その部門も再検証の対象にする", async () => {
    const state = await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      fromDivision("p1", "7"),
    );

    expect(revalidatePlayerNumber).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
  });

  it("参加者一覧から送られた（divisionId なし）ときも保存できる", async () => {
    const state = await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      fromParticipantList("p1", "7"),
    );

    expect(state).toEqual({ error: null });
    expect(revalidatePlayerNumber).toHaveBeenCalledWith("acme", "t1", null);
  });

  it("重複していたら確認待ちを返し、再検証しない", async () => {
    setPlayerNumberInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { updated: false } }),
    );

    const state = await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      fromDivision("p1", "7"),
    );

    expect(state).toEqual({
      error: null,
      confirm: {
        message: "同じ番号の選手がすでにいます。もう一度保存すると確定します",
        value: "7",
      },
    });
    expect(revalidatePlayerNumber).not.toHaveBeenCalled();
  });

  it("confirm で返した値と同じ番号の再送は確認済みとしてポートへ渡す", async () => {
    await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      fromDivision("p1", " 7 ", "7"),
    );

    expect(setPlayerNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { participantId: "p1", playerNumber: "7", confirmed: true },
    );
  });

  it("確認後に番号を変えて送ったら未確認としてポートへ渡す", async () => {
    await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      fromDivision("p1", "8", "7"),
    );

    expect(setPlayerNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { participantId: "p1", playerNumber: "8", confirmed: false },
    );
  });

  it("選手番号が空なら入力エラーにする", async () => {
    const state = await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      fromDivision("p1", "  "),
    );

    expect(state.error).toBe("選手番号を入力してください");
    expect(setPlayerNumberInDb).not.toHaveBeenCalled();
  });

  it("参加者が見つからなければ文言を返す", async () => {
    const { ParticipantNotFoundError } = await import("../errors");
    setPlayerNumberInDb.mockReturnValue(
      Effect.fail(new ParticipantNotFoundError({ participantId: "p1" })),
    );

    const state = await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      fromDivision("p1", "7"),
    );

    expect(state.error).toBe(
      "対象の参加者が見つかりません。画面を再読み込みしてください",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    setPlayerNumberInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      setPlayerNumberAction(
        INITIAL_PARTICIPANT_FORM_STATE,
        fromDivision("p1", "7"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 7: 移設元を削除する**

```bash
git rm -r src/features/division/set-player-number
```

- [ ] **Step 8: `features/division` から `DivisionParticipantNotFoundError` を外す**

`src/features/division/errors.ts` から次の 3 箇所を削除する。

1. クラス定義（コメント `/** 指定された参加者がこの大会に無いことを表す。 */` を含む 6 行）
2. `export type DivisionError` の union から `| DivisionParticipantNotFoundError` の行
3. `const divisionErrorTags` から `DivisionParticipantNotFoundError: true,` の行

`src/features/division/messages.ts` から次を削除する。

```ts
    Match.tag(
      "DivisionParticipantNotFoundError",
      () => "対象の参加者が見つかりません。画面を再読み込みしてください",
    ),
```

- [ ] **Step 9: コンポーネントを移し、divisionId を任意にする**

`src/components/participant/PlayerNumberForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_PARTICIPANT_FORM_STATE,
  type ParticipantFormAction,
} from "@/features/participant/state";

/**
 * 選手番号のインライン編集。重複時はサーバが confirm を返すので、
 * その値を confirmedNumber として次の送信に積む。番号を変えて送り直すと
 * サーバ側で不一致になり、改めて確認が求められる。
 *
 * divisionId は部門の編集画面から使うときだけ渡す。サーバ側では
 * 再検証の対象を決めるのに使うだけで、絞り込みには使わない。
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
  divisionId?: string;
  action: ParticipantFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PARTICIPANT_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        {divisionId !== undefined && (
          <input type="hidden" name="divisionId" value={divisionId} />
        )}
        <input type="hidden" name="participantId" value={participantId} />
        <input
          type="hidden"
          name="confirmedNumber"
          value={state.confirm?.value ?? ""}
        />
        <label
          className="text-xs text-slate-500"
          htmlFor={`pn-${participantId}`}
        >
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

`src/components/participant/PlayerNumberForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ParticipantFormState } from "@/features/participant/state";
import { PlayerNumberForm } from "./PlayerNumberForm";

describe("PlayerNumberForm", () => {
  it("participantId と入力した番号を送る", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (_state: ParticipantFormState, _data: FormData) => ({
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
    expect(sent.get("divisionId")).toBe("d1");
  });

  it("divisionId を渡さなければ hidden の divisionId を送らない", async () => {
    // 参加者一覧からの編集。サーバ側は null として扱い、部門を再検証しない。
    const user = userEvent.setup();
    const action = vi.fn(
      async (_state: ParticipantFormState, _data: FormData) => ({
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
        action={action}
      />,
    );

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(action.mock.calls[0][1].get("divisionId")).toBeNull();
  });

  it("確認待ちの state ではメッセージを出し confirmedNumber を積む", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (
        _state: ParticipantFormState,
        _data: FormData,
      ): Promise<ParticipantFormState> => ({
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

移設元を削除する:

```bash
git rm src/components/division/PlayerNumberForm.tsx src/components/division/PlayerNumberForm.test.tsx
```

- [ ] **Step 10: 配線を差し替える**

`src/components/division/EntryList.tsx`:

- 1 行目の import を差し替える
  ```ts
  import type { DivisionParticipant } from "@/features/division/repository";
  import type { DivisionFormAction } from "@/features/division/state";
  import type { ParticipantFormAction } from "@/features/participant/state";
  import type { DivisionEntry } from "@/lib/division/types";
  import { PlayerNumberForm } from "@/components/participant/PlayerNumberForm";
  import { EntryRowActions } from "./EntryRowActions";
  ```
  （Biome の import 整列に従うので、保存後 `pnpm lint:fix` で並びを整える）
- props の型を `setPlayerNumberAction: DivisionFormAction;` → `setPlayerNumberAction: ParticipantFormAction;`

`src/components/division/DivisionSetup.tsx` の `DivisionSetupActions`:
- `setPlayerNumber: DivisionFormAction;` → `setPlayerNumber: ParticipantFormAction;`
- import に `import type { ParticipantFormAction } from "@/features/participant/state";` を足す

`src/components/division/LeagueSetup.tsx` の `LeagueSetupActions`: 同じ 2 点を行う。

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx` と
`.../league/page.tsx` の import を差し替える:

```ts
import { setPlayerNumberAction } from "@/features/participant/set-player-number/handler";
```

対応する `setup/page.test.tsx` と `league/page.test.tsx` の
`vi.mock("@/features/division/set-player-number/handler", ...)` と
`await import("@/features/division/set-player-number/handler")` を
`@/features/participant/set-player-number/handler` に書き換える。

- [ ] **Step 11: 全体を検証する**

Run: `pnpm typecheck`
Expected: エラーなしで終了（`DivisionParticipantNotFoundError` の参照が残っていればここで落ちる）

Run: `pnpm test`
Expected: すべて PASS

Run: `pnpm lint:fix`
Expected: 自分が触ったファイルに指摘が残らない

- [ ] **Step 12: コミット**

```bash
git add -A src/features/participant src/features/division src/components src/app
git commit -F - <<'EOF'
refactor(participant): move player number editing out of the division feature

選手番号は Participant（大会単位）の属性なので features/participant へ移した。
divisionId は再検証の対象を決めるためだけの任意項目になり、部門を経由しない
参加者一覧からも同じ確認フローで編集できる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: 参加者を大会に直接追加するスライス

**Files:**
- Create: `src/features/participant/add/schema.ts`（＋`schema.test.ts`）
- Create: `src/features/participant/add/repository.ts`（＋`repository.test.ts`）
- Create: `src/features/participant/add/usecase.ts`
- Create: `src/features/participant/add/handler.ts`（＋`handler.test.ts`）

**Interfaces:**
- Consumes: Task 1 の `nextPlayerNumber`、Task 2 の `ParticipantError` / `ParticipantDuplicateError` / `ParticipantMemberNotFoundError` / `toParticipantError` / `ParticipantIds` / `ParticipantOutcome` / `participantErrorFormState` / `revalidateParticipants` / `ParticipantFormState`
- Produces:
  - `addParticipantSchema` / `type AddParticipantInput = { mode: "existing"; memberId: string } | { mode: "new"; name: string; nameKana: string }`
  - `type AddParticipantResult = { participantId: string }`
  - `addParticipantInDb: AddParticipantPort`
  - `addParticipant(port, ids, input)`
  - `addParticipantAction: ParticipantFormAction`（`@/features/participant/add/handler`）

- [ ] **Step 1: schema の失敗するテストを書く**

`src/features/participant/add/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addParticipantSchema } from "./schema";

describe("addParticipantSchema", () => {
  it("既存メンバーの選択は memberId だけを要求する", () => {
    const result = addParticipantSchema.safeParse({
      mode: "existing",
      memberId: "m1",
      name: "",
      nameKana: "",
    });

    expect(result.success).toBe(true);
  });

  it("既存メンバーの選択で memberId が空なら弾く", () => {
    const result = addParticipantSchema.safeParse({
      mode: "existing",
      memberId: "",
      name: "",
      nameKana: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("メンバーを選択してください");
  });

  it("新規登録は氏名とかなを要求し、前後の空白を落とす", () => {
    const result = addParticipantSchema.safeParse({
      mode: "new",
      memberId: "",
      name: "  竹添  ",
      nameKana: " たけぞえ ",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      mode: "new",
      name: "竹添",
      nameKana: "たけぞえ",
    });
  });

  it("空白だけの氏名は弾く", () => {
    const result = addParticipantSchema.safeParse({
      mode: "new",
      memberId: "",
      name: "   ",
      nameKana: "たけぞえ",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("氏名を入力してください");
  });

  it("100 文字を超える氏名は弾く", () => {
    const result = addParticipantSchema.safeParse({
      mode: "new",
      memberId: "",
      name: "あ".repeat(101),
      nameKana: "たけぞえ",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "氏名は100文字以内で入力してください",
    );
  });

  it("知らない mode は弾く", () => {
    const result = addParticipantSchema.safeParse({
      mode: "bogus",
      memberId: "m1",
      name: "",
      nameKana: "",
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/features/participant/add/schema.test.ts`
Expected: FAIL（`Failed to resolve import "./schema"`）

- [ ] **Step 3: schema を実装する**

`src/features/participant/add/schema.ts`:

```ts
import { z } from "zod";

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
 *
 * features/division/add-entry/schema.ts と同じ形だが、兄弟カテゴリは
 * import できないため独立に持つ。
 */
export const addParticipantSchema = z.discriminatedUnion("mode", [
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

export type AddParticipantInput = z.infer<typeof addParticipantSchema>;
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant/add/schema.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: repository の失敗するテストを書く**

`src/features/participant/add/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tournamentFindFirst = vi.fn();
const memberFindFirst = vi.fn();
const memberCreate = vi.fn();
const participantFindFirst = vi.fn();
const participantFindMany = vi.fn();
const participantCreate = vi.fn();

const tx = {
  tournament: { findFirst: (args: unknown) => tournamentFindFirst(args) },
  member: {
    findFirst: (args: unknown) => memberFindFirst(args),
    create: (args: unknown) => memberCreate(args),
  },
  participant: {
    findFirst: (args: unknown) => participantFindFirst(args),
    findMany: (args: unknown) => participantFindMany(args),
    create: (args: unknown) => participantCreate(args),
  },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
  },
}));

const { addParticipantInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

describe("addParticipantInDb", () => {
  beforeEach(() => {
    for (const fn of [
      tournamentFindFirst,
      memberFindFirst,
      memberCreate,
      participantFindFirst,
      participantFindMany,
      participantCreate,
    ]) {
      fn.mockReset();
    }
    tournamentFindFirst.mockResolvedValue({ id: "t1" });
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue(null);
    participantFindMany.mockResolvedValue([]);
    participantCreate.mockResolvedValue({ id: "p1" });
  });

  it("組織に属さない大会なら found: false を返す", async () => {
    // 存在しないことと権限が無いことを区別させない。
    tournamentFindFirst.mockResolvedValue(null);

    const result = await Effect.runPromise(
      addParticipantInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(result).toEqual({ found: false });
    expect(tournamentFindFirst).toHaveBeenCalledWith({
      where: { id: "t1", organizationId: "o1" },
      select: { id: true },
    });
  });

  it("既存メンバーは組織を where に入れて引く", async () => {
    await Effect.runPromise(
      addParticipantInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(memberFindFirst).toHaveBeenCalledWith({
      where: { id: "m1", organizationId: "o1" },
      select: { id: true },
    });
  });

  it("他組織のメンバー ID なら ParticipantMemberNotFoundError", async () => {
    memberFindFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(
      addParticipantInDb(ids, { mode: "existing", memberId: "m9" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantMemberNotFoundError");
  });

  it("新規登録はこの組織に Member を作る", async () => {
    memberCreate.mockResolvedValue({ id: "m2" });

    await Effect.runPromise(
      addParticipantInDb(ids, {
        mode: "new",
        name: "竹添",
        nameKana: "たけぞえ",
      }),
    );

    expect(memberCreate).toHaveBeenCalledWith({
      data: { organizationId: "o1", name: "竹添", nameKana: "たけぞえ" },
      select: { id: true },
    });
  });

  it("同じ大会に同じメンバーが居れば ParticipantDuplicateError", async () => {
    participantFindFirst.mockResolvedValue({ id: "p0" });

    const exit = await Effect.runPromiseExit(
      addParticipantInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantDuplicateError");
    expect(participantCreate).not.toHaveBeenCalled();
  });

  it("既存の選手番号の次を振り、seed は付けない", async () => {
    // seed を入れると @@unique([tournamentId, seed]) と衝突する。
    participantFindMany.mockResolvedValue([
      { playerNumber: "1" },
      { playerNumber: "10" },
    ]);

    const result = await Effect.runPromise(
      addParticipantInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(participantCreate).toHaveBeenCalledWith({
      data: { tournamentId: "t1", memberId: "m1", playerNumber: "11" },
      select: { id: true },
    });
    expect(result).toEqual({ found: true, value: { participantId: "p1" } });
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/features/participant/add/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 7: repository を実装する**

`src/features/participant/add/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import { nextPlayerNumber } from "@/lib/participant/player-number";
import { prisma } from "@/shared/db/prisma";
import {
  ParticipantDuplicateError,
  type ParticipantError,
  ParticipantMemberNotFoundError,
  toParticipantError,
} from "../errors";
import type { ParticipantIds, ParticipantOutcome } from "../scope";
import type { AddParticipantInput } from "./schema";

type Tx = Prisma.TransactionClient;

export type AddParticipantResult = { participantId: string };

export type AddParticipantPort = (
  ids: ParticipantIds,
  input: AddParticipantInput,
) => Effect.Effect<
  ParticipantOutcome<AddParticipantResult>,
  ParticipantError
>;

/**
 * Member を決める。既存を選んだ場合は組織を where に入れて確かめる。
 * 取ってから所属を検証する形にすると、検証の書き忘れがそのまま穴になる。
 */
const resolveMemberId = async (
  tx: Tx,
  organizationId: string,
  input: AddParticipantInput,
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
    throw new ParticipantMemberNotFoundError({ memberId: input.memberId });
  }
  return member.id;
};

/**
 * 大会に参加者を足す。部門の entries には触れないので、足した人は
 * 「どの部門にも居ない」状態で始まる。
 *
 * 大会の所有権を最初に確かめるのは、participant.create が
 * tournamentId を直接持つため。ここで確かめないと、他組織の大会 ID を
 * 送るだけで参加者を作れてしまう。
 */
export const addParticipantInDb: AddParticipantPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(
        async (tx): Promise<ParticipantOutcome<AddParticipantResult>> => {
          const tournament = await tx.tournament.findFirst({
            where: { id: ids.tournamentId, organizationId: ids.organizationId },
            select: { id: true },
          });
          if (!tournament) {
            return { found: false };
          }

          const memberId = await resolveMemberId(
            tx,
            ids.organizationId,
            input,
          );

          const existing = await tx.participant.findFirst({
            where: { tournamentId: ids.tournamentId, memberId },
            select: { id: true },
          });
          if (existing) {
            throw new ParticipantDuplicateError({ memberId });
          }

          const rows = await tx.participant.findMany({
            where: { tournamentId: ids.tournamentId },
            select: { playerNumber: true },
          });

          // seed は付けない。@@unique([tournamentId, seed]) と衝突するため
          // （Postgres は NULL の重複を許すので null なら安全）。
          const created = await tx.participant.create({
            data: {
              tournamentId: ids.tournamentId,
              memberId,
              playerNumber: nextPlayerNumber(
                rows.map((row) => row.playerNumber),
              ),
            },
            select: { id: true },
          });

          return { found: true, value: { participantId: created.id } };
        },
      ),
    catch: (reason) => toParticipantError(reason),
  });
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant/add/repository.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 9: usecase を書く**

`src/features/participant/add/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { ParticipantError } from "../errors";
import type { ParticipantIds, ParticipantOutcome } from "../scope";
import type { AddParticipantPort, AddParticipantResult } from "./repository";
import type { AddParticipantInput } from "./schema";

export const addParticipant = (
  port: AddParticipantPort,
  ids: ParticipantIds,
  input: AddParticipantInput,
): Effect.Effect<
  ParticipantOutcome<AddParticipantResult>,
  ParticipantError
> => port(ids, input);
```

- [ ] **Step 10: handler の失敗するテストを書く**

`src/features/participant/add/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const addParticipantInDb = vi.fn();
const revalidateParticipants = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

vi.mock("../revalidate", () => ({
  revalidateParticipants: (slug: string, tournamentId: string) =>
    revalidateParticipants(slug, tournamentId),
}));

vi.mock("./repository", () => ({
  addParticipantInDb: (ids: unknown, input: unknown) =>
    addParticipantInDb(ids, input),
}));

const { addParticipantAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };

const existingForm = {
  slug: "tennis",
  tournamentId: "t1",
  mode: "existing",
  memberId: "m1",
  name: "",
  nameKana: "",
};

describe("addParticipantAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    addParticipantInDb.mockReset();
    revalidateParticipants.mockReset();
    notFound.mockClear();
    requirePermission.mockResolvedValue({ organization: { id: "o1" } });
    addParticipantInDb.mockImplementation(() =>
      Effect.succeed({ found: true, value: { participantId: "p1" } }),
    );
  });

  it("tournament.edit を要求する", async () => {
    await addParticipantAction(initial, formData(existingForm));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "tournament.edit");
  });

  it("URL の slug ではなく organization.id で絞る", async () => {
    await addParticipantAction(initial, formData(existingForm));

    expect(addParticipantInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { mode: "existing", memberId: "m1" },
    );
  });

  it("入力エラーは最初の 1 件を返す", async () => {
    const state = await addParticipantAction(
      initial,
      formData({ ...existingForm, memberId: "" }),
    );

    expect(state).toEqual({ error: "メンバーを選択してください" });
    expect(addParticipantInDb).not.toHaveBeenCalled();
  });

  it("追加できたら一覧を再検証する", async () => {
    const state = await addParticipantAction(initial, formData(existingForm));

    expect(state).toEqual({ error: null });
    expect(revalidateParticipants).toHaveBeenCalledWith("tennis", "t1");
  });

  it("大会が見つからなければ 404 に倒す", async () => {
    addParticipantInDb.mockImplementation(() =>
      Effect.succeed({ found: false }),
    );

    await expect(
      addParticipantAction(initial, formData(existingForm)),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ドメインのエラーは文言にして返す", async () => {
    const { ParticipantDuplicateError } = await import("../errors");
    addParticipantInDb.mockImplementation(() =>
      Effect.fail(new ParticipantDuplicateError({ memberId: "m1" })),
    );

    const state = await addParticipantAction(initial, formData(existingForm));

    expect(state).toEqual({ error: "その人はすでにこの大会の参加者です" });
    expect(revalidateParticipants).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 11: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/features/participant/add/handler.test.ts`
Expected: FAIL（`Failed to resolve import "./handler"`）

- [ ] **Step 12: handler を実装する**

`src/features/participant/add/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { participantErrorFormState } from "../effect-to-form-state";
import { revalidateParticipants } from "../revalidate";
import type { ParticipantFormState } from "../state";
import { addParticipantInDb } from "./repository";
import { addParticipantSchema } from "./schema";
import { addParticipant } from "./usecase";

export const addParticipantAction = async (
  _prevState: ParticipantFormState,
  formData: FormData,
): Promise<ParticipantFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // 一覧でフォームを隠していても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "tournament.edit");

  // mode に応じて要る項目が変わるので、両方の項目をそのまま渡して
  // discriminatedUnion に選ばせる。
  const parsed = addParticipantSchema.safeParse({
    mode: String(formData.get("mode") ?? ""),
    memberId: String(formData.get("memberId") ?? ""),
    name: String(formData.get("name") ?? ""),
    nameKana: String(formData.get("nameKana") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    addParticipant(
      addParticipantInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return participantErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  revalidateParticipants(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 13: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant/add`
Expected: PASS（3 ファイル）

Run: `pnpm typecheck`
Expected: エラーなしで終了

- [ ] **Step 14: コミット**

```bash
git add src/features/participant/add
git commit -F - <<'EOF'
feat(participant): add participants to a tournament without a division

部門を経由せず大会に参加者を登録できるようにした。既存メンバーの選択と
新規登録の二択で、選手番号は既存と同じ規則で採番する。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: 参加者を削除するスライス

**Files:**
- Create: `src/features/participant/remove/schema.ts`（＋`schema.test.ts`）
- Create: `src/features/participant/remove/repository.ts`（＋`repository.test.ts`）
- Create: `src/features/participant/remove/usecase.ts`
- Create: `src/features/participant/remove/handler.ts`（＋`handler.test.ts`）

**Interfaces:**
- Consumes: Task 2 の `ParticipantError` / `ParticipantNotFoundError` / `ParticipantEnteredError` / `ParticipantDataError` / `toParticipantError` / `ParticipantIds` / `participantErrorFormState` / `revalidateParticipants`
- Produces:
  - `removeParticipantSchema` / `type RemoveParticipantInput = { participantId: string }`
  - `removeParticipantInDb: RemoveParticipantPort`（`Effect.Effect<void, ParticipantError>`）
  - `removeParticipant(port, ids, input)`
  - `removeParticipantAction: ParticipantFormAction`（`@/features/participant/remove/handler`）

- [ ] **Step 1: schema を書く**

`src/features/participant/remove/schema.ts`:

```ts
import { z } from "zod";

export const removeParticipantSchema = z.object({
  participantId: z.string().min(1, "削除する参加者を選んでください"),
});

export type RemoveParticipantInput = z.infer<typeof removeParticipantSchema>;
```

`src/features/participant/remove/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { removeParticipantSchema } from "./schema";

describe("removeParticipantSchema", () => {
  it("participantId を要求する", () => {
    expect(removeParticipantSchema.safeParse({ participantId: "p1" }).success).toBe(
      true,
    );
  });

  it("空の participantId は弾く", () => {
    const result = removeParticipantSchema.safeParse({ participantId: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("削除する参加者を選んでください");
  });
});
```

- [ ] **Step 2: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant/remove/schema.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 3: repository の失敗するテストを書く**

`src/features/participant/remove/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const participantFindFirst = vi.fn();
const participantDelete = vi.fn();
const divisionFindMany = vi.fn();

const tx = {
  participant: {
    findFirst: (args: unknown) => participantFindFirst(args),
    delete: (args: unknown) => participantDelete(args),
  },
  division: { findMany: (args: unknown) => divisionFindMany(args) },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
  },
}));

const { removeParticipantInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

const entriesJson = (participantIds: string[]) => ({
  version: 1,
  entries: participantIds.map((participantId, index) => ({
    id: `e${index}`,
    participantId,
    seed: index,
  })),
});

describe("removeParticipantInDb", () => {
  beforeEach(() => {
    participantFindFirst.mockReset();
    participantDelete.mockReset();
    divisionFindMany.mockReset();
    participantFindFirst.mockResolvedValue({ id: "p1" });
    divisionFindMany.mockResolvedValue([]);
    participantDelete.mockResolvedValue({ id: "p1" });
  });

  it("組織と大会の所有権を where に入れて引く", async () => {
    await Effect.runPromise(
      removeParticipantInDb(ids, { participantId: "p1" }),
    );

    expect(participantFindFirst).toHaveBeenCalledWith({
      where: {
        id: "p1",
        tournament: { id: "t1", organizationId: "o1" },
      },
      select: { id: true },
    });
  });

  it("対象が無ければ ParticipantNotFoundError", async () => {
    participantFindFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(
      removeParticipantInDb(ids, { participantId: "p9" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantNotFoundError");
    expect(participantDelete).not.toHaveBeenCalled();
  });

  it("どの部門にも居なければ削除する", async () => {
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "男子の部", entries: entriesJson(["p2"]) },
    ]);

    await Effect.runPromise(
      removeParticipantInDb(ids, { participantId: "p1" }),
    );

    expect(participantDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  it("エントリー済みなら削除せず、部門名を並べて返す", async () => {
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "男子の部", entries: entriesJson(["p1"]) },
      { id: "d2", name: "女子の部", entries: entriesJson(["p2"]) },
      { id: "d3", name: "団体戦", entries: entriesJson(["p1"]) },
    ]);

    const exit = await Effect.runPromiseExit(
      removeParticipantInDb(ids, { participantId: "p1" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantEnteredError");
    expect(String(exit)).toContain("男子の部");
    expect(String(exit)).toContain("団体戦");
    expect(String(exit)).not.toContain("女子の部");
    expect(participantDelete).not.toHaveBeenCalled();
  });

  it("Json が壊れた部門があれば削除を止める", async () => {
    // 読み飛ばすと「壊れた部門にエントリー済みの参加者」を消せてしまい、
    // エントリー済みの検査そのものが素通りする。
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "壊れた部門", entries: { version: 1, entries: "x" } },
    ]);

    const exit = await Effect.runPromiseExit(
      removeParticipantInDb(ids, { participantId: "p1" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantDataError");
    expect(participantDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/features/participant/remove/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 5: repository を実装する**

`src/features/participant/remove/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { DivisionJsonError, parseDivisionEntries } from "@/lib/division/parse";
import { prisma } from "@/shared/db/prisma";
import {
  ParticipantDataError,
  ParticipantEnteredError,
  type ParticipantError,
  ParticipantNotFoundError,
  toParticipantError,
} from "../errors";
import type { ParticipantIds } from "../scope";
import type { RemoveParticipantInput } from "./schema";

export type RemoveParticipantPort = (
  ids: ParticipantIds,
  input: RemoveParticipantInput,
) => Effect.Effect<void, ParticipantError>;

/**
 * 参加者を大会から外す。Member は消さない。Member は組織のマスタで、
 * 大会から外れただけの人を組織から消すのは別の操作（/orgs/[slug]/members）。
 *
 * エントリーの有無の判定と削除を同一トランザクションに入れるのは、
 * 一覧を描いてから送信するまでの間に別の運営者がエントリーを足しうるため。
 * 一覧側でもボタンを無効にするが、拒否の境界はここにある。
 */
export const removeParticipantInDb: RemoveParticipantPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<void> => {
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
          throw new ParticipantNotFoundError({
            participantId: input.participantId,
          });
        }

        const divisions = await tx.division.findMany({
          where: {
            tournament: {
              id: ids.tournamentId,
              organizationId: ids.organizationId,
            },
          },
          orderBy: { order: "asc" },
          select: { id: true, name: true, entries: true },
        });

        const entered: string[] = [];
        for (const division of divisions) {
          let parsed: ReturnType<typeof parseDivisionEntries>;
          try {
            parsed = parseDivisionEntries(division.entries);
          } catch (reason) {
            // 一覧（repository.ts）と違い、ここでは読み飛ばさない。
            // 読み飛ばすと壊れた部門にエントリー済みの参加者を消せてしまい、
            // この検査そのものが素通りする。
            if (reason instanceof DivisionJsonError) {
              throw new ParticipantDataError({ divisionId: division.id });
            }
            throw reason;
          }

          if (
            parsed.entries.some(
              (entry) => entry.participantId === input.participantId,
            )
          ) {
            entered.push(division.name);
          }
        }

        if (entered.length > 0) {
          throw new ParticipantEnteredError({ divisionNames: entered });
        }

        await tx.participant.delete({ where: { id: input.participantId } });
      }),
    catch: (reason) => toParticipantError(reason),
  });
```

- [ ] **Step 6: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant/remove/repository.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 7: usecase を書く**

`src/features/participant/remove/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { ParticipantError } from "../errors";
import type { ParticipantIds } from "../scope";
import type { RemoveParticipantPort } from "./repository";
import type { RemoveParticipantInput } from "./schema";

export const removeParticipant = (
  port: RemoveParticipantPort,
  ids: ParticipantIds,
  input: RemoveParticipantInput,
): Effect.Effect<void, ParticipantError> => port(ids, input);
```

- [ ] **Step 8: handler の失敗するテストを書く**

`src/features/participant/remove/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const removeParticipantInDb = vi.fn();
const revalidateParticipants = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("../revalidate", () => ({
  revalidateParticipants: (slug: string, tournamentId: string) =>
    revalidateParticipants(slug, tournamentId),
}));

vi.mock("./repository", () => ({
  removeParticipantInDb: (ids: unknown, input: unknown) =>
    removeParticipantInDb(ids, input),
}));

const { removeParticipantAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };
const valid = { slug: "tennis", tournamentId: "t1", participantId: "p1" };

describe("removeParticipantAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    removeParticipantInDb.mockReset();
    revalidateParticipants.mockReset();
    requirePermission.mockResolvedValue({ organization: { id: "o1" } });
    removeParticipantInDb.mockImplementation(() => Effect.succeed(undefined));
  });

  it("tournament.edit を要求する", async () => {
    await removeParticipantAction(initial, formData(valid));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "tournament.edit");
  });

  it("URL の slug ではなく organization.id で絞って消す", async () => {
    await removeParticipantAction(initial, formData(valid));

    expect(removeParticipantInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { participantId: "p1" },
    );
  });

  it("削除できたら一覧を再検証する", async () => {
    const state = await removeParticipantAction(initial, formData(valid));

    expect(state).toEqual({ error: null });
    expect(revalidateParticipants).toHaveBeenCalledWith("tennis", "t1");
  });

  it("エントリー済みは部門名つきの文言を行内に返す", async () => {
    const { ParticipantEnteredError } = await import("../errors");
    removeParticipantInDb.mockImplementation(() =>
      Effect.fail(
        new ParticipantEnteredError({ divisionNames: ["男子の部"] }),
      ),
    );

    const state = await removeParticipantAction(initial, formData(valid));

    expect(state).toEqual({
      error:
        "男子の部 にエントリー中です。先に部門の編集画面から外してください",
    });
    expect(revalidateParticipants).not.toHaveBeenCalled();
  });

  it("入力エラーは最初の 1 件を返す", async () => {
    const state = await removeParticipantAction(
      initial,
      formData({ ...valid, participantId: "" }),
    );

    expect(state).toEqual({ error: "削除する参加者を選んでください" });
    expect(removeParticipantInDb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/features/participant/remove/handler.test.ts`
Expected: FAIL（`Failed to resolve import "./handler"`）

- [ ] **Step 10: handler を実装する**

`src/features/participant/remove/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { requirePermission } from "@/shared/middleware/require-organization";
import { participantErrorFormState } from "../effect-to-form-state";
import { revalidateParticipants } from "../revalidate";
import type { ParticipantFormState } from "../state";
import { removeParticipantInDb } from "./repository";
import { removeParticipantSchema } from "./schema";
import { removeParticipant } from "./usecase";

export const removeParticipantAction = async (
  _prevState: ParticipantFormState,
  formData: FormData,
): Promise<ParticipantFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // 一覧でボタンを無効にしていても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = removeParticipantSchema.safeParse({
    participantId: String(formData.get("participantId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    removeParticipant(
      removeParticipantInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  // 対象が見つからないのは、一覧を描いたあとに誰かが消した場合が主。
  // ページごと 404 にせず、行内のエラー文言として返す。
  if (Exit.isFailure(exit)) {
    return participantErrorFormState(exit.cause);
  }

  revalidateParticipants(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 11: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/features/participant/remove`
Expected: PASS（3 ファイル）

Run: `pnpm typecheck`
Expected: エラーなしで終了

- [ ] **Step 12: コミット**

```bash
git add src/features/participant/remove
git commit -F - <<'EOF'
feat(participant): remove participants unless they are entered in a division

どこかの部門にエントリー済みなら削除を拒否し、部門名を挙げて案内する。
判定と削除は同一トランザクションで行い、Member は組織に残す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: 参加者一覧のコンポーネント

**Files:**
- Create: `src/components/participant/ParticipantList.tsx`（＋`ParticipantList.test.tsx`）
- Create: `src/components/participant/RemoveParticipantButton.tsx`（＋`RemoveParticipantButton.test.tsx`）
- Create: `src/components/participant/AddParticipantForm.tsx`（＋`AddParticipantForm.test.tsx`）

**Interfaces:**
- Consumes: Task 3 の `TournamentParticipant`、Task 2 の `ParticipantFormAction` / `INITIAL_PARTICIPANT_FORM_STATE`、Task 4 の `PlayerNumberForm`、既存の `src/components/ui/ConfirmDialog.tsx` と `src/features/member/repository.ts` の `MemberSummary`
- Produces:
  - `ParticipantList` — props: `{ slug, tournamentId, participants, canEdit, setPlayerNumberAction, removeAction }`
  - `RemoveParticipantButton` — props: `{ slug, tournamentId, participant, action }`
  - `AddParticipantForm` — props: `{ slug, tournamentId, members, action }`

- [ ] **Step 1: 削除ボタンの失敗するテストを書く**

`src/components/participant/RemoveParticipantButton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RemoveParticipantButton } from "./RemoveParticipantButton";

const participant = {
  id: "p1",
  name: "竹添",
  nameKana: "たけぞえ",
  playerNumber: "1",
  divisions: [],
};

describe("RemoveParticipantButton", () => {
  it("出場部門が無ければ押せる", () => {
    render(
      <RemoveParticipantButton
        slug="tennis"
        tournamentId="t1"
        participant={participant}
        action={async () => ({ error: null })}
      />,
    );

    expect(screen.getByRole("button", { name: "削除" })).toBeEnabled();
  });

  it("出場部門があれば押せず、理由を添える", () => {
    // 拒否の境界は Server Action 側。ここは体感のための出し分け。
    render(
      <RemoveParticipantButton
        slug="tennis"
        tournamentId="t1"
        participant={{
          ...participant,
          divisions: [{ id: "d1", name: "男子の部" }],
        }}
        action={async () => ({ error: null })}
      />,
    );

    const button = screen.getByRole("button", { name: "削除" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "男子の部 にエントリー中のため削除できません",
    );
  });

  it("確認ダイアログに氏名を出す", async () => {
    const user = userEvent.setup();
    render(
      <RemoveParticipantButton
        slug="tennis"
        tournamentId="t1"
        participant={participant}
        action={async () => ({ error: null })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "削除" }));

    expect(
      screen.getByText(
        "「竹添」を大会から削除しますか？組織のメンバーは残ります。",
      ),
    ).toBeVisible();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/components/participant/RemoveParticipantButton.test.tsx`
Expected: FAIL（`Failed to resolve import "./RemoveParticipantButton"`）

- [ ] **Step 3: 削除ボタンを実装する**

`src/components/participant/RemoveParticipantButton.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { TournamentParticipant } from "@/features/participant/repository";
import {
  INITIAL_PARTICIPANT_FORM_STATE,
  type ParticipantFormAction,
} from "@/features/participant/state";

/**
 * 行ごとの削除。useActionState は 1 行に 1 つ要るため行のコンポーネントにする。
 * 出場部門がある行はボタンを無効にするが、これは体感のための出し分けで、
 * 拒否の境界は Server Action 側（remove/repository.ts の検査）にある。
 */
export function RemoveParticipantButton({
  slug,
  tournamentId,
  participant,
  action,
}: {
  slug: string;
  tournamentId: string;
  participant: TournamentParticipant;
  action: ParticipantFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PARTICIPANT_FORM_STATE,
  );

  const entered = participant.divisions.map((division) => division.name);

  if (entered.length > 0) {
    return (
      <button
        type="button"
        disabled
        title={`${entered.join("、")} にエントリー中のため削除できません`}
        className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-400"
      >
        削除
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        triggerLabel="削除"
        title="参加者を削除"
        message={`「${participant.name}」を大会から削除しますか？組織のメンバーは残ります。`}
        confirmLabel="削除する"
        pendingLabel="削除中..."
        formAction={formAction}
        pending={pending}
        error={state.error}
        hiddenFields={{
          slug,
          tournamentId,
          participantId: participant.id,
        }}
        triggerClassName="rounded border border-red-300 bg-white px-3 py-1 text-xs text-red-700 cursor-pointer"
      />
      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/components/participant/RemoveParticipantButton.test.tsx`
Expected: PASS（3 tests）

- [ ] **Step 5: 一覧の失敗するテストを書く**

`src/components/participant/ParticipantList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TournamentParticipant } from "@/features/participant/repository";
import { ParticipantList } from "./ParticipantList";

const noop = async () => ({ error: null });

const participants: TournamentParticipant[] = [
  {
    id: "p1",
    name: "竹添",
    nameKana: "たけぞえ",
    playerNumber: "1",
    team: "A中学",
    divisions: [
      { id: "d1", name: "男子の部" },
      { id: "d2", name: "団体戦" },
    ],
  },
  {
    id: "p2",
    name: "山田",
    nameKana: "やまだ",
    playerNumber: "2",
    divisions: [],
  },
];

const renderList = (canEdit: boolean) =>
  render(
    <ParticipantList
      slug="tennis"
      tournamentId="t1"
      participants={participants}
      canEdit={canEdit}
      setPlayerNumberAction={noop}
      removeAction={noop}
    />,
  );

describe("ParticipantList", () => {
  it("番号・氏名・かな・所属を出す", () => {
    renderList(true);

    expect(screen.getByText("No.1")).toBeVisible();
    expect(screen.getByText("竹添")).toBeVisible();
    expect(screen.getByText("たけぞえ")).toBeVisible();
    expect(screen.getByText("A中学")).toBeVisible();
  });

  it("出場部門を並べる", () => {
    renderList(true);

    expect(screen.getByText("男子の部")).toBeVisible();
    expect(screen.getByText("団体戦")).toBeVisible();
  });

  it("どの部門にも居ない参加者はその旨を出す", () => {
    // 運営がこの行を消せると分かる手がかりになる。
    renderList(true);

    expect(screen.getByText("出場部門なし")).toBeVisible();
  });

  it("編集できないときは番号の編集も削除も出さない", () => {
    renderList(false);

    expect(screen.queryByLabelText("竹添の選手番号")).toBeNull();
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
  });

  it("編集できるときは番号の編集と削除を出す", () => {
    renderList(true);

    expect(screen.getByLabelText("竹添の選手番号")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "削除" })).toHaveLength(2);
  });

  it("1 件も無ければその旨を出す", () => {
    render(
      <ParticipantList
        slug="tennis"
        tournamentId="t1"
        participants={[]}
        canEdit
        setPlayerNumberAction={noop}
        removeAction={noop}
      />,
    );

    expect(screen.getByText("まだ参加者がいません")).toBeVisible();
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/components/participant/ParticipantList.test.tsx`
Expected: FAIL（`Failed to resolve import "./ParticipantList"`）

- [ ] **Step 7: 一覧を実装する**

`src/components/participant/ParticipantList.tsx`:

```tsx
import type { TournamentParticipant } from "@/features/participant/repository";
import type { ParticipantFormAction } from "@/features/participant/state";
import { PlayerNumberForm } from "./PlayerNumberForm";
import { RemoveParticipantButton } from "./RemoveParticipantButton";

/**
 * 管理画面の参加者一覧。並びは repository が選手番号の自然順で決めているので
 * ここでは並べ替えない。
 */
export function ParticipantList({
  slug,
  tournamentId,
  participants,
  canEdit,
  setPlayerNumberAction,
  removeAction,
}: {
  slug: string;
  tournamentId: string;
  participants: TournamentParticipant[];
  canEdit: boolean;
  setPlayerNumberAction: ParticipantFormAction;
  removeAction: ParticipantFormAction;
}) {
  if (participants.length === 0) {
    return (
      <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
        まだ参加者がいません
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
      {participants.map((participant) => (
        <li
          key={participant.id}
          className="flex flex-wrap items-start justify-between gap-3 p-4"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                No.{participant.playerNumber}
              </span>
              <span className="wrap-break-word text-sm font-medium text-slate-800">
                {participant.name}
              </span>
              {participant.team !== undefined && (
                <span className="text-xs text-slate-500">
                  {participant.team}
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">{participant.nameKana}</p>

            {participant.divisions.length === 0 ? (
              <p className="text-xs text-slate-400">出場部門なし</p>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {participant.divisions.map((division) => (
                  <li
                    key={division.id}
                    className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {division.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 編集の出し分けは体感のためで、境界は各 Server Action にある。 */}
          {canEdit && (
            <div className="flex flex-wrap items-start justify-end gap-3">
              <PlayerNumberForm
                participantId={participant.id}
                playerNumber={participant.playerNumber}
                participantName={participant.name}
                slug={slug}
                tournamentId={tournamentId}
                action={setPlayerNumberAction}
              />
              <RemoveParticipantButton
                slug={slug}
                tournamentId={tournamentId}
                participant={participant}
                action={removeAction}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/components/participant/ParticipantList.test.tsx`
Expected: PASS（6 tests）

- [ ] **Step 9: 追加フォームの失敗するテストを書く**

`src/components/participant/AddParticipantForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AddParticipantForm } from "./AddParticipantForm";

const members = [
  { id: "m1", name: "竹添", nameKana: "たけぞえ" },
  { id: "m2", name: "山田", nameKana: "やまだ" },
];

describe("AddParticipantForm", () => {
  it("メンバーが居れば既存から選ぶ側で始まる", () => {
    render(
      <AddParticipantForm
        slug="tennis"
        tournamentId="t1"
        members={members}
        action={async () => ({ error: null })}
      />,
    );

    expect(screen.getByLabelText("メンバー")).toBeVisible();
    expect(screen.queryByLabelText("氏名")).toBeNull();
  });

  it("メンバーが 1 人も居なければ新規登録だけを見せる", () => {
    // 選びようがないので、ラジオ自体を出さない。
    render(
      <AddParticipantForm
        slug="tennis"
        tournamentId="t1"
        members={[]}
        action={async () => ({ error: null })}
      />,
    );

    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByLabelText("氏名")).toBeVisible();
    expect(screen.getByLabelText("氏名（かな）")).toBeVisible();
  });

  it("新しく登録に切り替えると氏名の入力に変わる", async () => {
    const user = userEvent.setup();
    render(
      <AddParticipantForm
        slug="tennis"
        tournamentId="t1"
        members={members}
        action={async () => ({ error: null })}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "新しく登録する" }));

    expect(screen.getByLabelText("氏名")).toBeVisible();
    expect(screen.queryByLabelText("メンバー")).toBeNull();
  });

  it("大会と組織を hidden で送る", () => {
    const { container } = render(
      <AddParticipantForm
        slug="tennis"
        tournamentId="t1"
        members={members}
        action={async () => ({ error: null })}
      />,
    );

    expect(
      container.querySelector('input[name="slug"]'),
    ).toHaveValue("tennis");
    expect(
      container.querySelector('input[name="tournamentId"]'),
    ).toHaveValue("t1");
    expect(
      container.querySelector('input[name="mode"]'),
    ).toHaveValue("existing");
  });
});
```

- [ ] **Step 10: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/components/participant/AddParticipantForm.test.tsx`
Expected: FAIL（`Failed to resolve import "./AddParticipantForm"`）

- [ ] **Step 11: 追加フォームを実装する**

`src/components/participant/AddParticipantForm.tsx`:

```tsx
"use client";

import { useActionState, useId, useState } from "react";
import type { MemberSummary } from "@/features/member/repository";
import {
  INITIAL_PARTICIPANT_FORM_STATE,
  type ParticipantFormAction,
} from "@/features/participant/state";

type Mode = "existing" | "new";

/**
 * 大会に参加者を足すフォーム。部門を経由しないので divisionId は無い。
 * components/division/AddEntryForm.tsx と同じ二択だが、送り先も状態の型も
 * 違うため別物として持つ。
 */
export function AddParticipantForm({
  slug,
  tournamentId,
  members,
  action,
}: {
  slug: string;
  tournamentId: string;
  members: MemberSummary[];
  action: ParticipantFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PARTICIPANT_FORM_STATE,
  );
  // メンバーが 1 人も居ないうちは選びようがないので、新規登録だけを見せる。
  const [mode, setMode] = useState<Mode>(
    members.length === 0 ? "new" : "existing",
  );
  const memberId = useId();
  const nameId = useId();
  const nameKanaId = useId();

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-bold text-slate-700">参加者を追加</h2>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
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
          <label className="text-xs text-slate-500" htmlFor={memberId}>
            メンバー
          </label>
          <select
            id={memberId}
            name="memberId"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}（{member.nameKana}）
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-500" htmlFor={nameId}>
              氏名
            </label>
            <input
              id={nameId}
              type="text"
              name="name"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500" htmlFor={nameKanaId}>
              氏名（かな）
            </label>
            <input
              id={nameKanaId}
              type="text"
              name="nameKana"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "追加中..." : "追加"}
      </button>

      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 12: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/components/participant`
Expected: PASS（4 ファイル）

Run: `pnpm typecheck`
Expected: エラーなしで終了

- [ ] **Step 13: コミット**

```bash
git add src/components/participant
git commit -F - <<'EOF'
feat(participant): add participant list, add form and remove button

出場部門を並べ、エントリー済みの行は削除ボタンを無効にする。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: 管理画面の参加者一覧ページと導線

**Files:**
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/participants/page.tsx`
- Test: `src/app/orgs/[slug]/tournaments/[tournamentId]/participants/page.test.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`（一覧へのリンクを追加）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx`（リンクの検証を追加）

**Interfaces:**
- Consumes: Task 3 の `listParticipantsWithDivisions`、Task 5 の `addParticipantAction`、Task 6 の `removeParticipantAction`、Task 4 の `setPlayerNumberAction`、Task 7 の `ParticipantList` / `AddParticipantForm`、既存の `requireOrganization` / `canByCode` / `findTournamentInOrganization` / `listMembersInOrganization` / `AppHeader`
- Produces: なし（ページ）

- [ ] **Step 1: 新しいルートに Next.js の型を生成させる**

ページを書く前に空のファイルを置き、`PageProps<"/orgs/[slug]/tournaments/[tournamentId]/participants">` を使えるようにする。

```bash
mkdir -p "src/app/orgs/[slug]/tournaments/[tournamentId]/participants"
printf 'export default function Page() {\n  return null;\n}\n' > "src/app/orgs/[slug]/tournaments/[tournamentId]/participants/page.tsx"
pnpm exec next typegen
```

Expected: `.next/types` が更新され、`pnpm typecheck` が通る

- [ ] **Step 2: ページの失敗するテストを書く**

`src/app/orgs/[slug]/tournaments/[tournamentId]/participants/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// ページ本体の検証に集中したいので他のページテストと同じ方針で差し替える。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const listParticipantsWithDivisions = vi.fn();
const listMembersInOrganization = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
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

vi.mock("@/features/participant/repository", () => ({
  listParticipantsWithDivisions: (
    organizationId: string,
    tournamentId: string,
  ) => listParticipantsWithDivisions(organizationId, tournamentId),
}));

vi.mock("@/features/member/repository", () => ({
  listMembersInOrganization: (organizationId: string) =>
    listMembersInOrganization(organizationId),
}));

// Server Action はページ本体の検証に関係しないので、素通しの関数へ差し替える。
vi.mock("@/features/participant/add/handler", () => ({
  addParticipantAction: async () => ({ error: null }),
}));

vi.mock("@/features/participant/remove/handler", () => ({
  removeParticipantAction: async () => ({ error: null }),
}));

vi.mock("@/features/participant/set-player-number/handler", () => ({
  setPlayerNumberAction: async () => ({ error: null }),
}));

const { default: Page } = await import("./page");

const pageProps = (slug: string, tournamentId: string) => ({
  params: Promise.resolve({ slug, tournamentId }),
});

const session = { user: { id: "u1", name: "竹添", email: "a@example.com" } };

const context = (codes: readonly string[]) => ({
  session,
  organization: { id: "o1", name: "テニス部", slug: "tennis" },
  ability: defineAbilityFor(codes),
});

describe("管理画面の参加者一覧ページ", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    findTournamentInOrganization.mockReset();
    listParticipantsWithDivisions.mockReset();
    listMembersInOrganization.mockReset();
    notFound.mockClear();

    requireOrganization.mockResolvedValue(context(PERMISSION_CODES));
    findTournamentInOrganization.mockResolvedValue({
      id: "t1",
      name: "春季大会",
      status: "DRAFT",
    });
    listParticipantsWithDivisions.mockResolvedValue([
      {
        id: "p1",
        name: "山田",
        nameKana: "やまだ",
        playerNumber: "1",
        divisions: [{ id: "d1", name: "男子の部" }],
      },
    ]);
    listMembersInOrganization.mockResolvedValue([
      { id: "m1", name: "山田", nameKana: "やまだ" },
    ]);
  });

  it("組織に属さない大会なら 404 に倒す", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(Page(pageProps("tennis", "t9"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("URL の slug ではなく organization.id で絞って読む", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(listParticipantsWithDivisions).toHaveBeenCalledWith("o1", "t1");
  });

  it("参加者と出場部門を出す", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(screen.getByText("山田")).toBeVisible();
    expect(screen.getByText("男子の部")).toBeVisible();
  });

  it("tournament.edit があれば追加フォームを出す", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(screen.getByText("参加者を追加")).toBeVisible();
  });

  it("tournament.edit が無ければ追加も削除も出さない", async () => {
    // 出し分けは体感のためで、境界は各 Server Action の requirePermission。
    requireOrganization.mockResolvedValue(context([]));

    render(await Page(pageProps("tennis", "t1")));

    expect(screen.queryByText("参加者を追加")).toBeNull();
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
  });

  it("大会詳細へ戻るパンくずを出す", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(
      screen.getByRole("link", { name: "春季大会" }),
    ).toHaveAttribute("href", "/orgs/tennis/tournaments/t1");
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/participants/page.test.tsx"`
Expected: FAIL（Step 1 の仮実装が `null` を返すため、要素が見つからない）

- [ ] **Step 4: ページを実装する**

`src/app/orgs/[slug]/tournaments/[tournamentId]/participants/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { AddParticipantForm } from "@/components/participant/AddParticipantForm";
import { ParticipantList } from "@/components/participant/ParticipantList";
import { listMembersInOrganization } from "@/features/member/repository";
import { addParticipantAction } from "@/features/participant/add/handler";
import { removeParticipantAction } from "@/features/participant/remove/handler";
import { listParticipantsWithDivisions } from "@/features/participant/repository";
import { setPlayerNumberAction } from "@/features/participant/set-player-number/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { canByCode } from "@/shared/authz/ability";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentParticipantsPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/participants">) {
  const { slug, tournamentId } = await params;
  // 閲覧は大会詳細と同じく、組織のメンバーであれば可。
  const { session, organization, ability } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const [participants, members] = await Promise.all([
    listParticipantsWithDivisions(organization.id, tournamentId),
    listMembersInOrganization(organization.id),
  ]);

  // UI の出し分けは体感のためで、境界は各 Server Action の requirePermission。
  const canEdit = canByCode(ability, "tournament.edit");

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
          { label: "参加者一覧" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">参加者一覧</h1>
        <p className="text-xs text-slate-500">
          選手番号は大会内で共通のため、変更は部門の編集画面にも反映されます。
          部門にエントリー済みの参加者は、先に部門の編集画面から外してください
        </p>

        {canEdit && (
          <AddParticipantForm
            slug={slug}
            tournamentId={tournament.id}
            members={members}
            action={addParticipantAction}
          />
        )}

        <ParticipantList
          slug={slug}
          tournamentId={tournament.id}
          participants={participants}
          canEdit={canEdit}
          setPlayerNumberAction={setPlayerNumberAction}
          removeAction={removeParticipantAction}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/participants/page.test.tsx"`
Expected: PASS（6 tests）

- [ ] **Step 6: 大会詳細に導線を足す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` の「試合一覧」リンクの**直前**に足す:

```tsx
          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}/participants`}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            参加者一覧
          </Link>

```

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx` の `describe` の中に足す（既存のテストが使っている `pageProps` / `render(await Page(...))` の形に合わせる）:

```tsx
  it("参加者一覧への導線を出す", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(
      screen.getByRole("link", { name: "参加者一覧" }),
    ).toHaveAttribute("href", "/orgs/tennis/tournaments/t1/participants");
  });
```

- [ ] **Step 7: テストを実行して成功を確認する**

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]"`
Expected: PASS（新旧のページテストがすべて通る）

Run: `pnpm typecheck`
Expected: エラーなしで終了

- [ ] **Step 8: コミット**

```bash
git add "src/app/orgs/[slug]/tournaments/[tournamentId]"
git commit -F - <<'EOF'
feat(participant): add the admin participant list page

大会単位で参加者を一覧し、選手番号の編集・追加・削除ができる画面。
大会詳細から導線を張った。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: 公開ページに出場部門を出す

**Files:**
- Modify: `src/components/public/PublicParticipantList.tsx`
- Modify: `src/components/public/PublicParticipantList.test.tsx`
- Modify: `src/app/t/[tournamentId]/participants/page.tsx`
- Modify: `src/app/t/[tournamentId]/participants/page.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `listParticipantsWithDivisions` / `TournamentParticipant`
- Produces: なし

- [ ] **Step 1: コンポーネントのテストを書き換える**

`src/components/public/PublicParticipantList.test.tsx` を次で置き換える:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TournamentParticipant } from "@/features/participant/repository";
import { PublicParticipantList } from "./PublicParticipantList";

const participants: TournamentParticipant[] = [
  {
    id: "p1",
    name: "竹添",
    nameKana: "たけぞえ",
    playerNumber: "1",
    team: "A中学",
    divisions: [{ id: "d1", name: "男子の部" }],
  },
  {
    id: "p2",
    name: "山田",
    nameKana: "やまだ",
    playerNumber: "2",
    divisions: [],
  },
];

describe("PublicParticipantList", () => {
  it("番号・氏名・所属を出す", () => {
    render(<PublicParticipantList participants={participants} />);

    expect(screen.getByText("No.1")).toBeVisible();
    expect(screen.getByText("竹添")).toBeVisible();
    expect(screen.getByText("A中学")).toBeVisible();
  });

  it("出場部門を出す", () => {
    render(<PublicParticipantList participants={participants} />);

    expect(screen.getByText("男子の部")).toBeVisible();
  });

  it("出場部門が無い参加者には何も添えない", () => {
    // 準備中の大会で未エントリーの参加者を晒す意味がないため、
    // 管理画面と違って「出場部門なし」とは書かない。
    render(<PublicParticipantList participants={participants} />);

    expect(screen.queryByText("出場部門なし")).toBeNull();
    expect(screen.getByText("山田")).toBeVisible();
  });

  it("渡された順に描く", () => {
    // 並べ替えは repository が済ませている。
    render(
      <PublicParticipantList
        participants={[participants[1], participants[0]]}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("山田");
    expect(items[1]).toHaveTextContent("竹添");
  });

  it("1 件も無ければその旨を出す", () => {
    render(<PublicParticipantList participants={[]} />);

    expect(screen.getByText("まだ参加者がいません")).toBeVisible();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run src/components/public/PublicParticipantList.test.tsx`
Expected: FAIL（`出場部門を出す` が「男子の部」を見つけられない）

- [ ] **Step 3: コンポーネントを書き換える**

`src/components/public/PublicParticipantList.tsx` を次で置き換える:

```tsx
import type { TournamentParticipant } from "@/features/participant/repository";

/**
 * 公開ページの参加者一覧。並びは listParticipantsWithDivisions が
 * 選手番号の自然順で決めているので、ここでは並べ替えない。
 */
export function PublicParticipantList({
  participants,
}: {
  participants: TournamentParticipant[];
}) {
  if (participants.length === 0) {
    return <p className="text-sm text-slate-600">まだ参加者がいません</p>;
  }

  return (
    <ul className="space-y-2">
      {participants.map((participant) => (
        <li
          key={participant.id}
          className="space-y-1 rounded border border-slate-200 bg-white px-4 py-3"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              No.{participant.playerNumber}
            </span>
            <span className="min-w-0 wrap-break-word font-medium text-slate-800">
              {participant.name}
            </span>
            {participant.team !== undefined && (
              <span className="text-xs text-slate-500">{participant.team}</span>
            )}
          </div>

          {/* 出場部門が無いことは書き立てない。準備中の大会で未エントリーの
              参加者を晒す意味がないため、管理画面とは扱いを変える。 */}
          {participant.divisions.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {participant.divisions.map((division) => (
                <li
                  key={division.id}
                  className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                >
                  {division.name}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm exec vitest run src/components/public/PublicParticipantList.test.tsx`
Expected: PASS（5 tests）

- [ ] **Step 5: 公開ページの読み出しを差し替える**

`src/app/t/[tournamentId]/participants/page.tsx` の import を差し替える:

```ts
import { listParticipantsWithDivisions } from "@/features/participant/repository";
```

（`import { listParticipantsInTournament } from "@/features/division/repository";` を削除する）

本体の呼び出しを差し替える:

```ts
  const participants = await listParticipantsWithDivisions(
    tournament.organizationId,
    tournament.id,
  );
```

公開ゲート（`findPublicTournament`）と見出し「参加者一覧」は変更しない。

- [ ] **Step 6: 公開ページのテストを更新する**

`src/app/t/[tournamentId]/participants/page.test.tsx` に 4 箇所の置き換えと 1 件の追加を行う。
他のテスト（公開ゲート、パンくず、metadata、準備中バナー）はそのまま残す。

1. モック関数の宣言を差し替える:

```ts
const listParticipantsWithDivisions = vi.fn();
```
（`const listParticipantsInTournament = vi.fn();` を削除）

2. `vi.mock("@/features/division/repository", ...)` のブロックを差し替える:

```ts
vi.mock("@/features/participant/repository", () => ({
  listParticipantsWithDivisions: (
    organizationId: string,
    tournamentId: string,
  ) => listParticipantsWithDivisions(organizationId, tournamentId),
}));
```

3. `beforeEach` の中の 2 行を差し替える:

```ts
    listParticipantsWithDivisions.mockReset();
```

```ts
    listParticipantsWithDivisions.mockResolvedValue([
      {
        id: "p1",
        name: "佐藤 蓮",
        nameKana: "サトウ レン",
        playerNumber: "1",
        divisions: [],
      },
    ]);
```

4. 既存の 2 件のテスト本文で `listParticipantsInTournament` を
`listParticipantsWithDivisions` に置き換える（「参加者はゲートが返した
organizationId で絞り込む」と「公開対象でなければ notFound を呼び、参加者も引かない」）。

5. 「参加者を描画する」の直後に 1 件足す:

```tsx
  it("出場部門を出す", async () => {
    listParticipantsWithDivisions.mockResolvedValue([
      {
        id: "p1",
        name: "佐藤 蓮",
        nameKana: "サトウ レン",
        playerNumber: "1",
        divisions: [{ id: "d1", name: "男子の部" }],
      },
    ]);

    render(await Page(pageProps("t1")));

    expect(screen.getByText("男子の部")).toBeInTheDocument();
  });
```

- [ ] **Step 7: 全体を検証する**

Run: `pnpm test`
Expected: すべて PASS

Run: `pnpm typecheck`
Expected: エラーなしで終了

Run: `pnpm lint`
Expected: 自分が触ったファイルに指摘が無い（CRLF 由来の既存の指摘は無視してよい）

- [ ] **Step 8: コミット**

```bash
git add src/components/public "src/app/t/[tournamentId]/participants"
git commit -F - <<'EOF'
feat(participant): show entered divisions on the public participant list

公開の参加者一覧も出場部門つきの読み出しを共有するようにした。
並べ替えは repository へ移したのでコンポーネントからは外した。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## 実装後の手動確認

`BYPASS_AUTH=1` を設定した dev サーバで、Cookie に `USER_ID=1` を入れて次を確かめる。
dev サーバは複数の worktree が動かしているため、ログに出た実際のポートを読むこと（3000 とは限らない）。

1. 大会詳細から「参加者一覧」へ進める。
2. 既存メンバーから参加者を追加でき、選手番号が連番で振られる。
3. 新しく登録して追加した人が、組織のメンバー一覧にも現れる。
4. 追加した直後の参加者は「出場部門なし」と出て、削除できる。
5. 部門の setup 画面でその人をエントリーすると、一覧に部門名が出て削除ボタンが無効になる。
6. 一覧から選手番号を変えると、部門の setup 画面と公開ページの両方に反映される。
7. 番号を他の人と同じにすると確認を求められ、もう一度保存すると確定する。
8. 公開ページ `/t/<tournamentId>/participants` に出場部門が出る。
