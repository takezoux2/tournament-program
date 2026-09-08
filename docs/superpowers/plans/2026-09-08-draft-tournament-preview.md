# 準備中の大会を組織メンバーがプレビューできるようにする Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開ページ `/t/**` を、その大会の組織メンバーに限り `DRAFT`（準備中）状態でも閲覧できるようにし、プレビュー中であることを画面に明示する。

**Architecture:** 公開ゲート `findPublicTournament` に閲覧者のユーザー ID を必須引数として渡し、Prisma の `where` を「公開状態 **または** 閲覧者がその組織のメンバー」に広げる。判定は引き続き `where` の中だけで完結し、取得してから status で弾く形にはしない。ページ側はログイン不要のまま `getOptionalSession()`（redirect しない）で閲覧者を取る。

**Tech Stack:** Next.js (App Router, Server Components) / Prisma / Better Auth / Vitest + Testing Library / Biome

**設計書:** `docs/superpowers/specs/2026-09-08-draft-tournament-preview-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。テストは `pnpm test`、型検査は `pnpm typecheck`、lint は `pnpm lint`。
- 「管理者」＝**当該大会の組織メンバー全員**。`tournament.edit` などの個別権限は問わない。新しい権限コードや migration は追加しない。
- 公開可否の判定は **Prisma の `where` の中だけ**で行う。取得後に status で弾く形にはしない。
- `findPublicTournament` の第 2 引数 `viewerUserId` は **デフォルト値を持たない必須引数**にする。渡し忘れを型エラーで潰すのが狙いなので、`= null` などのデフォルトを付けてはいけない。
- 既存コードのコメントは日本語。同じ調子で、「なぜそうしたか」を書く。
- 各タスクの終了時点で `pnpm test` と `pnpm typecheck` の両方が通ること。
- バナー文言（一字一句このまま）: `この大会は準備中です。この画面は組織のメンバーにしか表示されません。`
- Windows のチェックアウトでは Biome が CRLF 由来の既存エラーを大量に出す。lint の判断は自分が変更した内容に対して行い、CRLF のみのエラーは無視してよい。

---

### Task 1: redirect しないセッション取得 `getOptionalSession`

`/t/**` はログイン不要なので、未ログインでも例外にせず `null` を返すセッション取得が要る。既存の `requireSession` をこの関数の上に組み直す。

**Files:**
- Modify: `src/shared/middleware/require-session.ts`
- Test: `src/shared/middleware/require-session.test.ts`

**Interfaces:**
- Consumes: `getBypassSession()`（`@/shared/lib/auth-bypass-session`）、`auth.api.getSession()`（`@/shared/lib/auth`）
- Produces: `getOptionalSession(): Promise<Session | null>` — ログイン中ならセッション、未ログインなら `null`。`requireSession()` の戻り値の型は現行から変えない。

- [ ] **Step 1: 失敗するテストを書く**

`src/shared/middleware/require-session.test.ts` の import 行を書き換える。

```ts
const { getOptionalSession, requireSession } = await import("./require-session");
```

ファイル末尾に describe を追加する。

```ts
describe("getOptionalSession", () => {
  beforeEach(() => {
    getSession.mockReset();
    getBypassSession.mockReset();
    // 既定はバイパス無効相当（getBypassSession が null を返す）。
    getBypassSession.mockResolvedValue(null);
    redirect.mockClear();
  });

  it("セッションが無ければ null を返し、リダイレクトしない", async () => {
    // requireSession との唯一の違いがここ。公開ページは未ログインでも
    // 開けるので、境界ではなく「閲覧者が誰か」を知るためだけに使う。
    getSession.mockResolvedValue(null);

    await expect(getOptionalSession()).resolves.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("セッションがあればそれを返す", async () => {
    const session = { user: { id: "u1", name: "竹添" } };
    getSession.mockResolvedValue(session);

    await expect(getOptionalSession()).resolves.toBe(session);
  });

  it("バイパスセッションを通常認証より優先する", async () => {
    const bypassed = { session: { userId: "u9" }, user: { id: "u9" } };
    getBypassSession.mockResolvedValue(bypassed);
    // 通常認証が失敗する状況でもバイパスが優先される。
    getSession.mockRejectedValue(new Error("DB down"));

    await expect(getOptionalSession()).resolves.toBe(bypassed);
    expect(getSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/shared/middleware/require-session.test.ts`
Expected: FAIL。`getOptionalSession is not a function` 相当のエラーになる。

- [ ] **Step 3: 実装する**

`src/shared/middleware/require-session.ts` を次の内容にする。既存の `requireSession` の doc コメントはそのまま残す。

```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/shared/lib/auth";
import { getBypassSession } from "@/shared/lib/auth-bypass-session";

/**
 * ログインしていればセッションを、していなければ null を返す。
 * 公開ページ（/t/**）のように「ログイン不要だが、ログインしていれば
 * 見えるものが増える」画面で閲覧者を知るために使う。
 * リダイレクトしないので、これ自体はセキュリティ境界ではない。
 * 境界が要る画面では requireSession() を使うこと。
 */
