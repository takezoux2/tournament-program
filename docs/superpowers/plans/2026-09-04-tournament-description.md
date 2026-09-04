# 大会概要(Markdown対応)実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大会に Markdown 形式の概要を設定でき、詳細ページで整形表示され、編集フォームに編集/プレビュー切替が付く。

**Architecture:** Tournament に `description String @default("")` を追加し、create / update スライスの schema → usecase → repository に通す。表示は `react-markdown` + `remark-gfm` を包んだ共有コンポーネント `TournamentDescriptionMarkdown` に集約し、フォームのプレビューと詳細ページの両方から使う。

**Tech Stack:** Next.js 16 (App Router / Server Actions), Prisma 7, Effect, Zod 4, react-markdown, remark-gfm, vitest + testing-library, Tailwind 4, Biome。

## Global Constraints

- パッケージ管理は `pnpm`(AGENTS.md)。
- スライス同士(create ⇄ update)は import 禁止。共通部品は `src/features/tournament/schema-parts.ts` に置く(既存コメント参照)。
- 概要の上限は 10,000 文字、エラーメッセージは「大会概要は10000文字以内で入力してください」(spec)。
- 空文字 = 未設定。DB は nullable にしない(spec)。
- 生 HTML はレンダリングしない(react-markdown の既定のまま。rehype-raw を追加しない)。
- lint は `pnpm lint`(Biome)、テストは `pnpm test`、型検査は `pnpm typecheck`。
- fresh worktree では `pnpm typecheck` の前に `pnpm exec next typegen` が必要。
- コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` を付ける。

---

### Task 1: 依存追加・Prisma スキーマ・マイグレーション

**Files:**
- Modify: `prisma/schema.prisma`(Tournament モデル)
- Create: `prisma/migrations/<timestamp>_add_tournament_description/`(migrate dev が生成)
- Modify: `package.json` / `pnpm-lock.yaml`(pnpm add が更新)

**Interfaces:**
- Consumes: なし
- Produces: `prisma.tournament` に `description: string` フィールド(default "")。`react-markdown` / `remark-gfm` パッケージ。

- [ ] **Step 1: ライブラリを追加**

```bash
pnpm add react-markdown remark-gfm
```

- [ ] **Step 2: Prisma スキーマに description を追加**

`prisma/schema.prisma` の Tournament モデルの `startsAt DateTime?` の直後に追加:

```prisma
  /// 大会の概要。Markdown 形式。空文字は未設定を意味する。
  description    String           @default("")
```

- [ ] **Step 3: マイグレーション作成・適用**

```bash
pnpm db:migrate --name add-tournament-description
```

Expected: マイグレーションが生成・適用され、`prisma generate` が走る(DATABASE_URL が必要。接続できない場合は環境の問題なので報告して止まる)。

- [ ] **Step 4: 型が生成されたことを確認**

```bash
pnpm typecheck
```

Expected: PASS(worktree が新規なら先に `pnpm exec next typegen`)。

- [ ] **Step 5: Commit**

```bash
git add prisma package.json pnpm-lock.yaml
git commit -m "feat(tournament): add description column and markdown deps"
```

---

### Task 2: description のバリデーション(schema-parts + create / update schema)

**Files:**
- Modify: `src/features/tournament/schema-parts.ts`
- Modify: `src/features/tournament/create/schema.ts`
- Modify: `src/features/tournament/update/schema.ts`
- Test: `src/features/tournament/create/schema.test.ts`

**Interfaces:**
- Consumes: 既存の `tournamentNameSchema` / `startsAtSchema` のパターン。
- Produces: `tournamentDescriptionSchema`(export)。`CreateTournamentInput` / `UpdateTournamentInput` に `description: string` が追加される。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/tournament/create/schema.test.ts` を修正する。まず parse ヘルパーと既存の期待値を description 込みに変える:

```ts
const parse = (input: {
  name: unknown;
  startsAt: unknown;
  description?: unknown;
}) => createTournamentSchema.safeParse({ description: "", ...input });
```

「妥当な入力を通し、前後の空白を落とす」の期待値を変更:

```ts
      expect(result.data).toEqual({
        name: "春季大会",
        startsAt: null,
        description: "",
      });
```

describe 末尾に description のテストを追加:

