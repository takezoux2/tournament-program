# 大会の公開/非公開 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大会詳細ページに確認モーダル付きの「公開する」ボタン、大会編集ページに「非公開にする」ボタンを追加する。

**Architecture:** 公開可否は既存の `Tournament.status` で表す（公開 = DRAFT→IN_PROGRESS、非公開 = IN_PROGRESS/COMPLETED→DRAFT）。サーバー側は既存スライス構成（handler / usecase / repository / schema）で `publish/` と `unpublish/` を追加し、`updateMany` の where に遷移前 status を入れて二重実行を防ぐ。UI はネイティブ `<dialog>` を使う共有 `ConfirmDialog` を作り、公開ボタン・非公開フォームがそれを使う。

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19 `useActionState`, Prisma, Effect, zod, Vitest + Testing Library (jsdom), pnpm

Spec: `docs/superpowers/specs/2026-09-17-tournament-publish-design.md`

## Global Constraints

- パッケージ操作・スクリプトは `pnpm` を使う。
- 新しい worktree では `pnpm exec next typegen` を実行し、メインチェックアウトから `.env` をコピーしてから作業する。
- 兄弟スライス（`publish/` ↔ `unpublish/` ↔ `update/` など）間の import は禁止。共有物は `src/features/tournament/` 直下から import する。
- Server Action の先頭で `requirePermission(slug, "tournament.edit")` を呼ぶ（`@/shared/middleware/require-organization` から import）。
- Prisma の更新は必ず `where` に `id` と `organizationId` の両方を含める。
- Windows チェックアウトでは Biome が CRLF 起因のエラーを大量に出す。lint は内容（CRLF 以外の指摘）で判断する。
- 文言（そのまま使う）:
  - 公開: トリガー「公開する」、タイトル「大会を公開」、本文「「{大会名}」を公開しますか？公開すると参加者を含む誰でも公開ページを閲覧できるようになります。」、確定「公開する」、送信中「公開中...」
  - 非公開: トリガー「非公開にする」、タイトル「大会を非公開にする」、本文「「{大会名}」を非公開にしますか？参加者は公開ページを閲覧できなくなります。」、確定「非公開にする」、送信中「処理中...」
  - キャンセルボタン「キャンセル」
  - エラー: 「この大会はすでに公開されています」「この大会はすでに非公開です」
- テスト実行: `pnpm exec vitest run <path>`

## File Structure

| File | Responsibility |
| --- | --- |
| Create `src/features/tournament/tournament-id-schema.ts` | publish/unpublish 共通の `tournamentId` 検証 |
| Create `src/features/tournament/publish/{schema,repository,usecase,handler}.ts` (+ tests) | 公開の Server Action |
| Create `src/features/tournament/unpublish/{schema,repository,usecase,handler}.ts` (+ tests) | 非公開の Server Action |
| Create `src/components/ui/ConfirmDialog.tsx` (+ test) | 汎用の確認モーダル（`<dialog>` + form） |
| Create `src/components/tournament/PublishTournamentButton.tsx` (+ test) | 詳細ページの公開ボタン |
| Create `src/components/tournament/UnpublishTournamentForm.tsx` (+ test) | 編集ページの非公開セクション |
| Modify `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` (+ test) | DRAFT 時だけ公開ボタンを出す |
| Modify `src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx` (+ test) | 非 DRAFT 時だけ非公開フォームを出す |

---

### Task 1: publish スライス（Server Action）

**Files:**
- Create: `src/features/tournament/tournament-id-schema.ts`
- Create: `src/features/tournament/publish/schema.ts`
- Create: `src/features/tournament/publish/repository.ts`
- Create: `src/features/tournament/publish/usecase.ts`
- Create: `src/features/tournament/publish/handler.ts`
- Test: `src/features/tournament/publish/repository.test.ts`, `usecase.test.ts`, `handler.test.ts`

**Interfaces:**
- Consumes: `toTournamentError`, `TournamentError` (`../errors`), `tournamentErrorFormState` (`../effect-to-form-state`), `TournamentFormState` (`../state`), `findTournamentInOrganization(organizationId, tournamentId): Promise<TournamentDetail | null>` (`../repository`), `requirePermission(slug, code)`.
- Produces:
  - `tournamentIdSchema` (zod object `{ tournamentId: string }`) in `src/features/tournament/tournament-id-schema.ts`
  - `publishTournamentAction(prevState: TournamentFormState, formData: FormData): Promise<TournamentFormState>` in `src/features/tournament/publish/handler.ts`（formData: `slug`, `tournamentId`）

- [ ] **Step 1: 共通スキーマを作る**