export const getOptionalSession = async () => {
  // 開発用バイパス（BYPASS_AUTH=1）。有効なときだけ非 null が返るため、
  // 未設定の通常運用では以降の処理はこれまでと完全に同じ。
  const bypassSession = await getBypassSession();
  if (bypassSession) {
    return bypassSession;
  }

  return await auth.api.getSession({ headers: await headers() });
};

/**
 * 認証の実際のセキュリティ境界。保護したい Server Component / Server Action の
 * 冒頭で必ず呼ぶ。proxy.ts の Cookie チェックは体感速度のための最適化であって
 * 署名検証をしていないため、境界として当てにしてはならない。
 */
export const requireSession = async () => {
  const session = await getOptionalSession();
  if (!session) {
    redirect("/login");
  }
  return session;
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/shared/middleware/require-session.test.ts`
Expected: PASS。`requireSession` の既存 5 件も引き続き通ること（バイパス優先とリダイレクトの振る舞いは変えていない）。

Run: `pnpm typecheck`
Expected: エラーなし。`redirect` の戻り値が `never` なので、`if (!session)` の後で `session` は非 null に絞り込まれる。

- [ ] **Step 5: コミット**

```bash
git add src/shared/middleware/require-session.ts src/shared/middleware/require-session.test.ts
git commit -m "feat(auth): add getOptionalSession for pages that work signed out"
```

---

### Task 2: 公開ゲートに閲覧者を渡し、メンバーには準備中も見せる

ゲート `findPublicTournament` に `viewerUserId` を必須引数で足し、`where` を `OR` に広げる。必須引数にすることで、既存の呼び出し 8 箇所（4 ページ × 本体 + `generateMetadata`）が型エラーになり、渡し忘れが起きない。同じタスクでその 8 箇所も配線する。

**Files:**
- Modify: `src/features/tournament/repository.ts`
- Modify: `src/proxy.ts`（コメントのみ）
- Modify: `src/app/t/[tournamentId]/page.tsx`
- Modify: `src/app/t/[tournamentId]/schedule/page.tsx`
- Modify: `src/app/t/[tournamentId]/participants/page.tsx`
- Modify: `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`
- Test: `src/features/tournament/repository.test.ts`
- Test: `src/app/t/[tournamentId]/page.test.tsx`
- Test: `src/app/t/[tournamentId]/schedule/page.test.tsx`
- Test: `src/app/t/[tournamentId]/participants/page.test.tsx`
- Test: `src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`

**Interfaces:**
- Consumes: `getOptionalSession()`（Task 1、`@/shared/middleware/require-session`）
- Produces:
  - `findPublicTournament(tournamentId: string, viewerUserId: string | null): Promise<PublicTournament | null>`
  - `PublicTournament` に `isPreview: boolean` が増える（既存プロパティは不変）。この値は Task 4 でバナーの出し分けに使う。

- [ ] **Step 1: 失敗するテストを書く（repository）**

`src/features/tournament/repository.test.ts` の `describe("findPublicTournament")` の中を書き換える。

既存の「公開してよい状態を where で許可リストとして絞り込む」1 件を、次の 2 件で置き換える。

```ts
  it("未ログインのときは公開してよい状態だけを where で許可する（公開範囲の回帰テスト）", async () => {
    // 取得してから status で弾く形にすると、4 ページのうち 1 枚で
    // 書き忘れた箇所がそのまま公開の穴になる。where に置けば
    // 書き忘れは「見つからない」に倒れる。除外リスト（status: { not: "DRAFT" }）
    // ではなく許可リストにしているのは、enum に状態が増えたときに
    // 書き忘れても新しい状態を世界に公開してしまわないため。
    findFirst.mockResolvedValue(null);

    await findPublicTournament("t1", null);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "t1",
          OR: [{ status: { in: PUBLIC_TOURNAMENT_STATUSES } }],
        },
      }),
    );
  });

  it("ログイン中は、閲覧者が組織メンバーである大会も where で許可する", async () => {
    // 準備中プレビューの入口。メンバー判定もリレーションで where に書くので、
    // クエリは 1 本のままで、公開可否の判断はこの関数に閉じたままになる。
    findFirst.mockResolvedValue(null);

    await findPublicTournament("t1", "u1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "t1",
          OR: [
            { status: { in: PUBLIC_TOURNAMENT_STATUSES } },
            { organization: { users: { some: { userId: "u1" } } } },
          ],
        },
      }),
    );
  });