```ts
  it("概要の前後の空白を落とす", () => {
    const result = parse({
      name: "春季大会",
      startsAt: "",
      description: "  # 概要  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("# 概要");
    }
  });

  it("空の概要を許容する", () => {
    const result = parse({ name: "春季大会", startsAt: "", description: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("");
    }
  });

  it("10000 文字超の概要を弾く", () => {
    const result = parse({
      name: "春季大会",
      startsAt: "",
      description: "あ".repeat(10001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "大会概要は10000文字以内で入力してください",
      );
    }
  });
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm test src/features/tournament/create/schema.test.ts
```

Expected: FAIL(description キーが unrecognized ではなく、strip されて data に description が無いため toEqual が失敗)。

- [ ] **Step 3: schema-parts に tournamentDescriptionSchema を追加**

`src/features/tournament/schema-parts.ts` の末尾に追加:

```ts
/**
 * 大会概要。Markdown 形式のテキスト。空文字は「未設定」を意味するため
 * 最小長は課さない。
 */
export const tournamentDescriptionSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(
    z.string().max(10000, "大会概要は10000文字以内で入力してください"),
  );
```

- [ ] **Step 4: create / update の schema に description を追加**

`src/features/tournament/create/schema.ts`:

```ts
import { z } from "zod";
import {
  startsAtSchema,
  tournamentDescriptionSchema,
  tournamentNameSchema,
} from "../schema-parts";

export const createTournamentSchema = z.object({
  name: tournamentNameSchema,
  startsAt: startsAtSchema,
  description: tournamentDescriptionSchema,
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
```

`src/features/tournament/update/schema.ts` も同様に import へ `tournamentDescriptionSchema` を追加し、object に `description: tournamentDescriptionSchema,` を追加する(既存のコメントは残す)。

- [ ] **Step 5: テストが通ることを確認**

```bash
pnpm test src/features/tournament/create/schema.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/tournament/schema-parts.ts src/features/tournament/create/schema.ts src/features/tournament/update/schema.ts src/features/tournament/create/schema.test.ts
git commit -m "feat(tournament): validate description in create/update schemas"
```

---

### Task 3: create スライスに description を通す

**Files:**
- Modify: `src/features/tournament/create/repository.ts`
- Test: `src/features/tournament/create/repository.test.ts`
- Test: `src/features/tournament/create/usecase.test.ts`

**Interfaces:**
- Consumes: `CreateTournamentInput`(Task 2 で description: string を含む)。
- Produces: `createTournamentInDb` が `data.description` を prisma に渡す。usecase(`createTournament`)は `{ ...input, organizationId }` を渡すだけなので変更不要。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/tournament/create/repository.test.ts` の「organizationId・name・startsAt を渡して大会を作る」を description 込みに更新(テスト名も「organizationId・name・startsAt・description を渡して大会を作る」に変更):

```ts
    const exit = await Effect.runPromiseExit(
      createTournamentInDb({
        organizationId: "o1",
        name: "春季大会",
        startsAt,
        description: "# 概要",
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: "o1",
        name: "春季大会",
        startsAt,
        description: "# 概要",
      },
      select: { id: true },
    });
```

同ファイルの他 2 テストの `createTournamentInDb({...})` 呼び出しにも `description: "",` を追加する(型エラー回避)。

`src/features/tournament/create/usecase.test.ts` の `input` と期待値も更新:

```ts
const input = { name: "春季大会", startsAt: null, description: "" };
```

```ts
    expect(port).toHaveBeenCalledWith({
      name: "春季大会",
      startsAt: null,
      description: "",
      organizationId: "o1",
    });
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm test src/features/tournament/create
```

Expected: repository.test が FAIL(data に description が無い)。usecase.test は PASS のはず(スプレッドで通るため)。

- [ ] **Step 3: repository に description を追加**

`src/features/tournament/create/repository.ts` の `data` に 1 行追加:

```ts
        data: {
          organizationId: input.organizationId,
          name: input.name,
          startsAt: input.startsAt,
          description: input.description,
        },