`src/features/tournament/tournament-id-schema.ts`:

```ts
import { z } from "zod";

/**
 * publish / unpublish スライスが共有する入力。スライス同士は依存できないため
 * features/tournament 直下に置く。
 */
export const tournamentIdSchema = z.object({
  tournamentId: z.string().min(1, "大会が指定されていません"),
});
```

`src/features/tournament/publish/schema.ts`:

```ts
export { tournamentIdSchema as publishTournamentSchema } from "../tournament-id-schema";
```

- [ ] **Step 2: repository の失敗テストを書く**

`src/features/tournament/publish/repository.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    tournament: { updateMany: (args: unknown) => updateMany(args) },
  },
}));

const { publishTournamentInDb } = await import("./repository");

describe("publishTournamentInDb", () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it("組織内の DRAFT の大会だけを IN_PROGRESS にする", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      publishTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    // status 条件が where から落ちると、完了済みの大会を進行中に戻してしまう。
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "t1", organizationId: "o1", status: "DRAFT" },
      data: { status: "IN_PROGRESS" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("失敗は UnexpectedTournamentError として伝える", async () => {
    updateMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      publishTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
```

- [ ] **Step 3: 失敗を確認**

Run: `pnpm exec vitest run src/features/tournament/publish/repository.test.ts`
Expected: FAIL（`./repository` が存在しない）

- [ ] **Step 4: repository を実装**

`src/features/tournament/publish/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TournamentError, toTournamentError } from "../errors";

export type PublishTournamentPort = (input: {
  organizationId: string;
  tournamentId: string;
}) => Effect.Effect<{ updated: number }, TournamentError>;

export const publishTournamentInDb: PublishTournamentPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // 遷移前の status を where に入れておくと、二重送信や古い画面からの
      // 操作は 0 件更新になり、状態を飛び越えた遷移が起きない。
      const result = await prisma.tournament.updateMany({
        where: {
          id: input.tournamentId,
          organizationId: input.organizationId,
          status: "DRAFT",
        },
        data: { status: "IN_PROGRESS" },
      });
      return { updated: result.count };
    },
    catch: toTournamentError,
  });
```

- [ ] **Step 5: usecase のテストと実装**

`src/features/tournament/publish/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedTournamentError } from "../errors";
import type { PublishTournamentPort } from "./repository";
import { publishTournament } from "./usecase";

describe("publishTournament", () => {
  it("組織 id と大会 id を両方 port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ updated: 1 }),
    ) as unknown as PublishTournamentPort;

    const exit = await Effect.runPromiseExit(publishTournament(port, "o1", "t1"));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ organizationId: "o1", tournamentId: "t1" });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: PublishTournamentPort = () =>
      Effect.fail(new UnexpectedTournamentError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(publishTournament(port, "o1", "t1"));

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
```

`src/features/tournament/publish/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { PublishTournamentPort } from "./repository";

export const publishTournament = (
  port: PublishTournamentPort,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ updated: number }, TournamentError> =>
  port({ organizationId, tournamentId });
```

- [ ] **Step 6: handler の失敗テストを書く**

`src/features/tournament/publish/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_TOURNAMENT_FORM_STATE } from "../state";

const requirePermission = vi.fn();
const publishTournamentInDb = vi.fn();
const findTournamentInOrganization = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("./repository", () => ({
  publishTournamentInDb: (input: unknown) => publishTournamentInDb(input),
}));

vi.mock("../repository", () => ({
  findTournamentInOrganization: (organizationId: string, tournamentId: string) =>
    findTournamentInOrganization(organizationId, tournamentId),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

const { publishTournamentAction } = await import("./handler");

const buildFormData = (tournamentId = "t1"): FormData => {
  const data = new FormData();
  data.set("slug", "tennis-club");
  data.set("tournamentId", tournamentId);
  return data;
};

describe("publishTournamentAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    publishTournamentInDb.mockReset();
    findTournamentInOrganization.mockReset();
    revalidatePath.mockClear();
    notFound.mockClear();
    // id と slug をわざと別の値にして取り違えを検出する。
    requirePermission.mockResolvedValue({
      organization: { id: "o1", slug: "tennis-club" },
    });
    publishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 1 }));
  });

  it("tournament.edit を要求する", async () => {
    await publishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData());

    expect(requirePermission).toHaveBeenCalledWith("tennis-club", "tournament.edit");
  });

  it("権限が無ければ打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      publishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(publishTournamentInDb).not.toHaveBeenCalled();
  });

  it("大会 id が空ならエラーを返し、DB を触らない", async () => {
    const state = await publishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(""),
    );

    expect(state).toEqual({ error: "大会が指定されていません" });
    expect(publishTournamentInDb).not.toHaveBeenCalled();
  });

  it("公開できたら組織・詳細・公開ページを再検証してエラーなしを返す", async () => {
    const state = await publishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(),
    );

    expect(state).toEqual({ error: null });
    expect(publishTournamentInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis-club");
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis-club/tournaments/t1");
    expect(revalidatePath).toHaveBeenCalledWith("/t/t1");
  });

  it("0 件で大会が組織内に無ければ notFound", async () => {
    publishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 0 }));
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(
      publishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(findTournamentInOrganization).toHaveBeenCalledWith("o1", "t1");
  });

  it("0 件で大会が存在すれば、すでに公開済みのエラーを返す", async () => {
    publishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 0 }));
    findTournamentInOrganization.mockResolvedValue({ id: "t1", status: "IN_PROGRESS" });

    const state = await publishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(),
    );

    expect(state).toEqual({ error: "この大会はすでに公開されています" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: 失敗を確認**

Run: `pnpm exec vitest run src/features/tournament/publish/handler.test.ts`
Expected: FAIL（`./handler` が存在しない）

- [ ] **Step 8: handler を実装**

`src/features/tournament/publish/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { tournamentErrorFormState } from "../effect-to-form-state";
import { findTournamentInOrganization } from "../repository";
import type { TournamentFormState } from "../state";
import { publishTournamentInDb } from "./repository";
import { publishTournamentSchema } from "./schema";
import { publishTournament } from "./usecase";