```

同じ describe 内に isPreview の 2 件を追加する。

```ts
  it("公開状態で見つかった大会は isPreview が false", async () => {
    findFirst.mockResolvedValue({
      id: "t1",
      name: "春季大会",
      startsAt: null,
      status: "IN_PROGRESS",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      description: "",
      organizationId: "o1",
      organization: { name: "テニス部" },
    });

    await expect(findPublicTournament("t1", "u1")).resolves.toMatchObject({
      isPreview: false,
    });
  });

  it("準備中の大会がメンバー資格で見つかった場合は isPreview が true", async () => {
    // isPreview は公開可否の判断ではなく、バナーを出すかどうかの表示用フラグ。
    // ゲート自体は where で済んでいる。
    findFirst.mockResolvedValue({
      id: "t1",
      name: "春季大会",
      startsAt: null,
      status: "DRAFT",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      description: "",
      organizationId: "o1",
      organization: { name: "テニス部" },
    });

    await expect(findPublicTournament("t1", "u1")).resolves.toMatchObject({
      isPreview: true,
    });
  });
```

`describe("findPublicTournament")` に残っている他の 3 件（`見つからない場合は null を返す` / `organization.name を organizationName へ平して返す` / `select に description と organizationId を含める`）は、`findPublicTournament("t1")` の呼び出しをすべて `findPublicTournament("t1", null)` に直す。`PUBLIC_TOURNAMENT_STATUSES` の中身を固定する 2 件（`DRAFT は公開対象に含まれない` / `許可リストの中身そのものを固定する`）はそのまま残す。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/features/tournament/repository.test.ts`
Expected: FAIL。`where` が `OR` を含まない、`isPreview` が `undefined`、で 4 件が落ちる。

- [ ] **Step 3: ゲートを実装する**

`src/features/tournament/repository.ts` の `PublicTournament` 型と `findPublicTournament` を置き換える。

```ts
export type PublicTournament = TournamentDetail & {
  organizationId: string;
  organizationName: string;
  /**
   * 公開状態ではなく、閲覧者が組織メンバーであることでゲートを通ったか。
   * 公開可否の判断ではなく、準備中バナーを出すかどうかの表示用フラグ。
   */
  isPreview: boolean;
};

/**
 * 公開ページの唯一の入口。公開してよい状態だけを where で許可リストとして
 * 絞り込むのが要点で、取得してから status で弾く形にはしない。4 つある
 * 公開ページのどれか 1 枚で確認を書き忘れても、この形なら「見つからない」に
 * 倒れる。PUBLIC_TOURNAMENT_STATUSES を除外リストではなく許可リストに
 * してあるのは、TournamentStatus に値が増えたときに書き忘れても
 * 新しい状態が世界に公開されてしまわないようにするため。
 * 組織スコープの findTournamentInOrganization とは別関数にしてあり、
 * 公開の判断がこの 1 箇所に閉じている。
 *
 * viewerUserId は、その大会の組織メンバーに限って準備中（DRAFT）の
 * 大会もプレビューさせるための閲覧者。メンバー判定もリレーションで
 * where に書くため、クエリは 1 本のままで公開の判断はここに閉じたままになる。
 * デフォルト値を付けず必須引数にしてあるのは、呼び出し側で渡し忘れると
 * 型エラーになるようにするため。既定値を与えると、渡し忘れた画面だけ
 * プレビューが黙って効かなくなり、原因が分かりにくい。
 */
export const findPublicTournament = async (
  tournamentId: string,
  viewerUserId: string | null,
): Promise<PublicTournament | null> => {
  const row = await prisma.tournament.findFirst({
    where: {
      id: tournamentId,
      OR: [
        { status: { in: PUBLIC_TOURNAMENT_STATUSES } },
        // 未ログインのときは項自体を組み立てない。空配列の展開なので
        // where の形は従来と同じ（許可されるのは公開状態だけ）になる。
        ...(viewerUserId === null
          ? []
          : [{ organization: { users: { some: { userId: viewerUserId } } } }]),
      ],
    },
    select: {
      id: true,
      name: true,
      startsAt: true,
      status: true,
      createdAt: true,
      description: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  });
  if (row === null) {
    return null;
  }

  // organization.name はここで平す。ネストしたまま運ぶと、
  // 画面側が Prisma の select の形を知ることになる。
  const { organization, ...rest } = row;
  return {
    ...rest,
    organizationName: organization.name,
    isPreview: !PUBLIC_TOURNAMENT_STATUSES.includes(row.status),
  };
};
```