```

- [ ] **Step 4: テストが通ることを確認**

```bash
pnpm test src/features/tournament/create
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tournament/create
git commit -m "feat(tournament): persist description on create"
```

---

### Task 4: update スライスに description を通す

**Files:**
- Modify: `src/features/tournament/update/repository.ts`
- Modify: `src/features/tournament/update/usecase.ts`
- Test: `src/features/tournament/update/repository.test.ts`
- Test: `src/features/tournament/update/usecase.test.ts`

**Interfaces:**
- Consumes: `UpdateTournamentInput`(description: string を含む)。
- Produces: `UpdateTournamentPort` の input 型に `description: string` が追加され、`updateMany` の `data` に渡る。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/tournament/update/repository.test.ts` と `usecase.test.ts` を開き、既存の呼び出し・期待値の `name` / `startsAt` と並ぶ箇所すべてに `description` を追加する。repository.test では updateMany への期待値に:

```ts
        data: { name: "秋季大会", startsAt: null, description: "# 概要" },
```

のように description を含め、`updateTournamentInDb({...})` の入力にも `description: "# 概要"`(その他のテストは `description: ""`)を追加する。usecase.test では port への期待値:

```ts
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      name: "秋季大会",
      startsAt: null,
      description: "# 概要",
    });
```

(実際の変数名・値は既存テストに合わせ、description だけを一貫して追加する。)

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm test src/features/tournament/update
```

Expected: FAIL(型エラーまたは期待値不一致)。

- [ ] **Step 3: repository と usecase に description を追加**

`src/features/tournament/update/repository.ts`:

```ts
export type UpdateTournamentPort = (input: {
  organizationId: string;
  tournamentId: string;
  name: string;
  startsAt: Date | null;
  description: string;
}) => Effect.Effect<{ updated: number }, TournamentError>;
```

`updateMany` の data:

```ts
        data: {
          name: input.name,
          startsAt: input.startsAt,
          description: input.description,
        },
```

`src/features/tournament/update/usecase.ts` の port 呼び出し:

```ts
  port({
    organizationId,
    tournamentId,
    name: input.name,
    startsAt: input.startsAt,
    description: input.description,
  });
```

- [ ] **Step 4: テストが通ることを確認**

```bash
pnpm test src/features/tournament/update
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tournament/update
git commit -m "feat(tournament): persist description on update"
```

---

### Task 5: ハンドラが formData から description を読む

**Files:**
- Modify: `src/features/tournament/create/handler.ts`
- Modify: `src/features/tournament/update/handler.ts`
- Test: `src/features/tournament/update/handler.test.ts`(既存テストの FormData に description を追加。期待が壊れる場合のみ修正)

**Interfaces:**
- Consumes: Task 2 の schema(description 必須キー)。
- Produces: Server Action が `formData.get("description")` を schema に渡す。

- [ ] **Step 1: 既存ハンドラテストを確認・実行**

```bash
pnpm test src/features/tournament/update/handler.test.ts
```

Expected: FAIL(schema が description キーを要求するため safeParse が失敗する)。これが「失敗するテスト」に相当する。

- [ ] **Step 2: ハンドラに description を追加**

`create/handler.ts` と `update/handler.ts` の safeParse 入力にそれぞれ 1 行追加:

```ts
  const parsed = createTournamentSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
```

(update 側は `updateTournamentSchema.safeParse`。)

- [ ] **Step 3: テストが通ることを確認**

```bash
pnpm test src/features/tournament
```

Expected: PASS。handler.test.ts が FormData 未設定で落ちる場合は、テスト側の FormData 生成に `formData.set("description", "")` を追加する。

- [ ] **Step 4: Commit**

```bash
git add src/features/tournament/create/handler.ts src/features/tournament/update/handler.ts src/features/tournament/update/handler.test.ts
git commit -m "feat(tournament): read description from form data in handlers"
```

---

### Task 6: 詳細取得に description を含める

**Files:**
- Modify: `src/features/tournament/repository.ts`
- Test: `src/features/tournament/repository.test.ts`

**Interfaces:**
- Consumes: Task 1 の description カラム。
- Produces: `TournamentDetail` 型に `description: string` が追加され、`findTournamentInOrganization` の select に含まれる。一覧(`TournamentSummary`)には追加しない。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/tournament/repository.test.ts` の `findTournamentInOrganization` describe に追加:

```ts
  it("select に description を含める", async () => {
    findFirst.mockResolvedValue(null);

    await findTournamentInOrganization("o1", "t1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ description: true }),
      }),
    );
  });
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm test src/features/tournament/repository.test.ts
```