export const publishTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  // 画面でボタンを隠していても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = publishTournamentSchema.safeParse({
    tournamentId: String(formData.get("tournamentId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { tournamentId } = parsed.data;

  const exit = await Effect.runPromiseExit(
    publishTournament(publishTournamentInDb, organization.id, tournamentId),
  );

  if (Exit.isFailure(exit)) {
    return tournamentErrorFormState(exit.cause);
  }

  if (exit.value.updated === 0) {
    // 0 件は「組織に無い」か「すでに DRAFT ではない」。前者は存在を漏らさないよう 404。
    const tournament = await findTournamentInOrganization(
      organization.id,
      tournamentId,
    );
    if (!tournament) {
      notFound();
    }
    return { error: "この大会はすでに公開されています" };
  }

  revalidatePath(`/orgs/${slug}`);
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  revalidatePath(`/t/${tournamentId}`);
  return { error: null };
};
```

- [ ] **Step 9: テスト通過を確認**

Run: `pnpm exec vitest run src/features/tournament/publish`
Expected: PASS（repository 2, usecase 2, handler 6）

- [ ] **Step 10: Commit**

```bash
git add src/features/tournament/tournament-id-schema.ts src/features/tournament/publish
git commit -m "feat(tournament): add publish server action"
```

---

### Task 2: unpublish スライス（Server Action）

**Files:**
- Create: `src/features/tournament/unpublish/schema.ts`
- Create: `src/features/tournament/unpublish/repository.ts`
- Create: `src/features/tournament/unpublish/usecase.ts`
- Create: `src/features/tournament/unpublish/handler.ts`
- Test: `src/features/tournament/unpublish/repository.test.ts`, `usecase.test.ts`, `handler.test.ts`

**Interfaces:**
- Consumes: `tournamentIdSchema` from `src/features/tournament/tournament-id-schema.ts`（Task 1）, 他は Task 1 と同じ共有物。
- Produces: `unpublishTournamentAction(prevState: TournamentFormState, formData: FormData): Promise<TournamentFormState>` in `src/features/tournament/unpublish/handler.ts`（formData: `slug`, `tournamentId`。成功時は `redirect` で詳細ページへ）

- [ ] **Step 1: schema**

`src/features/tournament/unpublish/schema.ts`:

```ts
export { tournamentIdSchema as unpublishTournamentSchema } from "../tournament-id-schema";
```

- [ ] **Step 2: repository の失敗テスト**

`src/features/tournament/unpublish/repository.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    tournament: { updateMany: (args: unknown) => updateMany(args) },
  },
}));

const { unpublishTournamentInDb } = await import("./repository");