- [ ] **Step 4: repository のテストが通ることを確認する**

Run: `pnpm exec vitest run src/features/tournament/repository.test.ts`
Expected: PASS（全件）。

- [ ] **Step 5: 4 ページの呼び出しを配線する**

4 ページそれぞれで、`findPublicTournament` を呼んでいる箇所（本体と `generateMetadata` の計 2 箇所ずつ）の直前に閲覧者を取る行を足し、第 2 引数として渡す。import も足す。

各ファイルに次の import を追加する。

```ts
import { getOptionalSession } from "@/shared/middleware/require-session";
```

`src/app/t/[tournamentId]/page.tsx` の `generateMetadata`:

```ts
  const { tournamentId } = await params;
  const session = await getOptionalSession();
  const tournament = await findPublicTournament(
    tournamentId,
    session?.user.id ?? null,
  );
  // 公開対象でない大会の名前をタイトルに出さない。本体は notFound になる。
  // 準備中の大会名が出るのは、そもそもメンバーしか到達できない場合だけ。
  if (tournament === null) {
    return {};
  }
```

同ファイルの本体:

```ts
  const { tournamentId } = await params;

  // 公開ゲート。公開してよい状態だけを where で許可するのはこの関数が持つ。
  // 閲覧者を渡すのは、その組織のメンバーに準備中の大会も見せるため。
  const session = await getOptionalSession();
  const tournament = await findPublicTournament(
    tournamentId,
    session?.user.id ?? null,
  );
  if (tournament === null) {
    notFound();
  }
```

`schedule/page.tsx`、`participants/page.tsx`、`divisions/[divisionId]/page.tsx` の 3 枚にも、`generateMetadata` と本体の両方に同じ形（`const session = await getOptionalSession();` と、`session?.user.id ?? null` を第 2 引数に渡す `findPublicTournament`）を入れる。それ以外のロジック（`notFound()`、後続の `listDivisionsInTournament` などへの `tournament.organizationId` の受け渡し、`divisions/[divisionId]` の `findDivisionInTournament` と `format === "SINGLE_ELIMINATION"` の分岐）は一切変えない。

- [ ] **Step 6: proxy.ts のコメントを実態に合わせる**

`src/proxy.ts` の `proxy` 関数の doc コメントのうち、次の一文を含む段落を書き換える。

変更前:

```
 * /t/... （/t/[tournamentId] 配下の公開ページ）はこの最適化の対象から
 * 除外している。これらのページは設計上ログイン不要で公開されており、
 * その境界は requireSession() ではなく findPublicTournament の絞り込み
 * （Prisma の where 句で DRAFT を除外する）である。
```

変更後:

```
 * /t/... （/t/[tournamentId] 配下の公開ページ）はこの最適化の対象から
 * 除外している。これらのページは設計上ログイン不要で公開されており、
 * その境界は requireSession() ではなく findPublicTournament の絞り込み
 * （Prisma の where 句で「公開状態、または閲覧者がその大会の組織メンバーで
 * あること」を許可する）である。未ログインの閲覧者には公開状態しか
 * 許可されないため、ここで素通しにしても準備中の大会は漏れない。
```

同じファイル内の残りの記述（`"t/"` を末尾スラッシュ込みで除外する理由、`matcher` の中身）は変えない。

- [ ] **Step 7: 4 ページのテストを新しい呼び出し形に合わせる**