Expected: FAIL

- [ ] **Step 3: repository を修正**

`src/features/tournament/repository.ts`:

```ts
export type TournamentDetail = TournamentSummary & {
  createdAt: Date;
  description: string;
};
```

`findTournamentInOrganization` の select に `description: true,` を追加。

- [ ] **Step 4: テストが通ることを確認**

```bash
pnpm test src/features/tournament/repository.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tournament/repository.ts src/features/tournament/repository.test.ts
git commit -m "feat(tournament): include description in tournament detail"
```

---

### Task 7: TournamentDescriptionMarkdown コンポーネント

**Files:**
- Create: `src/components/tournament/TournamentDescriptionMarkdown.tsx`
- Test: `src/components/tournament/TournamentDescriptionMarkdown.test.tsx`

**Interfaces:**
- Consumes: `react-markdown`, `remark-gfm`(Task 1)。
- Produces: `TournamentDescriptionMarkdown({ markdown }: { markdown: string })` — フォームのプレビュー(Task 8)と詳細ページ(Task 9)が使う。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/tournament/TournamentDescriptionMarkdown.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TournamentDescriptionMarkdown } from "./TournamentDescriptionMarkdown";

describe("TournamentDescriptionMarkdown", () => {
  it("見出しをレンダリングする", () => {
    render(<TournamentDescriptionMarkdown markdown="# 大会について" />);

    expect(
      screen.getByRole("heading", { name: "大会について" }),
    ).toBeInTheDocument();
  });

  it("GFM の表をレンダリングする", () => {
    render(
      <TournamentDescriptionMarkdown
        markdown={"| 種目 | 定員 |\n| --- | --- |\n| 男子 | 32 |"}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("男子")).toBeInTheDocument();
  });

  it("リンクをレンダリングする", () => {
    render(
      <TournamentDescriptionMarkdown markdown="[会場案内](https://example.com)" />,
    );

    expect(screen.getByRole("link", { name: "会場案内" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("生の HTML を実行可能な要素としてレンダリングしない", () => {
    const { container } = render(
      <TournamentDescriptionMarkdown
        markdown={'<script>alert(1)</script><img src=x onerror="alert(1)">'}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm test src/components/tournament/TournamentDescriptionMarkdown.test.tsx
```

Expected: FAIL(モジュールが存在しない)。

- [ ] **Step 3: コンポーネントを実装**

`src/components/tournament/TournamentDescriptionMarkdown.tsx`:

```tsx
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 大会概要の Markdown を表示する。フォームのプレビューと詳細ページで共用。
 * 生 HTML は react-markdown の既定で無効のため XSS 安全(rehype-raw を足さないこと)。
 */
export function TournamentDescriptionMarkdown({
  markdown,
}: {
  markdown: string;
}) {
  return (
    <div className="text-sm leading-relaxed text-slate-800">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h1
              className="mt-4 mb-2 text-lg font-bold first:mt-0"
              {...props}
            />
          ),
          h2: (props) => (
            <h2
              className="mt-4 mb-2 text-base font-bold first:mt-0"
              {...props}
            />
          ),
          h3: (props) => (
            <h3 className="mt-3 mb-1 font-bold first:mt-0" {...props} />
          ),
          p: (props) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
          ul: (props) => (
            <ul className="my-2 list-disc space-y-1 pl-5" {...props} />
          ),
          ol: (props) => (
            <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />
          ),
          a: (props) => (
            <a className="text-blue-600 underline" {...props} />
          ),
          code: (props) => (
            <code
              className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs"
              {...props}
            />
          ),
          pre: (props) => (
            <pre
              className="my-2 overflow-x-auto rounded bg-slate-100 p-3"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote
              className="my-2 border-l-4 border-slate-300 pl-3 text-slate-600"
              {...props}
            />
          ),
          table: (props) => (
            <div className="my-2 overflow-x-auto">
              <table className="border-collapse" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-medium"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border border-slate-300 px-2 py-1" {...props} />
          ),
          hr: (props) => <hr className="my-4 border-slate-200" {...props} />,
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
pnpm test src/components/tournament/TournamentDescriptionMarkdown.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/tournament/TournamentDescriptionMarkdown.tsx src/components/tournament/TournamentDescriptionMarkdown.test.tsx
git commit -m "feat(tournament): add markdown renderer for description"
```

---

### Task 8: TournamentForm に概要欄(編集/プレビュー切替)を追加

**Files:**
- Modify: `src/components/tournament/TournamentForm.tsx`
- Test: `src/components/tournament/TournamentForm.test.tsx`

**Interfaces:**
- Consumes: `TournamentDescriptionMarkdown`(Task 7)。
- Produces: `TournamentForm` に `defaultDescription?: string` prop。submit 時に `description` フィールドが FormData で送られる。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/tournament/TournamentForm.test.tsx` に追加。既定値テストの拡張と、タブ切替・送信のテスト:

```tsx
  it("既定の概要を textarea に入れる", () => {
    render(
      <TournamentForm
        action={noop}
        slug="tennis"
        submitLabel="保存する"
        defaultDescription="# 概要"
      />,
    );

    expect(screen.getByLabelText("大会概要")).toHaveValue("# 概要");
  });

  it("送信すると概要を FormData として action に渡す", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("description")).toBe("## ルール");
        return { error: null };
      },
    );

    const { container } = render(
      <TournamentForm action={action} slug="tennis" submitLabel="作成する" />,
    );

    fireEvent.change(screen.getByLabelText("大会概要"), {
      target: { value: "## ルール" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("プレビュータブで入力中の Markdown をレンダリングする", () => {
    render(
      <TournamentForm
        action={noop}
        slug="tennis"
        submitLabel="作成する"
        defaultDescription="# 大会について"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "プレビュー" }));

    expect(
      screen.getByRole("heading", { name: "大会について" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    expect(screen.getByLabelText("大会概要")).toHaveValue("# 大会について");
  });

  it("概要が空のままプレビューするとプレースホルダを出す", () => {
    render(
      <TournamentForm action={noop} slug="tennis" submitLabel="作成する" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "プレビュー" }));

    expect(screen.getByText("概要は未入力です")).toBeInTheDocument();
  });

  it("プレビュー中に送信しても概要が FormData に含まれる", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("description")).toBe("# 概要");
        return { error: null };
      },
    );

    const { container } = render(
      <TournamentForm
        action={action}
        slug="tennis"
        submitLabel="作成する"
        defaultDescription="# 概要"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "プレビュー" }));
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm test src/components/tournament/TournamentForm.test.tsx
```

Expected: FAIL(「大会概要」欄が存在しない)。

- [ ] **Step 3: TournamentForm を実装**

`src/components/tournament/TournamentForm.tsx` を以下に書き換える(開始日時のブロックとエラー表示の間に概要欄を挿入):

```tsx
"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";
import { TournamentDescriptionMarkdown } from "./TournamentDescriptionMarkdown";

export function TournamentForm({
  action,
  slug,
  submitLabel,
  defaultName = "",
  defaultStartsAt = "",
  defaultDescription = "",
  tournamentId,
}: {
  action: TournamentFormAction;
  slug: string;
  submitLabel: string;
  defaultName?: string;
  /** toDateTimeLocalValue で作った YYYY-MM-DDTHH:mm 形式の文字列。 */
  defaultStartsAt?: string;
  /** Markdown 形式の大会概要。 */
  defaultDescription?: string;
  /** 編集時に渡す。どの大会を更新するかを handler へ伝える。 */
  tournamentId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TOURNAMENT_FORM_STATE,
  );
  const [description, setDescription] = useState(defaultDescription);
  const [descriptionTab, setDescriptionTab] = useState<"edit" | "preview">(
    "edit",
  );

  return (
    <form action={formAction} className="space-y-4">
      {/* ...既存の hidden input・大会名・開始日時ブロックはそのまま... */}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label
            htmlFor="description"
            className="block text-sm font-medium text-slate-700"
          >
            大会概要
          </label>
          <div className="flex gap-1" role="tablist">
            <button
              type="button"
              onClick={() => setDescriptionTab("edit")}
              className={`rounded px-2 py-1 text-xs ${
                descriptionTab === "edit"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600"
              }`}
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => setDescriptionTab("preview")}
              className={`rounded px-2 py-1 text-xs ${
                descriptionTab === "preview"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600"
              }`}
            >
              プレビュー
            </button>
          </div>
        </div>
        {/* プレビュー中も textarea を DOM に残して submit 値を保つ(hidden 切替)。 */}
        <textarea
          id="description"
          name="description"
          rows={8}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={`w-full rounded border border-slate-300 px-3 py-2 text-sm ${
            descriptionTab === "edit" ? "" : "hidden"
          }`}
        />
        {descriptionTab === "preview" &&
          (description.trim() === "" ? (
            <p className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
              概要は未入力です
            </p>
          ) : (
            <div className="rounded border border-slate-200 bg-white px-3 py-2">
              <TournamentDescriptionMarkdown markdown={description} />
            </div>
          ))}
        <p className="text-xs text-slate-500">Markdown で記述できる</p>
      </div>

      {/* ...既存のエラー表示・送信ボタンはそのまま... */}
    </form>
  );
}
```

(コメント部分は既存コードをそのまま残す指示であり、実ファイルでは既存の JSX を保持する。)

- [ ] **Step 4: テストが通ることを確認**

```bash
pnpm test src/components/tournament/TournamentForm.test.tsx
```

Expected: PASS(既存テスト含む)。

- [ ] **Step 5: Commit**

```bash
git add src/components/tournament/TournamentForm.tsx src/components/tournament/TournamentForm.test.tsx
git commit -m "feat(tournament): add description field with markdown preview to form"
```

---

### Task 9: 詳細ページ表示と編集ページの既定値

**Files:**
- Modify: `src/components/tournament/TournamentDetail.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx`
- Test: `src/components/tournament/TournamentDetail.test.tsx`

**Interfaces:**
- Consumes: `TournamentDetail.description`(Task 6)、`TournamentDescriptionMarkdown`(Task 7)、`TournamentForm.defaultDescription`(Task 8)。
- Produces: 詳細ページに概要セクション。編集フォームに既存概要がプリセットされる。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/tournament/TournamentDetail.test.tsx` のフィクスチャに `description: ""` を追加:

```ts
const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: new Date(2026, 7, 29, 10, 5),
  status: "DRAFT" as const,
  createdAt: new Date(2026, 7, 1, 9, 0),
  description: "",
};
```

describe 末尾にテストを追加:

```tsx
  it("概要があれば Markdown をレンダリングして表示する", () => {
    render(
      <TournamentDetailView
        slug="tennis"
        tournament={{ ...tournament, description: "## 会場のご案内" }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "会場のご案内" }),
    ).toBeInTheDocument();
  });

  it("概要が空なら概要セクションを出さない", () => {
    render(<TournamentDetailView slug="tennis" tournament={tournament} />);

    expect(screen.queryByText("概要")).toBeNull();
  });
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm test src/components/tournament/TournamentDetail.test.tsx
```

Expected: FAIL(概要が表示されない)。

- [ ] **Step 3: TournamentDetailView に概要セクションを追加**

`src/components/tournament/TournamentDetail.tsx` の import に追加:

```tsx
import { TournamentDescriptionMarkdown } from "./TournamentDescriptionMarkdown";
```

`</dl>` の直後に追加:

```tsx
      {tournament.description !== "" && (
        <section className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3">
          <h2 className="text-sm font-medium text-slate-500">概要</h2>
          <TournamentDescriptionMarkdown markdown={tournament.description} />
        </section>
      )}
```

- [ ] **Step 4: 編集ページに既定値を渡す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx` の `TournamentForm` に prop を追加:

```tsx
            defaultDescription={tournament.description}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
pnpm test src/components/tournament
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/TournamentDetail.tsx src/components/tournament/TournamentDetail.test.tsx "src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx"
git commit -m "feat(tournament): show markdown description on detail page"
```

---

### Task 10: 全体検証

**Files:** なし(検証のみ)

- [ ] **Step 1: 型検査・lint・全テスト**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: すべて PASS。lint 差分は `pnpm lint:fix` で解消してからコミットに含める。

- [ ] **Step 2: ページテストの影響確認**

`src/app/orgs/[slug]/tournaments/**/page.test.tsx` が落ちた場合、フィクスチャの tournament オブジェクトに `description: ""` を追加して直す(型追加による既知の影響)。

- [ ] **Step 3: 修正があれば Commit**

```bash
git add -A
git commit -m "test(tournament): align fixtures with description field"
```

(修正が無ければコミット不要。)