describe("unpublishTournamentInDb", () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it("組織内の DRAFT 以外の大会だけを DRAFT に戻す", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      unpublishTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "t1", organizationId: "o1", status: { not: "DRAFT" } },
      data: { status: "DRAFT" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("失敗は UnexpectedTournamentError として伝える", async () => {
    updateMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      unpublishTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
```

Run: `pnpm exec vitest run src/features/tournament/unpublish/repository.test.ts` → Expected: FAIL（モジュールなし）

- [ ] **Step 3: repository 実装**

`src/features/tournament/unpublish/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TournamentError, toTournamentError } from "../errors";

export type UnpublishTournamentPort = (input: {
  organizationId: string;
  tournamentId: string;
}) => Effect.Effect<{ updated: number }, TournamentError>;

export const unpublishTournamentInDb: UnpublishTournamentPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // 遷移前の status を where に入れ、すでに DRAFT なら 0 件更新にする。
      const result = await prisma.tournament.updateMany({
        where: {
          id: input.tournamentId,
          organizationId: input.organizationId,
          status: { not: "DRAFT" },
        },
        data: { status: "DRAFT" },
      });
      return { updated: result.count };
    },
    catch: toTournamentError,
  });
```

- [ ] **Step 4: usecase のテストと実装**

`src/features/tournament/unpublish/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedTournamentError } from "../errors";
import type { UnpublishTournamentPort } from "./repository";
import { unpublishTournament } from "./usecase";

describe("unpublishTournament", () => {
  it("組織 id と大会 id を両方 port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ updated: 1 }),
    ) as unknown as UnpublishTournamentPort;

    const exit = await Effect.runPromiseExit(unpublishTournament(port, "o1", "t1"));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ organizationId: "o1", tournamentId: "t1" });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: UnpublishTournamentPort = () =>
      Effect.fail(new UnexpectedTournamentError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(unpublishTournament(port, "o1", "t1"));

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
```

`src/features/tournament/unpublish/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { UnpublishTournamentPort } from "./repository";

export const unpublishTournament = (
  port: UnpublishTournamentPort,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ updated: number }, TournamentError> =>
  port({ organizationId, tournamentId });
```

- [ ] **Step 5: handler の失敗テスト**

`src/features/tournament/unpublish/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_TOURNAMENT_FORM_STATE } from "../state";