4 ページのテストそれぞれで、次の 3 点を直す。

(a) `@/features/tournament/repository` のモックが第 2 引数を捨てているので、両方を転送する形にする。

```ts
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string, viewerUserId: string | null) =>
    findPublicTournament(tournamentId, viewerUserId),
}));
```

(b) `getOptionalSession` のモックを足す。`const findPublicTournament = vi.fn();` の並びに `const getOptionalSession = vi.fn();` を足し、他の `vi.mock` の並びに次を足す。

```ts
vi.mock("@/shared/middleware/require-session", () => ({
  getOptionalSession: () => getOptionalSession(),
}));
```

`beforeEach` に既定値（未ログイン）を足す。

```ts
    getOptionalSession.mockReset();
    getOptionalSession.mockResolvedValue(null);
```

(c) 既存の `expect(findPublicTournament).toHaveBeenCalledWith("t1")` を `toHaveBeenCalledWith("t1", null)` に直し、ログイン中のケースを 1 件足す。`divisions/[divisionId]/page.test.tsx` だけは `pageProps` が 2 引数なので `pageProps("t1", "d1")` を使う。

```ts
  it("ログイン中は閲覧者の user.id を公開ゲートに渡す", async () => {
    // 渡さないとメンバーでも準備中の大会が 404 になる。
    getOptionalSession.mockResolvedValue({ user: { id: "u1" } });

    await Page(pageProps("t1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1", "u1");
  });
```

- [ ] **Step 8: 全体が通ることを確認する**

Run: `pnpm test`
Expected: PASS（全件）。

Run: `pnpm typecheck`
Expected: エラーなし。8 箇所すべてに第 2 引数が渡っていれば通る。

- [ ] **Step 9: コミット**

```bash
git add src/features/tournament/repository.ts src/features/tournament/repository.test.ts src/proxy.ts "src/app/t/[tournamentId]/page.tsx" "src/app/t/[tournamentId]/page.test.tsx" "src/app/t/[tournamentId]/schedule/page.tsx" "src/app/t/[tournamentId]/schedule/page.test.tsx" "src/app/t/[tournamentId]/participants/page.tsx" "src/app/t/[tournamentId]/participants/page.test.tsx" "src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx" "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"
git commit -m "feat(public): let org members open draft tournaments"
```

---

### Task 3: 準備中バナーのコンポーネント

**Files:**
- Create: `src/components/public/PublicPreviewNotice.tsx`
- Test: `src/components/public/PublicPreviewNotice.test.tsx`

**Interfaces:**
- Consumes: なし（props を取らない）
- Produces: `PublicPreviewNotice()` — `@/components/public/PublicPreviewNotice` から名前付きエクスポート。`role="status"` を持つ要素を 1 つ描画する。Task 4 ではこの role を目印にテストする。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/public/PublicPreviewNotice.test.tsx` を作る。

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicPreviewNotice } from "./PublicPreviewNotice";

describe("PublicPreviewNotice", () => {
  it("準備中であることと、メンバーにしか見えないことの両方を伝える", () => {
    // 「準備中」だけだと、公開前の URL を参加者へ渡してよいと
    // 誤解されうる。見えている範囲まで書いてあることを固定する。
    render(<PublicPreviewNotice />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("準備中");
    expect(notice).toHaveTextContent("組織のメンバーにしか表示されません");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/components/public/PublicPreviewNotice.test.tsx`
Expected: FAIL。`Failed to resolve import "./PublicPreviewNotice"` 相当のエラーになる。

- [ ] **Step 3: 実装する**

`src/components/public/PublicPreviewNotice.tsx` を作る。