const requirePermission = vi.fn();
const unpublishTournamentInDb = vi.fn();
const findTournamentInOrganization = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((_path: string) => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("./repository", () => ({
  unpublishTournamentInDb: (input: unknown) => unpublishTournamentInDb(input),
}));

vi.mock("../repository", () => ({
  findTournamentInOrganization: (organizationId: string, tournamentId: string) =>
    findTournamentInOrganization(organizationId, tournamentId),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { unpublishTournamentAction } = await import("./handler");

const buildFormData = (tournamentId = "t1"): FormData => {
  const data = new FormData();
  data.set("slug", "tennis-club");
  data.set("tournamentId", tournamentId);
  return data;
};

describe("unpublishTournamentAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    unpublishTournamentInDb.mockReset();
    findTournamentInOrganization.mockReset();
    revalidatePath.mockClear();
    notFound.mockClear();
    redirect.mockClear();
    requirePermission.mockResolvedValue({
      organization: { id: "o1", slug: "tennis-club" },
    });
    unpublishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 1 }));
  });

  it("tournament.edit を要求する", async () => {
    await expect(
      unpublishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requirePermission).toHaveBeenCalledWith("tennis-club", "tournament.edit");
  });

  it("権限が無ければ打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      unpublishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(unpublishTournamentInDb).not.toHaveBeenCalled();
  });

  it("大会 id が空ならエラーを返し、DB を触らない", async () => {
    const state = await unpublishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(""),
    );

    expect(state).toEqual({ error: "大会が指定されていません" });
    expect(unpublishTournamentInDb).not.toHaveBeenCalled();
  });

  it("非公開にできたら再検証して詳細ページへ redirect する", async () => {
    await expect(
      unpublishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(unpublishTournamentInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis-club");
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis-club/tournaments/t1");
    expect(revalidatePath).toHaveBeenCalledWith("/t/t1");
    expect(redirect).toHaveBeenCalledWith("/orgs/tennis-club/tournaments/t1");
  });

  it("0 件で大会が組織内に無ければ notFound", async () => {
    unpublishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 0 }));
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(
      unpublishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(findTournamentInOrganization).toHaveBeenCalledWith("o1", "t1");
  });

  it("0 件で大会が存在すれば、すでに非公開のエラーを返す", async () => {
    unpublishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 0 }));
    findTournamentInOrganization.mockResolvedValue({ id: "t1", status: "DRAFT" });

    const state = await unpublishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(),
    );

    expect(state).toEqual({ error: "この大会はすでに非公開です" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm exec vitest run src/features/tournament/unpublish/handler.test.ts` → Expected: FAIL（モジュールなし）

- [ ] **Step 6: handler 実装**

`src/features/tournament/unpublish/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { tournamentErrorFormState } from "../effect-to-form-state";
import { findTournamentInOrganization } from "../repository";
import type { TournamentFormState } from "../state";
import { unpublishTournamentInDb } from "./repository";
import { unpublishTournamentSchema } from "./schema";
import { unpublishTournament } from "./usecase";

export const unpublishTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  // 画面でボタンを隠していても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = unpublishTournamentSchema.safeParse({
    tournamentId: String(formData.get("tournamentId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { tournamentId } = parsed.data;

  const exit = await Effect.runPromiseExit(
    unpublishTournament(unpublishTournamentInDb, organization.id, tournamentId),
  );

  if (Exit.isFailure(exit)) {
    return tournamentErrorFormState(exit.cause);
  }

  if (exit.value.updated === 0) {
    // 0 件は「組織に無い」か「すでに DRAFT」。前者は存在を漏らさないよう 404。
    const tournament = await findTournamentInOrganization(
      organization.id,
      tournamentId,
    );
    if (!tournament) {
      notFound();
    }
    return { error: "この大会はすでに非公開です" };
  }

  revalidatePath(`/orgs/${slug}`);
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  revalidatePath(`/t/${tournamentId}`);
  redirect(`/orgs/${slug}/tournaments/${tournamentId}`);
};
```

- [ ] **Step 7: テスト通過を確認**

Run: `pnpm exec vitest run src/features/tournament/unpublish`
Expected: PASS（repository 2, usecase 2, handler 6）

- [ ] **Step 8: Commit**

```bash
git add src/features/tournament/unpublish
git commit -m "feat(tournament): add unpublish server action"
```

---

### Task 3: ConfirmDialog 共有コンポーネント

**Files:**
- Create: `src/components/ui/ConfirmDialog.tsx`
- Test: `src/components/ui/ConfirmDialog.test.tsx`

**Interfaces:**
- Produces:

```ts
export function ConfirmDialog(props: {
  triggerLabel: string;
  title: string;
  message: string;
  confirmLabel: string;
  pendingLabel: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  hiddenFields: Record<string, string>;
  triggerClassName?: string;
}): JSX.Element
```

- トリガーは `type="button"`。押すと `<dialog>` の `showModal()`。
- ダイアログは `aria-labelledby` でタイトル見出しに紐付く。
- 「キャンセル」（`type="button"`）で `close()`。確定は form の submit。
- `error !== null` のときダイアログ内に `role="alert"` で表示。

**注意:** jsdom 30 は `HTMLDialogElement.prototype.showModal` / `close` を実装していない。テストでは prototype をスタブする（本体コードに分岐を入れない）。

- [ ] **Step 1: 失敗テストを書く**

`src/components/ui/ConfirmDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

// jsdom は <dialog> の showModal / close を実装していないので、open 属性の
// 付け外しだけを模す。
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const baseProps = {
  triggerLabel: "公開する",
  title: "大会を公開",
  message: "公開しますか？",
  confirmLabel: "公開する",
  pendingLabel: "公開中...",
  pending: false,
  error: null,
  hiddenFields: { slug: "tennis", tournamentId: "t1" },
};

describe("ConfirmDialog", () => {
  it("トリガーを押すまでダイアログは開かない", () => {
    const { container } = render(
      <ConfirmDialog {...baseProps} formAction={vi.fn()} />,
    );

    expect(container.querySelector("dialog")).not.toHaveAttribute("open");
  });

  it("トリガーでダイアログが開き、キャンセルで閉じる", () => {
    render(<ConfirmDialog {...baseProps} formAction={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));
    const dialog = screen.getByRole("dialog", { name: "大会を公開" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("公開しますか？");

    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(dialog).not.toHaveAttribute("open");
  });

  it("確定すると hidden 値を含めて formAction を呼ぶ", async () => {
    const formAction = vi.fn();
    render(<ConfirmDialog {...baseProps} formAction={formAction} />);

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));
    const dialog = screen.getByRole("dialog", { name: "大会を公開" });
    const form = dialog.querySelector("form");
    if (!form) throw new Error("form が見つからない");
    fireEvent.submit(form);

    await waitFor(() => expect(formAction).toHaveBeenCalled());
    const formData = formAction.mock.calls[0][0] as FormData;
    expect(formData.get("slug")).toBe("tennis");
    expect(formData.get("tournamentId")).toBe("t1");
  });

  it("送信中は確定ボタンが押せず、送信中の文言になる", () => {
    render(<ConfirmDialog {...baseProps} pending formAction={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));
    expect(screen.getByRole("button", { name: "公開中..." })).toBeDisabled();
  });

  it("エラーをダイアログ内に表示する", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        error="この大会はすでに公開されています"
        formAction={vi.fn()}
      />,
    );

    expect(screen.getByText("この大会はすでに公開されています")).toHaveAttribute(
      "role",
      "alert",
    );
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/components/ui/ConfirmDialog.test.tsx`
Expected: FAIL（`./ConfirmDialog` が存在しない）

- [ ] **Step 3: 実装**

`src/components/ui/ConfirmDialog.tsx`:

```tsx
"use client";

import { useId, useRef } from "react";

/**
 * 確認付きで Server Action を送るためのモーダル。状態（useActionState）は
 * 呼び出し側が持ち、ここは開閉と表示だけを担う。
 */
export function ConfirmDialog({
  triggerLabel,
  title,
  message,
  confirmLabel,
  pendingLabel,
  formAction,
  pending,
  error,
  hiddenFields,
  triggerClassName = "rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800",
}: {
  triggerLabel: string;
  title: string;
  message: string;
  confirmLabel: string;
  pendingLabel: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  hiddenFields: Record<string, string>;
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-full max-w-sm rounded border border-slate-200 bg-white p-0 backdrop:bg-slate-900/40"
      >
        <form action={formAction} className="space-y-4 p-5">
          <h2 id={titleId} className="text-base font-bold text-slate-800">
            {title}
          </h2>
          <p className="text-sm text-slate-700">{message}</p>

          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {error !== null && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `pnpm exec vitest run src/components/ui/ConfirmDialog.test.tsx`
Expected: PASS（5 件）。

jsdom が閉じた `<dialog>` の中身をアクセシビリティツリーから外さない場合、トリガーと確定ボタンが同名（「公開する」）で `getByRole("button", { name: "公開する" })` が複数一致エラーになる。その場合はテスト側で、トリガー取得を `screen.getAllByRole("button", { name: "公開する" })[0]`（DOM 順でトリガーが先）に置き換え、確定ボタンは引き続き `within(dialog)` で取る。本体コードは変えない。これは Task 4 / Task 5 のテストにも同様に適用してよい。

- [ ] **Step 5: Commit**

```bash
git add src/components/ui
git commit -m "feat(ui): add ConfirmDialog modal component"
```

---

### Task 4: 詳細ページの公開ボタン

**Files:**
- Create: `src/components/tournament/PublishTournamentButton.tsx`
- Test: `src/components/tournament/PublishTournamentButton.test.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog`（Task 3）, `publishTournamentAction`（Task 1）, `TournamentFormAction` / `INITIAL_TOURNAMENT_FORM_STATE` (`@/features/tournament/state`)
- Produces: `PublishTournamentButton({ action, slug, tournamentId, tournamentName }: { action: TournamentFormAction; slug: string; tournamentId: string; tournamentName: string })`

- [ ] **Step 1: コンポーネントの失敗テスト**

`src/components/tournament/PublishTournamentButton.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TournamentFormState } from "@/features/tournament/state";
import { PublishTournamentButton } from "./PublishTournamentButton";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("PublishTournamentButton", () => {
  it("公開ボタンで大会名入りの確認モーダルが開く", () => {
    render(
      <PublishTournamentButton
        action={async () => ({ error: null })}
        slug="tennis"
        tournamentId="t1"
        tournamentName="春季大会"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));

    const dialog = screen.getByRole("dialog", { name: "大会を公開" });
    expect(dialog).toHaveTextContent(
      "「春季大会」を公開しますか？公開すると参加者を含む誰でも公開ページを閲覧できるようになります。",
    );
  });

  it("確定すると slug と大会 id を action に渡し、エラーを表示する", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("tournamentId")).toBe("t1");
        return { error: "この大会はすでに公開されています" };
      },
    );

    render(
      <PublishTournamentButton
        action={action}
        slug="tennis"
        tournamentId="t1"
        tournamentName="春季大会"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));
    const dialog = screen.getByRole("dialog", { name: "大会を公開" });
    fireEvent.click(within(dialog).getByRole("button", { name: "公開する" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "この大会はすでに公開されています",
    );
  });
});
```

Run: `pnpm exec vitest run src/components/tournament/PublishTournamentButton.test.tsx` → Expected: FAIL（モジュールなし）

- [ ] **Step 2: 実装**

`src/components/tournament/PublishTournamentButton.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";

export function PublishTournamentButton({
  action,
  slug,
  tournamentId,
  tournamentName,
}: {
  action: TournamentFormAction;
  slug: string;
  tournamentId: string;
  tournamentName: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TOURNAMENT_FORM_STATE,
  );

  return (
    <ConfirmDialog
      triggerLabel="公開する"
      triggerClassName="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white"
      title="大会を公開"
      message={`「${tournamentName}」を公開しますか？公開すると参加者を含む誰でも公開ページを閲覧できるようになります。`}
      confirmLabel="公開する"
      pendingLabel="公開中..."
      formAction={formAction}
      pending={pending}
      error={state.error}
      hiddenFields={{ slug, tournamentId }}
    />
  );
}
```

Run: `pnpm exec vitest run src/components/tournament/PublishTournamentButton.test.tsx` → Expected: PASS（2 件）

- [ ] **Step 3: ページテストに失敗ケースを追加**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx` を開き、既存の `vi.mock("@/features/division/reorder/handler", ...)` の直後に追加:

```tsx
vi.mock("@/features/tournament/publish/handler", () => ({
  publishTournamentAction: async () => ({ error: null }),
}));
```

既存の describe 内に、既存テストが `findTournamentInOrganization` に返している大会オブジェクト（ファイル内の変数名に合わせる）を使って以下を追加する。既存テストの `render(element)` の組み立て方（`const element = await Page(pageProps(...))` 等）をそのまま真似ること:

```tsx
  it("準備中の大会には公開ボタンを出す", async () => {
    findTournamentInOrganization.mockResolvedValue({ ...tournament, status: "DRAFT" });

    const element = await Page(pageProps("tennis-club", "t1"));
    render(element);

    expect(screen.getByRole("button", { name: "公開する" })).toBeInTheDocument();
  });

  it.each(["IN_PROGRESS", "COMPLETED"] as const)(
    "公開済み（%s）の大会には公開ボタンを出さない",
    async (status) => {
      findTournamentInOrganization.mockResolvedValue({ ...tournament, status });

      const element = await Page(pageProps("tennis-club", "t1"));
      render(element);

      expect(screen.queryByRole("button", { name: "公開する" })).not.toBeInTheDocument();
    },
  );
```

（slug・大会 id・大会変数名は既存テストの値に合わせて置き換える。）

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"` → Expected: 追加した「準備中の大会には公開ボタンを出す」が FAIL

- [ ] **Step 4: ページに組み込む**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`:

import に追加:

```tsx
import { PublishTournamentButton } from "@/components/tournament/PublishTournamentButton";
import { publishTournamentAction } from "@/features/tournament/publish/handler";
```

`<div className="flex flex-wrap gap-2">` の先頭（「試合一覧」リンクの前）に追加:

```tsx
          {/* 公開後は status が DRAFT でなくなり、revalidate でボタンが消える。 */}
          {tournament.status === "DRAFT" && (
            <PublishTournamentButton
              action={publishTournamentAction}
              slug={slug}
              tournamentId={tournament.id}
              tournamentName={tournament.name}
            />
          )}
```

- [ ] **Step 5: テスト通過を確認**

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx" src/components/tournament`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/PublishTournamentButton.tsx src/components/tournament/PublishTournamentButton.test.tsx "src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"
git commit -m "feat(tournament): add publish button with confirmation to detail page"
```

---

### Task 5: 編集ページの非公開フォーム

**Files:**
- Create: `src/components/tournament/UnpublishTournamentForm.tsx`
- Test: `src/components/tournament/UnpublishTournamentForm.test.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog`（Task 3）, `unpublishTournamentAction`（Task 2）, `TournamentFormAction` / `INITIAL_TOURNAMENT_FORM_STATE`
- Produces: `UnpublishTournamentForm({ action, slug, tournamentId, tournamentName }: { action: TournamentFormAction; slug: string; tournamentId: string; tournamentName: string })`

- [ ] **Step 1: コンポーネントの失敗テスト**

`src/components/tournament/UnpublishTournamentForm.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TournamentFormState } from "@/features/tournament/state";
import { UnpublishTournamentForm } from "./UnpublishTournamentForm";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("UnpublishTournamentForm", () => {
  it("非公開ボタンで大会名入りの確認モーダルが開く", () => {
    render(
      <UnpublishTournamentForm
        action={async () => ({ error: null })}
        slug="tennis"
        tournamentId="t1"
        tournamentName="春季大会"
      />,
    );

    expect(screen.getByRole("heading", { name: "公開設定" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "非公開にする" }));

    const dialog = screen.getByRole("dialog", { name: "大会を非公開にする" });
    expect(dialog).toHaveTextContent(
      "「春季大会」を非公開にしますか？参加者は公開ページを閲覧できなくなります。",
    );
  });

  it("確定すると slug と大会 id を action に渡す", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("tournamentId")).toBe("t1");
        return { error: null };
      },
    );

    render(
      <UnpublishTournamentForm
        action={action}
        slug="tennis"
        tournamentId="t1"
        tournamentName="春季大会"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "非公開にする" }));
    const dialog = screen.getByRole("dialog", { name: "大会を非公開にする" });
    fireEvent.click(within(dialog).getByRole("button", { name: "非公開にする" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });
});
```

Run: `pnpm exec vitest run src/components/tournament/UnpublishTournamentForm.test.tsx` → Expected: FAIL（モジュールなし）

- [ ] **Step 2: 実装**

`src/components/tournament/UnpublishTournamentForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";

export function UnpublishTournamentForm({
  action,
  slug,
  tournamentId,
  tournamentName,
}: {
  action: TournamentFormAction;
  slug: string;
  tournamentId: string;
  tournamentName: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TOURNAMENT_FORM_STATE,
  );

  return (
    <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-800">公開設定</h2>
      <p className="text-xs text-slate-600">
        この大会は公開中です。非公開にすると公開ページは組織のメンバーにしか表示されません。
      </p>
      <ConfirmDialog
        triggerLabel="非公開にする"
        title="大会を非公開にする"
        message={`「${tournamentName}」を非公開にしますか？参加者は公開ページを閲覧できなくなります。`}
        confirmLabel="非公開にする"
        pendingLabel="処理中..."
        formAction={formAction}
        pending={pending}
        error={state.error}
        hiddenFields={{ slug, tournamentId }}
      />
    </section>
  );
}
```

Run: `pnpm exec vitest run src/components/tournament/UnpublishTournamentForm.test.tsx` → Expected: PASS（2 件）

- [ ] **Step 3: 編集ページテストに失敗ケースを追加**

`src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.test.tsx` の既存 `vi.mock("@/features/tournament/delete/handler", ...)` の直後に追加:

```tsx
vi.mock("@/features/tournament/unpublish/handler", () => ({
  unpublishTournamentAction: async () => ({ error: null }),
}));
```

既存 describe 内に、既存テストの大会オブジェクト・Page 呼び出しの形に合わせて追加:

```tsx
  it.each(["IN_PROGRESS", "COMPLETED"] as const)(
    "公開中（%s）の大会には非公開ボタンを出す",
    async (status) => {
      findTournamentInOrganization.mockResolvedValue({ ...tournament, status });

      const element = await Page(pageProps("tennis-club", "t1"));
      render(element);

      expect(screen.getByRole("button", { name: "非公開にする" })).toBeInTheDocument();
    },
  );

  it("準備中の大会には非公開ボタンを出さない", async () => {
    findTournamentInOrganization.mockResolvedValue({ ...tournament, status: "DRAFT" });

    const element = await Page(pageProps("tennis-club", "t1"));
    render(element);

    expect(screen.queryByRole("button", { name: "非公開にする" })).not.toBeInTheDocument();
  });
```

（変数名・slug・id は既存テストに合わせて置き換える。）

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.test.tsx"` → Expected: 「公開中…非公開ボタンを出す」が FAIL

- [ ] **Step 4: 編集ページに組み込む**

`src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx`:

import に追加:

```tsx
import { UnpublishTournamentForm } from "@/components/tournament/UnpublishTournamentForm";
import { unpublishTournamentAction } from "@/features/tournament/unpublish/handler";
```

`<DeleteTournamentForm ... />` の直前に追加:

```tsx
        {tournament.status !== "DRAFT" && (
          <UnpublishTournamentForm
            action={unpublishTournamentAction}
            slug={slug}
            tournamentId={tournament.id}
            tournamentName={tournament.name}
          />
        )}
```

- [ ] **Step 5: テスト通過を確認**

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.test.tsx" src/components/tournament`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/UnpublishTournamentForm.tsx src/components/tournament/UnpublishTournamentForm.test.tsx "src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.test.tsx"
git commit -m "feat(tournament): add unpublish action with confirmation to edit page"
```

---

### Task 6: 全体検証

- [ ] **Step 1: 全テスト**

Run: `pnpm test`
Expected: すべて PASS

- [ ] **Step 2: 型チェック**

Run: `pnpm exec tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: lint**

Run: `pnpm lint`
Expected: 今回追加・変更したファイルに CRLF 以外の指摘なし（指摘があれば修正してコミット）

- [ ] **Step 4: 手動確認（任意・dev サーバー）**

`BYPASS_AUTH=1` で dev サーバーを起動（ポートはログで確認）、Cookie `USER_ID=1`、組織 `aaaaa` の DRAFT 大会の詳細ページで「公開する」→ モーダル →「公開する」→ ステータスが「進行中」になりボタンが消えること。編集ページで「非公開にする」→ モーダル → 確定 → 詳細ページへ戻りステータス「準備中」、公開ボタンが再表示されること。