```tsx
/**
 * 準備中（DRAFT）の大会を組織メンバーがプレビューしていることを示す帯。
 * 公開済みの画面と見分けが付かないと、まだ公開されていない URL を
 * そのまま参加者へ渡す事故が起きるため、公開ページ側に出す。
 *
 * 出すかどうかは PublicTournament.isPreview で決まる。ここを書き忘れても
 * 表示が出ないだけで、公開範囲そのものは findPublicTournament が持つ。
 */
export function PublicPreviewNotice() {
  return (
    <div
      role="status"
      className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      この大会は準備中です。この画面は組織のメンバーにしか表示されません。
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/public/PublicPreviewNotice.test.tsx`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/public/PublicPreviewNotice.tsx src/components/public/PublicPreviewNotice.test.tsx
git commit -m "feat(public): add the draft preview notice banner"
```

---

### Task 4: 4 ページにバナーを差し込む

**Files:**
- Modify: `src/app/t/[tournamentId]/page.tsx`
- Modify: `src/app/t/[tournamentId]/schedule/page.tsx`
- Modify: `src/app/t/[tournamentId]/participants/page.tsx`
- Modify: `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`
- Test: `src/app/t/[tournamentId]/page.test.tsx`
- Test: `src/app/t/[tournamentId]/schedule/page.test.tsx`
- Test: `src/app/t/[tournamentId]/participants/page.test.tsx`
- Test: `src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`

**Interfaces:**
- Consumes: `PublicPreviewNotice`（Task 3）、`PublicTournament.isPreview`（Task 2）
- Produces: なし（画面表示のみ）

- [ ] **Step 1: 失敗するテストを書く**

4 ページのテストそれぞれで、まず fixture の `tournament` に `isPreview: false` を足す。

```ts
const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "IN_PROGRESS" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
  isPreview: false,
};
```

そのうえで各 describe に次の 2 件を足す。`divisions/[divisionId]/page.test.tsx` だけは `pageProps("t1", "d1")` を使う。

```ts
  it("準備中のプレビューでは準備中バナーを出す", async () => {
    findPublicTournament.mockResolvedValue({
      ...tournament,
      status: "DRAFT" as const,
      isPreview: true,
    });

    render(await Page(pageProps("t1")));

    // 大会トップは概要のステータス欄にも「準備中」を出すため、
    // 文字列ではなく role で引く。
    expect(screen.getByRole("status")).toHaveTextContent(
      "組織のメンバーにしか表示されません",
    );
  });

  it("公開済みの大会では準備中バナーを出さない", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/app/t`
Expected: FAIL。「準備中のプレビューでは準備中バナーを出す」が 4 件とも `Unable to find an accessible element with the role "status"` で落ちる。「出さない」側の 4 件は先に通る。

- [ ] **Step 3: 4 ページに差し込む**

各ページに import を足す。

```ts
import { PublicPreviewNotice } from "@/components/public/PublicPreviewNotice";
```

`PublicHeader` の直後にある `<div className="mx-auto max-w-3xl ...">` の最初の子として次を置く。ヘッダの外ではなくこの div の中に入れるのは、他のコンテンツと同じ最大幅・余白に揃えるため。

```tsx
        {tournament.isPreview && <PublicPreviewNotice />}
```

- `src/app/t/[tournamentId]/page.tsx` — `<div className="mx-auto max-w-3xl space-y-6 px-4 py-6">` の直後、`<PublicTournamentSummary ... />` の前。
- `src/app/t/[tournamentId]/schedule/page.tsx` — `<div className="mx-auto max-w-3xl space-y-4 px-4 py-6">` の直後、`<h1>` を含む div の前。
- `src/app/t/[tournamentId]/participants/page.tsx` — `<div className="mx-auto max-w-3xl space-y-4 px-4 py-6">` の直後、`<h1>` の前。
- `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx` — `<div className="mx-auto max-w-3xl space-y-3 px-4 py-6">` の直後、`<h1>` の前。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test`
Expected: PASS（全件）。

Run: `pnpm typecheck`
Expected: エラーなし。

Run: `pnpm lint`
Expected: 自分が触ったファイルに新しい指摘が無いこと。CRLF 由来の既存エラーは無視してよい。

- [ ] **Step 5: 手で動作を確かめる**

`BYPASS_AUTH=1` で `pnpm dev` を起動し、Cookie に `USER_ID=1` を設定する。組織 `aaaaa` に属する準備中の大会の ID を控えて `/t/<tournamentId>` を開き、バナーが出て中身が見えることを確認する。次に Cookie を消して同じ URL を開き、404 になることを確認する。

- [ ] **Step 6: コミット**

```bash
git add "src/app/t/[tournamentId]/page.tsx" "src/app/t/[tournamentId]/page.test.tsx" "src/app/t/[tournamentId]/schedule/page.tsx" "src/app/t/[tournamentId]/schedule/page.test.tsx" "src/app/t/[tournamentId]/participants/page.tsx" "src/app/t/[tournamentId]/participants/page.test.tsx" "src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx" "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"
git commit -m "feat(public): show a preview banner on draft tournament pages"
```
