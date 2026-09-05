# 大会の公開（view only）ページ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログイン不要で大会の概要・試合一覧・ブラケット・参加者を閲覧できる、操作を一切持たないスマートフォン向けの公開ページを `/t/[tournamentId]` 配下に作る。

**Architecture:** 公開の可否は `findPublicTournament` という 1 つのリポジトリ関数が `where: { status: { not: "DRAFT" } }` で決める。4 つのページはすべて冒頭でこれを呼び、返ってきた `organizationId` を既存リポジトリへ渡すことで、新しいクエリを 1 本も足さずに既存の所有権チェックを再利用する。表示は新規の `src/components/public/` に置き、編集 UI を持つ既存コンポーネントは流用しない。

**Tech Stack:** Next.js 16 (App Router / Server Components) / React 19 / Prisma 7 / Tailwind CSS v4 / Vitest + Testing Library / Biome

**設計書:** `docs/superpowers/specs/2026-09-05-public-tournament-view-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`pnpm test` / `pnpm typecheck` / `pnpm lint` を使う。
- **vitest のファイル指定は正規表現として扱われる。** `src/app/t/[tournamentId]/page.test.tsx`
  をそのまま渡すと `[tournamentId]` が文字クラスと解釈され、1 件もマッチしない。
  角括弧を含むパスは `.+` で伏せて `"app/t/.+/page.test.tsx"` のように渡すこと。
  この計画の Run 行はすでにその形になっている。
- テストの置き場所は実装ファイルと同じディレクトリの `*.test.ts` / `*.test.tsx`。
- ページのテストは既存の
  `src/app/orgs/[slug]/tournaments/[tournamentId]/matches/page.test.tsx` に倣い、
  依存を `vi.mock` してから `const { default: Page } = await import("./page")` する形にする。
  ページ本体は `const element = await Page(pageProps(...)); render(element);` で描く。
- `notFound` のモックは必ず例外を投げる形にする（本物が制御を打ち切るため）。
  `const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });`
- `src/features/**` から `.tsx` は作らない。画面は `src/components/**` に置く。
- 公開ページは Server Component のみで作る。`"use client"` を新規に書かない
  （既存の `TournamentFlow` 経由の React Flow だけが例外）。
- Tailwind v4 はソース中の文字列を走査してクラスを生成するため、
  `h-[calc(100dvh-11rem)]` のような任意値クラスは**文字列リテラルとして**書く。
  変数で組み立てると生成されない。
- Windows のチェックアウトでは `biome check` が CRLF 由来のエラーを
  リポジトリ全体で出す。lint の合否は**自分が触ったファイルの内容**で判断し、
  改行コードのみの指摘は無視してよい。
- コミットメッセージの末尾に必ず次の行を付ける。

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

## File Structure

**新規作成**

| パス | 責務 |
| --- | --- |
| `src/components/public/PublicHeader.tsx` | 公開ページのパンくず。ユーザー名・ログアウトを持たない |
| `src/components/public/PublicTournamentSummary.tsx` | 大会名・主催・ステータス・開始日時・説明 |
| `src/components/public/PublicDivisionList.tsx` | 部門一覧。各行がブラケットページへのリンク |
| `src/components/public/PublicParticipantList.tsx` | 参加者一覧。選手番号順に並べる |
| `src/components/public/PublicScheduleList.tsx` | 試合一覧。区切りと試合を進行順に描く |
| `src/app/t/[tournamentId]/page.tsx` | 概要ページ |
| `src/app/t/[tournamentId]/schedule/page.tsx` | 試合一覧ページ |
| `src/app/t/[tournamentId]/participants/page.tsx` | 参加者ページ |
| `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx` | ブラケットページ |

**変更**

| パス | 変更内容 |
| --- | --- |
| `src/features/tournament/repository.ts` | `findPublicTournament` と `PublicTournament` 型を追加 |
| `src/features/tournament/format.ts` | `formatPublicTitle` を追加 |
| `src/components/division/DivisionBracket.tsx` | 高さのクラス名を任意 prop にする（既定は現行のまま） |
| `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` | 「公開ページを開く」リンクを追加 |

**設計上の割り切り（意図的なもの。実装時に「直そう」としないこと）**

- 各ページで `generateMetadata` と本体の両方が `findPublicTournament` を呼ぶため、
  1 リクエストにつきこのクエリが 2 回走る。主キー検索なので許容し、
  `react` の `cache()` は使わない（テストが React のリクエスト文脈の外で
  関数を直接呼ぶため、余計な壊れ方を持ち込まない）。

---

## Task 1: 公開ゲート `findPublicTournament` とタイトル整形

**Files:**
- Modify: `src/features/tournament/repository.ts`
- Test: `src/features/tournament/repository.test.ts`
- Modify: `src/features/tournament/format.ts`
- Test: `src/features/tournament/format.test.ts`

**Interfaces:**
- Consumes: 既存の `TournamentDetail` 型、`prisma`
- Produces:
  - `type PublicTournament = TournamentDetail & { organizationId: string; organizationName: string }`
  - `findPublicTournament(tournamentId: string): Promise<PublicTournament | null>`
  - `formatPublicTitle(tournamentName: string, organizationName: string, section?: string): string`

- [ ] **Step 1: `findPublicTournament` の失敗するテストを書く**

`src/features/tournament/repository.test.ts` の冒頭にある `vi.mock` は
`prisma.tournament.findFirst` をすでに用意しているので、そのまま使える。
import 行を次に差し替える（`findPublicTournament` を足す）。

```ts
const { listTournamentsInOrganization, findTournamentInOrganization, findPublicTournament } =
  await import("./repository");
```

ファイル末尾に次の describe を足す。

```ts
describe("findPublicTournament", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("DRAFT を where で除外する（公開範囲の回帰テスト）", async () => {
    // 取得してから status で弾く形にすると、4 ページのうち 1 枚で
    // 書き忘れた箇所がそのまま公開の穴になる。where に置けば
    // 書き忘れは「見つからない」に倒れる。
    findFirst.mockResolvedValue(null);

    await findPublicTournament("t1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1", status: { not: "DRAFT" } },
      }),
    );
  });

  it("見つからない場合は null を返す", async () => {
    findFirst.mockResolvedValue(null);

    await expect(findPublicTournament("t1")).resolves.toBeNull();
  });

  it("organization.name を organizationName へ平して返す", async () => {
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

    const tournament = await findPublicTournament("t1");

    expect(tournament).toMatchObject({
      id: "t1",
      organizationId: "o1",
      organizationName: "テニス部",
    });
    // ネストしたままにすると、画面側が Prisma の select の形を知ることになる。
    expect(tournament).not.toHaveProperty("organization");
  });

  it("select に description と organizationId を含める", async () => {
    findFirst.mockResolvedValue(null);

    await findPublicTournament("t1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          description: true,
          organizationId: true,
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/features/tournament/repository.test.ts`
Expected: FAIL。`findPublicTournament is not a function` になる。

- [ ] **Step 3: `findPublicTournament` を実装する**

`src/features/tournament/repository.ts` の末尾に足す。

```ts
export type PublicTournament = TournamentDetail & {
  organizationId: string;
  organizationName: string;
};

/**
 * 公開ページの唯一の入口。DRAFT を where で除外するのが要点で、
 * 取得してから status で弾く形にはしない。4 つある公開ページの
 * どれか 1 枚で確認を書き忘れても、この形なら「見つからない」に倒れる。
 * 組織スコープの findTournamentInOrganization とは別関数にしてあり、
 * 公開の判断がこの 1 箇所に閉じている。
 */
export const findPublicTournament = async (
  tournamentId: string,
): Promise<PublicTournament | null> => {
  const row = await prisma.tournament.findFirst({
    where: { id: tournamentId, status: { not: "DRAFT" } },
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
  return { ...rest, organizationName: organization.name };
};
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `pnpm test src/features/tournament/repository.test.ts`
Expected: PASS（既存の describe も含めて全件）

- [ ] **Step 5: コミット**

```bash
git add src/features/tournament/repository.ts src/features/tournament/repository.test.ts
git commit -m "$(cat <<'MSG'
feat(public-view): add the publication gate for tournaments

findPublicTournament puts `status: { not: "DRAFT" }` in the where clause
so a forgotten check on any public page falls back to "not found".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 6: `formatPublicTitle` の失敗するテストを書く**

`src/features/tournament/format.test.ts` の import 行に `formatPublicTitle` を足し、
ファイル末尾に次を足す。

```ts
describe("formatPublicTitle", () => {
  it("節を省くと「大会名 | 組織名」になる", () => {
    expect(formatPublicTitle("春季大会", "テニス部")).toBe("春季大会 | テニス部");
  });

  it("節を渡すと先頭に付く", () => {
    expect(formatPublicTitle("春季大会", "テニス部", "試合一覧")).toBe(
      "試合一覧 | 春季大会 | テニス部",
    );
  });
});
```

- [ ] **Step 7: テストを実行して失敗を確認する**

Run: `pnpm test src/features/tournament/format.test.ts`
Expected: FAIL。`formatPublicTitle is not a function` になる。

- [ ] **Step 8: `formatPublicTitle` を実装する**

`src/features/tournament/format.ts` の末尾に足す。

```ts
/**
 * 公開ページの <title>。SNS で URL が共有される前提なので、
 * どの大会のどの画面かがタイトルだけで分かる形にする。
 */
export const formatPublicTitle = (
  tournamentName: string,
  organizationName: string,
  section?: string,
): string =>
  section === undefined
    ? `${tournamentName} | ${organizationName}`
    : `${section} | ${tournamentName} | ${organizationName}`;
```

- [ ] **Step 9: テストを実行して通ることを確認する**

Run: `pnpm test src/features/tournament/format.test.ts`
Expected: PASS

- [ ] **Step 10: コミット**

```bash
git add src/features/tournament/format.ts src/features/tournament/format.test.ts
git commit -m "$(cat <<'MSG'
feat(public-view): add the title format for public pages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: `PublicHeader`

**Files:**
- Create: `src/components/public/PublicHeader.tsx`
- Test: `src/components/public/PublicHeader.test.tsx`

**Interfaces:**
- Consumes: なし（`next/link` のみ）
- Produces:
  - `type PublicCrumb = { label: string; href?: string }`
  - `PublicHeader({ crumbs }: { crumbs: PublicCrumb[] })`

`AppHeader` は流用しない。`userName` が必須で `LogoutButton`（クライアント
コンポーネント）を含むため、公開ページに持ち込むとログイン前提の部品が
公開側へ漏れる。`Crumb` 型も import せず自前で持ち、公開側を独立させる。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/public/PublicHeader.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicHeader } from "./PublicHeader";

describe("PublicHeader", () => {
  it("href のあるパンくずはリンクにする", () => {
    render(
      <PublicHeader
        crumbs={[
          { label: "テニス部" },
          { label: "春季大会", href: "/t/t1" },
          { label: "試合一覧" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/t/t1",
    );
  });

  it("href のないパンくずはリンクにしない", () => {
    render(<PublicHeader crumbs={[{ label: "試合一覧" }]} />);

    expect(screen.getByText("試合一覧")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("ログアウトやユーザー名を出さない（公開ページのため）", () => {
    render(<PublicHeader crumbs={[{ label: "春季大会" }]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/components/public/PublicHeader.test.tsx`
Expected: FAIL。`Failed to resolve import "./PublicHeader"` になる。

- [ ] **Step 3: 実装する**

`src/components/public/PublicHeader.tsx`

```tsx
import Link from "next/link";

export type PublicCrumb = {
  label: string;
  /** 省略した場合は現在地としてリンクにしない。 */
  href?: string;
};

/**
 * 公開ページのヘッダ。AppHeader を流用しないのは、あちらが userName を必須に持ち
 * LogoutButton（クライアントコンポーネント）を含むため。ログイン前提の部品を
 * 公開側へ持ち込まない。
 *
 * 狭い画面では折り返す。大会名が長いと 1 行に収まらず、はみ出すと
 * ページ全体が横スクロールしてしまう。
 */
export function PublicHeader({ crumbs }: { crumbs: PublicCrumb[] }) {
  return (
    <header className="border-b border-slate-200 bg-white px-4 py-3">
      <nav
        aria-label="パンくず"
        className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-1 text-sm"
      >
        {crumbs.map((crumb, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: crumbs はレンダーごとに固定で並び替えもしないためインデックスで安全
          <span key={index} className="flex items-center gap-2">
            {index > 0 && <span className="text-slate-400">/</span>}
            {crumb.href ? (
              <Link href={crumb.href} className="text-slate-600 underline">
                {crumb.label}
              </Link>
            ) : (
              <span className="font-bold text-slate-800">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `pnpm test src/components/public/PublicHeader.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 5: コミット**

```bash
git add src/components/public/PublicHeader.tsx src/components/public/PublicHeader.test.tsx
git commit -m "$(cat <<'MSG'
feat(public-view): add the header for public pages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 3: `PublicTournamentSummary`

**Files:**
- Create: `src/components/public/PublicTournamentSummary.tsx`
- Test: `src/components/public/PublicTournamentSummary.test.tsx`

**Interfaces:**
- Consumes: `PublicTournament`（Task 1）、既存の `formatStartsAt`、
  `TOURNAMENT_STATUS_LABELS`、`TournamentDescriptionMarkdown`
- Produces: `PublicTournamentSummary({ tournament }: { tournament: PublicTournament })`

作成日時は出さない（管理画面には出ているが、閲覧者には意味がない）。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/public/PublicTournamentSummary.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicTournament } from "@/features/tournament/repository";
import { PublicTournamentSummary } from "./PublicTournamentSummary";

const buildTournament = (
  overrides: Partial<PublicTournament> = {},
): PublicTournament => ({
  id: "t1",
  name: "春季大会",
  startsAt: new Date("2026-09-12T09:00:00+09:00"),
  status: "IN_PROGRESS",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
  ...overrides,
});

describe("PublicTournamentSummary", () => {
  it("大会名を見出しにする", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "春季大会" }),
    ).toBeInTheDocument();
  });

  it("主催組織名とステータスの日本語ラベルを出す", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    expect(screen.getByText("テニス部")).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("開始日時を整形して出す", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    // vitest.config.mts で TZ=Asia/Tokyo に固定してあるため、表示は JST。
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("開始日時が未設定なら「未設定」と出す", () => {
    render(
      <PublicTournamentSummary
        tournament={buildTournament({ startsAt: null })}
      />,
    );

    expect(screen.getByText("未設定")).toBeInTheDocument();
  });

  it("説明が空文字なら概要の節ごと出さない", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    expect(screen.queryByText("概要")).not.toBeInTheDocument();
  });

  it("説明があれば Markdown として描く", () => {
    render(
      <PublicTournamentSummary
        tournament={buildTournament({ description: "## 会場\n体育館" })}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "会場" }),
    ).toBeInTheDocument();
    expect(screen.getByText("体育館")).toBeInTheDocument();
  });

  it("作成日時は出さない", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    expect(screen.queryByText("作成日時")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/components/public/PublicTournamentSummary.test.tsx`
Expected: FAIL。`Failed to resolve import "./PublicTournamentSummary"` になる。

- [ ] **Step 3: 実装する**

`src/components/public/PublicTournamentSummary.tsx`

```tsx
import { TournamentDescriptionMarkdown } from "@/components/tournament/TournamentDescriptionMarkdown";
import { formatStartsAt } from "@/features/tournament/format";
import type { PublicTournament } from "@/features/tournament/repository";
import { TOURNAMENT_STATUS_LABELS } from "@/features/tournament/status";

/**
 * 公開ページの大会概要。管理画面の TournamentDetailView と違い編集リンクを持たず、
 * 作成日時も出さない（閲覧者には意味がないため）。
 *
 * 定義リストは狭い画面で横並びにすると値が潰れるので、sm 未満では縦に積む。
 */
export function PublicTournamentSummary({
  tournament,
}: {
  tournament: PublicTournament;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">{tournament.organizationName}</p>
        <h1 className="text-xl font-bold text-slate-800">{tournament.name}</h1>
      </div>

      <dl className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
          <dt className="text-slate-500 sm:w-24">ステータス</dt>
          <dd className="text-slate-800">
            {TOURNAMENT_STATUS_LABELS[tournament.status]}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
          <dt className="text-slate-500 sm:w-24">開始日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(tournament.startsAt)}
          </dd>
        </div>
      </dl>

      {tournament.description !== "" && (
        <section className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3">
          <h2 className="text-sm font-medium text-slate-500">概要</h2>
          <TournamentDescriptionMarkdown markdown={tournament.description} />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `pnpm test src/components/public/PublicTournamentSummary.test.tsx`
Expected: PASS（7 件）

補足: 説明があるケースでは `<h2>概要</h2>` と Markdown 由来の `<h2>会場</h2>` が
同時に存在するが、テストは `name` で絞っているので衝突しない。

- [ ] **Step 5: コミット**

```bash
git add src/components/public/PublicTournamentSummary.tsx src/components/public/PublicTournamentSummary.test.tsx
git commit -m "$(cat <<'MSG'
feat(public-view): add the tournament summary block

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 4: `PublicDivisionList`

**Files:**
- Create: `src/components/public/PublicDivisionList.tsx`
- Test: `src/components/public/PublicDivisionList.test.tsx`

**Interfaces:**
- Consumes: 既存の `DivisionSummary`（`@/features/division/repository`）、
  `DIVISION_FORMAT_LABELS`（`@/features/division/format`）
- Produces: `PublicDivisionList({ tournamentId, divisions }: { tournamentId: string; divisions: DivisionSummary[] })`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/public/PublicDivisionList.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionSummary } from "@/features/division/repository";
import { PublicDivisionList } from "./PublicDivisionList";

const divisions: DivisionSummary[] = [
  { id: "d1", name: "男子シングルス", order: 0, format: "SINGLE_ELIMINATION" },
  { id: "d2", name: "女子シングルス", order: 1, format: "ROUND_ROBIN" },
];

describe("PublicDivisionList", () => {
  it("部門名を公開ブラケットページへのリンクにする", () => {
    render(<PublicDivisionList tournamentId="t1" divisions={divisions} />);

    // 管理画面の /orgs/... ではなく公開側の /t/... を指すことが要点。
    expect(screen.getByRole("link", { name: /男子シングルス/ })).toHaveAttribute(
      "href",
      "/t/t1/divisions/d1",
    );
  });

  it("試合形式を日本語ラベルで出す", () => {
    render(<PublicDivisionList tournamentId="t1" divisions={divisions} />);

    expect(screen.getByText("シングルエリミネーション")).toBeInTheDocument();
    expect(screen.getByText("リーグ（総当たり）")).toBeInTheDocument();
  });

  it("渡された順序のまま並べる", () => {
    render(<PublicDivisionList tournamentId="t1" divisions={divisions} />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("男子シングルス");
    expect(links[1]).toHaveTextContent("女子シングルス");
  });

  it("部門が無ければその旨を出す", () => {
    render(<PublicDivisionList tournamentId="t1" divisions={[]} />);

    expect(screen.getByText("まだ部門がありません")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/components/public/PublicDivisionList.test.tsx`
Expected: FAIL。`Failed to resolve import "./PublicDivisionList"` になる。

- [ ] **Step 3: 実装する**

`src/components/public/PublicDivisionList.tsx`

```tsx
import Link from "next/link";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionSummary } from "@/features/division/repository";

/**
 * 公開ページの部門一覧。行全体をリンクにするのは、指で押す対象を
 * 部門名の文字幅ではなく行の高さぶん確保するため（py-3 と 2 行の文字で
 * 44px 相当になる）。
 */
export function PublicDivisionList({
  tournamentId,
  divisions,
}: {
  tournamentId: string;
  /** order 昇順で渡す。並べ替えはしない。 */
  divisions: DivisionSummary[];
}) {
  if (divisions.length === 0) {
    return <p className="text-sm text-slate-600">まだ部門がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {divisions.map((division) => (
        <li key={division.id}>
          <Link
            href={`/t/${tournamentId}/divisions/${division.id}`}
            className="block rounded border border-slate-200 bg-white px-4 py-3"
          >
            <span className="block font-medium text-slate-800 underline">
              {division.name}
            </span>
            <span className="block text-xs text-slate-500">
              {DIVISION_FORMAT_LABELS[division.format]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `pnpm test src/components/public/PublicDivisionList.test.tsx`
Expected: PASS（4 件）

- [ ] **Step 5: コミット**

```bash
git add src/components/public/PublicDivisionList.tsx src/components/public/PublicDivisionList.test.tsx
git commit -m "$(cat <<'MSG'
feat(public-view): add the division list for public pages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 5: `PublicParticipantList`

**Files:**
- Create: `src/components/public/PublicParticipantList.tsx`
- Test: `src/components/public/PublicParticipantList.test.tsx`

**Interfaces:**
- Consumes: 既存の `DivisionParticipant`（`@/features/division/repository`）
- Produces: `PublicParticipantList({ participants }: { participants: DivisionParticipant[] })`

`listParticipantsInTournament` は並び順を持たないため、並べ替えはこの
コンポーネントが行う。選手番号は文字列だが数値として比較する
（`"2"` が `"10"` より前に来るようにする）。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/public/PublicParticipantList.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionParticipant } from "@/features/division/repository";
import { PublicParticipantList } from "./PublicParticipantList";

const participants: DivisionParticipant[] = [
  { id: "p3", name: "高橋 葵", nameKana: "タカハシ アオイ", playerNumber: "10" },
  { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "2" },
  {
    id: "p2",
    name: "鈴木 陽菜",
    nameKana: "スズキ ハルナ",
    playerNumber: "1",
    team: "A チーム",
  },
];

describe("PublicParticipantList", () => {
  it("選手番号を数値として比較して並べる（10 が 2 より後ろ）", () => {
    render(<PublicParticipantList participants={participants} />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("鈴木 陽菜");
    expect(items[1]).toHaveTextContent("佐藤 蓮");
    expect(items[2]).toHaveTextContent("高橋 葵");
  });

  it("渡された配列を破壊しない", () => {
    const input = [...participants];
    render(<PublicParticipantList participants={input} />);

    expect(input[0].id).toBe("p3");
  });

  it("選手番号を出す", () => {
    render(<PublicParticipantList participants={participants} />);

    expect(screen.getByText("No.10")).toBeInTheDocument();
  });

  it("チームがあれば出し、無ければ出さない", () => {
    render(<PublicParticipantList participants={participants} />);

    expect(screen.getByText("A チーム")).toBeInTheDocument();
    // 2 番目は佐藤（team なし）。
    expect(screen.getAllByRole("listitem")[1]).not.toHaveTextContent("チーム");
  });

  it("参加者が居なければその旨を出す", () => {
    render(<PublicParticipantList participants={[]} />);

    expect(screen.getByText("まだ参加者がいません")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/components/public/PublicParticipantList.test.tsx`
Expected: FAIL。`Failed to resolve import "./PublicParticipantList"` になる。

- [ ] **Step 3: 実装する**

`src/components/public/PublicParticipantList.tsx`

```tsx
import type { DivisionParticipant } from "@/features/division/repository";

/**
 * 選手番号は文字列だが、閲覧者は数値として読む。numeric: true にしないと
 * "10" が "2" より前に来る。Collator はモジュール直下で 1 度だけ作る
 * （生成が重く、レンダーのたびに作る理由がない）。
 */
const PLAYER_NUMBER_COLLATOR = new Intl.Collator("ja", { numeric: true });

/**
 * 公開ページの参加者一覧。listParticipantsInTournament は並び順を持たないため、
 * 並べ替えはここで行う。props の配列は破壊しない（呼び出し側が同じ配列を
 * 他所でも使いうる）。
 */
export function PublicParticipantList({
  participants,
}: {
  participants: DivisionParticipant[];
}) {
  if (participants.length === 0) {
    return <p className="text-sm text-slate-600">まだ参加者がいません</p>;
  }

  const sorted = [...participants].sort((a, b) =>
    PLAYER_NUMBER_COLLATOR.compare(a.playerNumber, b.playerNumber),
  );

  return (
    <ul className="space-y-2">
      {sorted.map((participant) => (
        <li
          key={participant.id}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded border border-slate-200 bg-white px-4 py-3"
        >
          <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
            No.{participant.playerNumber}
          </span>
          <span className="font-medium text-slate-800">{participant.name}</span>
          {participant.team !== undefined && (
            <span className="text-xs text-slate-500">{participant.team}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `pnpm test src/components/public/PublicParticipantList.test.tsx`
Expected: PASS（5 件）

- [ ] **Step 5: コミット**

```bash
git add src/components/public/PublicParticipantList.tsx src/components/public/PublicParticipantList.test.tsx
git commit -m "$(cat <<'MSG'
feat(public-view): add the participant list for public pages

Sorts by player number as a number, so "2" comes before "10".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 6: `PublicScheduleList`

**Files:**
- Create: `src/components/public/PublicScheduleList.tsx`
- Test: `src/components/public/PublicScheduleList.test.tsx`

**Interfaces:**
- Consumes: 既存の `ScheduleRowView`（`@/features/schedule/types`）、
  `formatStartsAt`（`@/features/tournament/format`）
- Produces: `PublicScheduleList({ rows }: { rows: ScheduleRowView[] })`

既存の `ScheduleList` は流用しない。あちらは dnd と Server Action を前提にした
クライアントコンポーネントで、公開ページに要らないものを全部連れてくる。

区切りの開始予定時刻は `null` のとき何も出さない（`formatStartsAt` は `null` に
「未設定」を返すので、そのまま渡さないこと）。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/public/PublicScheduleList.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScheduleRowView } from "@/features/schedule/types";
import { PublicScheduleList } from "./PublicScheduleList";

const rows: ScheduleRowView[] = [
  {
    kind: "divider",
    key: "divider:s1",
    id: "s1",
    label: "午前の部",
    startsAt: new Date("2026-09-12T09:00:00+09:00"),
    startsAtInput: "2026-09-12T09:00",
  },
  {
    kind: "match",
    key: "match:d1:m1-0",
    divisionId: "d1",
    divisionName: "男子シングルス",
    matchId: "m1-0",
    matchNumber: "1",
    label: "1回戦 第1試合",
    card: "佐藤 蓮 vs 鈴木 陽菜",
  },
  {
    kind: "divider",
    key: "divider:s2",
    id: "s2",
    label: "午後の部",
    startsAt: null,
    startsAtInput: "",
  },
  {
    kind: "match",
    key: "match:d1:m2-0",
    divisionId: "d1",
    divisionName: "男子シングルス",
    matchId: "m2-0",
    matchNumber: "2",
    label: "2回戦 第1試合",
    card: "高橋 葵 vs 第1試合の勝者",
  },
];

describe("PublicScheduleList", () => {
  it("区切りの見出しを出す", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.getByText("午前の部")).toBeInTheDocument();
    expect(screen.getByText("午後の部")).toBeInTheDocument();
  });

  it("区切りの開始予定時刻を出す", () => {
    render(<PublicScheduleList rows={rows} />);

    // vitest.config.mts で TZ=Asia/Tokyo に固定してあるため JST で出る。
    expect(screen.getByText(/9:00/)).toBeInTheDocument();
  });

  it("開始予定時刻が未設定の区切りには「未設定」を出さない", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.queryByText("未設定")).not.toBeInTheDocument();
  });

  it("試合番号と対戦カードを出す", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.getByText("第1試合")).toBeInTheDocument();
    expect(screen.getByText("佐藤 蓮 vs 鈴木 陽菜")).toBeInTheDocument();
  });

  it("部門名とラウンドを出す", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.getByText("男子シングルス / 1回戦 第1試合")).toBeInTheDocument();
  });

  it("渡された順序のまま並べる", () => {
    render(<PublicScheduleList rows={rows} />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("午前の部");
    expect(items[1]).toHaveTextContent("佐藤 蓮 vs 鈴木 陽菜");
    expect(items[2]).toHaveTextContent("午後の部");
    expect(items[3]).toHaveTextContent("高橋 葵 vs 第1試合の勝者");
  });

  it("並べ替えや編集の操作を出さない（公開ページのため）", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("試合が無ければその旨を出す", () => {
    render(<PublicScheduleList rows={[]} />);

    expect(screen.getByText("まだ試合がありません")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/components/public/PublicScheduleList.test.tsx`
Expected: FAIL。`Failed to resolve import "./PublicScheduleList"` になる。

- [ ] **Step 3: 実装する**

`src/components/public/PublicScheduleList.tsx`

```tsx
import type { ScheduleRowView } from "@/features/schedule/types";
import { formatStartsAt } from "@/features/tournament/format";

/**
 * 公開ページの試合一覧。既存の ScheduleList は dnd と Server Action を前提にした
 * クライアントコンポーネントなので流用せず、読むだけの Server Component として
 * 書き直す。行の並びは渡された順（loadScheduleView が進行順に整えたもの）。
 *
 * 対戦カードは truncate せず折り返す。狭い画面で切ると「山田 vs …」となり、
 * 一覧としての用を成さなくなる。
 */
export function PublicScheduleList({ rows }: { rows: ScheduleRowView[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">まだ試合がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) =>
        row.kind === "divider" ? (
          <li
            key={row.key}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-slate-300 pt-3 pb-1"
          >
            <span className="font-bold text-slate-700">{row.label}</span>
            {/*
              formatStartsAt は null に「未設定」を返す。区切りの時刻は
              任意項目なので、未設定のときは何も出さない方が読みやすい。
            */}
            {row.startsAt !== null && (
              <span className="text-xs text-slate-500">
                {formatStartsAt(row.startsAt)}
              </span>
            )}
          </li>
        ) : (
          <li
            key={row.key}
            className="rounded border border-slate-200 bg-white px-4 py-3"
          >
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-800">
              <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
                第{row.matchNumber}試合
              </span>
              <span className="font-medium">{row.card}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {row.divisionName} / {row.label}
            </p>
          </li>
        ),
      )}
    </ul>
  );
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `pnpm test src/components/public/PublicScheduleList.test.tsx`
Expected: PASS（8 件）

- [ ] **Step 5: コミット**

```bash
git add src/components/public/PublicScheduleList.tsx src/components/public/PublicScheduleList.test.tsx
git commit -m "$(cat <<'MSG'
feat(public-view): add the read-only schedule list

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 7: 概要ページ `/t/[tournamentId]`

**Files:**
- Create: `src/app/t/[tournamentId]/page.tsx`
- Test: `src/app/t/[tournamentId]/page.test.tsx`

**Interfaces:**
- Consumes: `findPublicTournament` / `formatPublicTitle`（Task 1）、
  `PublicHeader`（Task 2）、`PublicTournamentSummary`（Task 3）、
  `PublicDivisionList`（Task 4）、既存の `listDivisionsInTournament`
- Produces: 公開ルート `/t/[tournamentId]`。以降のページはここへ戻るパンくずを持つ。

このタスクで初めて `/t` 配下のルートができるため、`PageProps<"/t/[tournamentId]">`
を型として使えるようにする `next typegen` の実行が要る。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/t/[tournamentId]/page.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findPublicTournament = vi.fn();
const listDivisionsInTournament = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string) =>
    findPublicTournament(tournamentId),
}));
vi.mock("@/features/division/repository", () => ({
  listDivisionsInTournament: (organizationId: string, tournamentId: string) =>
    listDivisionsInTournament(organizationId, tournamentId),
}));

const { default: Page, generateMetadata } = await import("./page");

const pageProps = (tournamentId: string) => ({
  params: Promise.resolve({ tournamentId }),
  searchParams: Promise.resolve({}),
});

// organizationId と tournamentId をわざと異なる値にする。揃えると取り違えを見逃す。
const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "IN_PROGRESS" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
};

describe("PublicTournamentPage", () => {
  beforeEach(() => {
    findPublicTournament.mockReset();
    listDivisionsInTournament.mockReset();
    notFound.mockClear();
    findPublicTournament.mockResolvedValue(tournament);
    listDivisionsInTournament.mockResolvedValue([
      {
        id: "d1",
        name: "男子シングルス",
        order: 0,
        format: "SINGLE_ELIMINATION",
      },
    ]);
  });

  it("公開ゲートに params の tournamentId をそのまま渡す", async () => {
    await Page(pageProps("t1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1");
  });

  it("部門一覧はゲートが返した organizationId で絞り込む", async () => {
    await Page(pageProps("t1"));

    expect(listDivisionsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("公開対象でなければ notFound を呼び、部門一覧も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(listDivisionsInTournament).not.toHaveBeenCalled();
  });

  it("大会名と主催組織名を描画する", async () => {
    render(await Page(pageProps("t1")));

    expect(
      screen.getByRole("heading", { level: 1, name: "春季大会" }),
    ).toBeInTheDocument();
    // ヘッダのパンくずと概要の両方に出るため getAllByText で数えない。
    expect(screen.getAllByText("テニス部").length).toBeGreaterThan(0);
  });

  it("試合一覧と参加者一覧への導線を出す", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByRole("link", { name: "試合一覧" })).toHaveAttribute(
      "href",
      "/t/t1/schedule",
    );
    expect(screen.getByRole("link", { name: "参加者一覧" })).toHaveAttribute(
      "href",
      "/t/t1/participants",
    );
  });

  it("部門を公開ブラケットページへのリンクとして出す", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByRole("link", { name: /男子シングルス/ })).toHaveAttribute(
      "href",
      "/t/t1/divisions/d1",
    );
  });

  it("ログアウトなど操作の要素を出さない", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("title は「大会名 | 組織名」にする", async () => {
    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({
      title: "春季大会 | テニス部",
    });
  });

  it("公開対象でなければ title を付けない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({});
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test "app/t/.+/page.test.tsx"`
Expected: FAIL。`Failed to resolve import "./page"` になる。

- [ ] **Step 3: 実装する**

`src/app/t/[tournamentId]/page.tsx`

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicDivisionList } from "@/components/public/PublicDivisionList";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicTournamentSummary } from "@/components/public/PublicTournamentSummary";
import { listDivisionsInTournament } from "@/features/division/repository";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]">): Promise<Metadata> {
  const { tournamentId } = await params;
  const tournament = await findPublicTournament(tournamentId);
  // 公開対象でない大会の名前をタイトルに出さない。本体は notFound になる。
  if (tournament === null) {
    return {};
  }
  return {
    title: formatPublicTitle(tournament.name, tournament.organizationName),
  };
}

export default async function PublicTournamentPage({
  params,
}: PageProps<"/t/[tournamentId]">) {
  const { tournamentId } = await params;

  // 公開ゲート。DRAFT の除外はこの関数の where が持つ。
  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    notFound();
  }

  // ゲートが返した organizationId を渡すことで、既存リポジトリの
  // 所有権チェックをそのまま使える。
  const divisions = await listDivisionsInTournament(
    tournament.organizationId,
    tournament.id,
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicHeader
        crumbs={[
          { label: tournament.organizationName },
          { label: tournament.name },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <PublicTournamentSummary tournament={tournament} />

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/t/${tournament.id}/schedule`}
            className="rounded border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800"
          >
            試合一覧
          </Link>
          <Link
            href={`/t/${tournament.id}/participants`}
            className="rounded border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800"
          >
            参加者一覧
          </Link>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-700">部門</h2>
          <PublicDivisionList
            tournamentId={tournament.id}
            divisions={divisions}
          />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: ルートの型を生成する**

Run: `pnpm exec next typegen`
Expected: エラーなく終わる。`PageProps<"/t/[tournamentId]">` が使えるようになる。

- [ ] **Step 5: テストと型検査を実行して通ることを確認する**

Run: `pnpm test "app/t/.+/page.test.tsx"`
Expected: PASS（9 件）

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add "src/app/t/[tournamentId]/page.tsx" "src/app/t/[tournamentId]/page.test.tsx"
git commit -m "$(cat <<'MSG'
feat(public-view): add the public tournament summary page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 8: 試合一覧ページ `/t/[tournamentId]/schedule`

**Files:**
- Create: `src/app/t/[tournamentId]/schedule/page.tsx`
- Test: `src/app/t/[tournamentId]/schedule/page.test.tsx`

**Interfaces:**
- Consumes: `findPublicTournament` / `formatPublicTitle`（Task 1）、
  `PublicHeader`（Task 2）、`PublicScheduleList`（Task 6）、
  既存の `loadScheduleView`（`@/features/schedule/repository`）
- Produces: 公開ルート `/t/[tournamentId]/schedule`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/t/[tournamentId]/schedule/page.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findPublicTournament = vi.fn();
const loadScheduleView = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string) =>
    findPublicTournament(tournamentId),
}));
vi.mock("@/features/schedule/repository", () => ({
  loadScheduleView: (organizationId: string, tournamentId: string) =>
    loadScheduleView(organizationId, tournamentId),
}));

const { default: Page, generateMetadata } = await import("./page");

const pageProps = (tournamentId: string) => ({
  params: Promise.resolve({ tournamentId }),
  searchParams: Promise.resolve({}),
});

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "IN_PROGRESS" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
};

describe("PublicSchedulePage", () => {
  beforeEach(() => {
    findPublicTournament.mockReset();
    loadScheduleView.mockReset();
    notFound.mockClear();
    findPublicTournament.mockResolvedValue(tournament);
    loadScheduleView.mockResolvedValue([
      {
        kind: "match",
        key: "match:d1:m1-0",
        divisionId: "d1",
        divisionName: "男子シングルス",
        matchId: "m1-0",
        matchNumber: "1",
        label: "1回戦 第1試合",
        card: "佐藤 蓮 vs 鈴木 陽菜",
      },
    ]);
  });

  it("公開ゲートに params の tournamentId をそのまま渡す", async () => {
    await Page(pageProps("t1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1");
  });

  it("試合一覧はゲートが返した organizationId で絞り込む", async () => {
    await Page(pageProps("t1"));

    expect(loadScheduleView).toHaveBeenCalledWith("o1", "t1");
  });

  it("公開対象でなければ notFound を呼び、試合一覧も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(loadScheduleView).not.toHaveBeenCalled();
  });

  it("試合を描画する", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByText("佐藤 蓮 vs 鈴木 陽菜")).toBeInTheDocument();
  });

  it("大会ページへ戻るパンくずを出す", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/t/t1",
    );
  });

  it("並べ替えや区切りの編集を出さない", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("title は「試合一覧 | 大会名 | 組織名」にする", async () => {
    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({
      title: "試合一覧 | 春季大会 | テニス部",
    });
  });

  it("公開対象でなければ title を付けない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({});
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test "app/t/.+/schedule/page.test.tsx"`
Expected: FAIL。`Failed to resolve import "./page"` になる。

- [ ] **Step 3: 実装する**

`src/app/t/[tournamentId]/schedule/page.tsx`

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicScheduleList } from "@/components/public/PublicScheduleList";
import { loadScheduleView } from "@/features/schedule/repository";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]/schedule">): Promise<Metadata> {
  const { tournamentId } = await params;
  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    return {};
  }
  return {
    title: formatPublicTitle(
      tournament.name,
      tournament.organizationName,
      "試合一覧",
    ),
  };
}

export default async function PublicSchedulePage({
  params,
}: PageProps<"/t/[tournamentId]/schedule">) {
  const { tournamentId } = await params;

  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    notFound();
  }

  const rows = await loadScheduleView(tournament.organizationId, tournament.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicHeader
        crumbs={[
          { label: tournament.organizationName },
          { label: tournament.name, href: `/t/${tournament.id}` },
          { label: "試合一覧" },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-lg font-bold text-slate-800">試合一覧</h1>
          <p className="text-xs text-slate-500">
            全部門の試合を進行順に並べています。
          </p>
        </div>

        <PublicScheduleList rows={rows} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: ルートの型を生成する**

Run: `pnpm exec next typegen`
Expected: エラーなく終わる。

- [ ] **Step 5: テストと型検査を実行して通ることを確認する**

Run: `pnpm test "app/t/.+/schedule/page.test.tsx"`
Expected: PASS（8 件）

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add "src/app/t/[tournamentId]/schedule/page.tsx" "src/app/t/[tournamentId]/schedule/page.test.tsx"
git commit -m "$(cat <<'MSG'
feat(public-view): add the public schedule page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 9: 参加者ページ `/t/[tournamentId]/participants`

**Files:**
- Create: `src/app/t/[tournamentId]/participants/page.tsx`
- Test: `src/app/t/[tournamentId]/participants/page.test.tsx`

**Interfaces:**
- Consumes: `findPublicTournament` / `formatPublicTitle`（Task 1）、
  `PublicHeader`（Task 2）、`PublicParticipantList`（Task 5）、
  既存の `listParticipantsInTournament`（`@/features/division/repository`）
- Produces: 公開ルート `/t/[tournamentId]/participants`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/t/[tournamentId]/participants/page.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findPublicTournament = vi.fn();
const listParticipantsInTournament = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string) =>
    findPublicTournament(tournamentId),
}));
vi.mock("@/features/division/repository", () => ({
  listParticipantsInTournament: (
    organizationId: string,
    tournamentId: string,
  ) => listParticipantsInTournament(organizationId, tournamentId),
}));

const { default: Page, generateMetadata } = await import("./page");

const pageProps = (tournamentId: string) => ({
  params: Promise.resolve({ tournamentId }),
  searchParams: Promise.resolve({}),
});

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "IN_PROGRESS" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
};

describe("PublicParticipantsPage", () => {
  beforeEach(() => {
    findPublicTournament.mockReset();
    listParticipantsInTournament.mockReset();
    notFound.mockClear();
    findPublicTournament.mockResolvedValue(tournament);
    listParticipantsInTournament.mockResolvedValue([
      { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
    ]);
  });

  it("公開ゲートに params の tournamentId をそのまま渡す", async () => {
    await Page(pageProps("t1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1");
  });

  it("参加者はゲートが返した organizationId で絞り込む", async () => {
    await Page(pageProps("t1"));

    expect(listParticipantsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("公開対象でなければ notFound を呼び、参加者も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(listParticipantsInTournament).not.toHaveBeenCalled();
  });

  it("参加者を描画する", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByText("佐藤 蓮")).toBeInTheDocument();
    expect(screen.getByText("No.1")).toBeInTheDocument();
  });

  it("大会ページへ戻るパンくずを出す", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/t/t1",
    );
  });

  it("title は「参加者一覧 | 大会名 | 組織名」にする", async () => {
    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({
      title: "参加者一覧 | 春季大会 | テニス部",
    });
  });

  it("公開対象でなければ title を付けない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({});
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test "app/t/.+/participants/page.test.tsx"`
Expected: FAIL。`Failed to resolve import "./page"` になる。

- [ ] **Step 3: 実装する**

`src/app/t/[tournamentId]/participants/page.tsx`

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicParticipantList } from "@/components/public/PublicParticipantList";
import { listParticipantsInTournament } from "@/features/division/repository";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]/participants">): Promise<Metadata> {
  const { tournamentId } = await params;
  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    return {};
  }
  return {
    title: formatPublicTitle(
      tournament.name,
      tournament.organizationName,
      "参加者一覧",
    ),
  };
}

export default async function PublicParticipantsPage({
  params,
}: PageProps<"/t/[tournamentId]/participants">) {
  const { tournamentId } = await params;

  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    notFound();
  }

  const participants = await listParticipantsInTournament(
    tournament.organizationId,
    tournament.id,
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicHeader
        crumbs={[
          { label: tournament.organizationName },
          { label: tournament.name, href: `/t/${tournament.id}` },
          { label: "参加者一覧" },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <h1 className="text-lg font-bold text-slate-800">参加者一覧</h1>

        <PublicParticipantList participants={participants} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: ルートの型を生成する**

Run: `pnpm exec next typegen`
Expected: エラーなく終わる。

- [ ] **Step 5: テストと型検査を実行して通ることを確認する**

Run: `pnpm test "app/t/.+/participants/page.test.tsx"`
Expected: PASS（7 件）

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add "src/app/t/[tournamentId]/participants/page.tsx" "src/app/t/[tournamentId]/participants/page.test.tsx"
git commit -m "$(cat <<'MSG'
feat(public-view): add the public participant page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 10: `DivisionBracket` の高さ prop とブラケットページ

**Files:**
- Modify: `src/components/division/DivisionBracket.tsx`
- Test: `src/components/division/DivisionBracket.test.tsx`
- Create: `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`
- Test: `src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`

**Interfaces:**
- Consumes: `findPublicTournament` / `formatPublicTitle`（Task 1）、
  `PublicHeader`（Task 2）、既存の `findDivisionInTournament` /
  `listParticipantsInTournament`、既存の `DivisionBracket`
- Produces:
  - `DivisionBracket({ division, participants, heightClassName }: { division: DivisionDetail; participants: DivisionParticipant[]; heightClassName?: string })`
    — `heightClassName` の既定は `"h-[28rem]"` で、管理画面は無変更のまま通る
  - 公開ルート `/t/[tournamentId]/divisions/[divisionId]`

- [ ] **Step 1: `heightClassName` の失敗するテストを書く**

`src/components/division/DivisionBracket.test.tsx` の
`describe("DivisionBracket", ...)` の中（末尾）に次の 2 件を足す。
`buildDivision` と `participants` はファイル内の既存の定義をそのまま使う。

```tsx
  it("既定の高さは h-[28rem]（管理画面の見た目を変えない）", () => {
    const { container } = render(
      <DivisionBracket division={buildDivision()} participants={participants} />,
    );

    expect(container.querySelector(".h-\\[28rem\\]")).not.toBeNull();
  });

  it("heightClassName を渡すとその高さを使う", () => {
    const { container } = render(
      <DivisionBracket
        division={buildDivision()}
        participants={participants}
        heightClassName="h-[20rem]"
      />,
    );

    expect(container.querySelector(".h-\\[20rem\\]")).not.toBeNull();
    expect(container.querySelector(".h-\\[28rem\\]")).toBeNull();
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/components/division/DivisionBracket.test.tsx`
Expected: FAIL。「heightClassName を渡すとその高さを使う」が
`expected null not to be null` で落ちる（既定の高さのテストは今の実装でも通る）。

- [ ] **Step 3: `DivisionBracket` に prop を足す**

`src/components/division/DivisionBracket.tsx` の関数シグネチャを次に変える。

```tsx
export function DivisionBracket({
  division,
  participants,
  heightClassName = "h-[28rem]",
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  /**
   * 描画枠の高さ。既定は管理画面の詳細ページ向け。公開のブラケットページは
   * ブラケット専用の画面なので、dvh 基準の高さを渡して画面を占有させる。
   * Tailwind v4 はソース中の文字列からクラスを生成するため、
   * 呼び出し側は必ず文字列リテラルで渡すこと。
   */
  heightClassName?: string;
}) {
```

最後の return を次に変える。それ以外は触らない。

```tsx
  return (
    <div
      className={`${heightClassName} rounded border border-slate-200 bg-white`}
    >
      <TournamentFlow nodes={elements.nodes} edges={elements.edges} />
    </div>
  );
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `pnpm test src/components/division/DivisionBracket.test.tsx`
Expected: PASS（既存の分岐のテストも含めて全件）

Run: `pnpm test "app/orgs/.+/divisions/.+/page.test.tsx"`
Expected: PASS。管理画面側は無変更で通る。

- [ ] **Step 5: コミット**

```bash
git add src/components/division/DivisionBracket.tsx src/components/division/DivisionBracket.test.tsx
git commit -m "$(cat <<'MSG'
feat(division): let the caller set the bracket frame height

The default keeps the admin page pixel-identical; the public bracket page
needs a dvh-based height to fill a phone screen.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 6: ブラケットページの失敗するテストを書く**

`src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// @xyflow/react は jsdom で実寸を測れないため、描画そのものは差し替える。
vi.mock("@/components/tournament/TournamentFlow", () => ({
  TournamentFlow: ({ nodes }: { nodes: unknown[] }) => (
    <div data-testid="flow">{nodes.length}</div>
  ),
}));

const findPublicTournament = vi.fn();
const findDivisionInTournament = vi.fn();
const listParticipantsInTournament = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string) =>
    findPublicTournament(tournamentId),
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

const { default: Page, generateMetadata } = await import("./page");

const pageProps = (tournamentId: string, divisionId: string) => ({
  params: Promise.resolve({ tournamentId, divisionId }),
  searchParams: Promise.resolve({}),
});

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "IN_PROGRESS" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
};

const division = {
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION" as const,
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
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

describe("PublicDivisionPage", () => {
  beforeEach(() => {
    findPublicTournament.mockReset();
    findDivisionInTournament.mockReset();
    listParticipantsInTournament.mockReset();
    notFound.mockClear();
    findPublicTournament.mockResolvedValue(tournament);
    findDivisionInTournament.mockResolvedValue(division);
    listParticipantsInTournament.mockResolvedValue([
      { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
      {
        id: "p2",
        name: "鈴木 陽菜",
        nameKana: "スズキ ハルナ",
        playerNumber: "2",
      },
    ]);
  });

  it("部門はゲートが返した organizationId で絞り込む", async () => {
    await Page(pageProps("t1", "d1"));

    expect(findDivisionInTournament).toHaveBeenCalledWith("o1", "t1", "d1");
  });

  it("公開対象でなければ notFound を呼び、部門も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1", "d1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(findDivisionInTournament).not.toHaveBeenCalled();
  });

  it("部門が見つからなければ notFound を呼ぶ", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1", "d1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("ブラケットを描画する", async () => {
    render(await Page(pageProps("t1", "d1")));

    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });

  it("部門名を見出しにする", async () => {
    render(await Page(pageProps("t1", "d1")));

    expect(
      screen.getByRole("heading", { level: 1, name: "男子シングルス" }),
    ).toBeInTheDocument();
  });

  it("大会ページへ戻るパンくずを出す", async () => {
    render(await Page(pageProps("t1", "d1")));

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/t/t1",
    );
  });

  it("SINGLE_ELIMINATION 以外では参加者を引かない", async () => {
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "ROUND_ROBIN" as const,
    });

    await Page(pageProps("t1", "d1"));

    expect(listParticipantsInTournament).not.toHaveBeenCalled();
  });

  it("title は「部門名 | 大会名 | 組織名」にする", async () => {
    await expect(generateMetadata(pageProps("t1", "d1"))).resolves.toEqual({
      title: "男子シングルス | 春季大会 | テニス部",
    });
  });

  it("部門が見つからなければ title を付けない", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(generateMetadata(pageProps("t1", "d1"))).resolves.toEqual({});
  });
});
```

- [ ] **Step 7: テストを実行して失敗を確認する**

Run: `pnpm test "app/t/.+/divisions/.+/page.test.tsx"`
Expected: FAIL。`Failed to resolve import "./page"` になる。

- [ ] **Step 8: 実装する**

`src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DivisionBracket } from "@/components/division/DivisionBracket";
import { PublicHeader } from "@/components/public/PublicHeader";
import {
  findDivisionInTournament,
  listParticipantsInTournament,
} from "@/features/division/repository";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]/divisions/[divisionId]">): Promise<Metadata> {
  const { tournamentId, divisionId } = await params;
  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    return {};
  }
  const division = await findDivisionInTournament(
    tournament.organizationId,
    tournament.id,
    divisionId,
  );
  if (division === null) {
    return {};
  }
  return {
    title: formatPublicTitle(
      tournament.name,
      tournament.organizationName,
      division.name,
    ),
  };
}

export default async function PublicDivisionPage({
  params,
}: PageProps<"/t/[tournamentId]/divisions/[divisionId]">) {
  const { tournamentId, divisionId } = await params;

  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    notFound();
  }

  const division = await findDivisionInTournament(
    tournament.organizationId,
    tournament.id,
    divisionId,
  );
  if (division === null) {
    notFound();
  }

  // DivisionBracket は SINGLE_ELIMINATION 以外では participants を一切使わず
  // 未対応の案内を出すだけ。管理画面と同じく、使う形式のときだけ引く。
  const participants =
    division.format === "SINGLE_ELIMINATION"
      ? await listParticipantsInTournament(
          tournament.organizationId,
          tournament.id,
        )
      : [];

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicHeader
        crumbs={[
          { label: tournament.organizationName },
          { label: tournament.name, href: `/t/${tournament.id}` },
          { label: division.name },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <h1 className="text-lg font-bold text-slate-800">{division.name}</h1>

        {/*
          ブラケット専用の画面なので、枠に画面の大半を使う。dvh にするのは
          モバイルブラウザのアドレスバーの出入りで vh がずれるため。
          任意値クラスは Tailwind が走査できるよう文字列リテラルで渡す。
        */}
        <DivisionBracket
          division={division}
          participants={participants}
          heightClassName="h-[calc(100dvh-11rem)]"
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 9: ルートの型を生成する**

Run: `pnpm exec next typegen`
Expected: エラーなく終わる。

- [ ] **Step 10: テストと型検査を実行して通ることを確認する**

Run: `pnpm test "app/t/.+/divisions/.+/page.test.tsx"`
Expected: PASS（9 件）

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 11: コミット**

```bash
git add "src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx" "src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx"
git commit -m "$(cat <<'MSG'
feat(public-view): add the public bracket page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 11: 管理画面から公開ページへの導線と全体検証

**Files:**
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`
- Test: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx`

**Interfaces:**
- Consumes: Task 7 で作った `/t/[tournamentId]`
- Produces: なし（画面上の導線のみ）

運営者が公開 URL を取り出す唯一の経路になる。準備中（DRAFT）の大会でも
リンクは出す。押した先が 404 になることでゲートの挙動が運営者に伝わる方が、
リンクが黙って消えるより分かりやすい。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx` の
`describe("TournamentPage", ...)` の中に次を足す。

```tsx
  it("公開ページへのリンクを出す", async () => {
    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(
      screen.getByRole("link", { name: "公開ページを開く" }),
    ).toHaveAttribute("href", "/t/t1");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test "app/orgs/.+/tournaments/[^/]+/page.test.tsx"`
Expected: FAIL。`Unable to find an accessible element with the role "link" and name "公開ページを開く"` になる。

- [ ] **Step 3: リンクを足す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` の「試合一覧」リンクの
直後に足す。既存の `Link` の import はそのまま使える。

```tsx
        <Link
          href={`/t/${tournament.id}`}
          className="ml-2 inline-block rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
        >
          公開ページを開く
        </Link>
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `pnpm test "app/orgs/.+/tournaments/[^/]+/page.test.tsx"`
Expected: PASS（既存の分も含めて全件）

- [ ] **Step 5: 全体の検証**

Run: `pnpm test`
Expected: 全件 PASS

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm lint`
Expected: 今回触ったファイルに指摘なし。CRLF のみの指摘はリポジトリ全体の
既知のノイズなので無視してよい。

- [ ] **Step 6: 実際のアプリで確認する**

```bash
pnpm dev
```

`BYPASS_AUTH=1` を設定している場合は Cookie に `USER_ID=1` を入れて管理画面に入り、
大会の詳細ページから「公開ページを開く」を押す。確認する点は次の 4 つ。

1. 公開ページがログインしていないブラウザ（プライベートウィンドウ）でも開くこと
2. 準備中（DRAFT）の大会の `/t/<id>` が 404 になること
3. 幅 375px（iPhone SE 相当）で横スクロールが出ないこと
4. ブラケットページでトーナメント表が画面の大半を使って表示されること

- [ ] **Step 7: コミット**

```bash
git add "src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"
git commit -m "$(cat <<'MSG'
feat(tournament): link from the admin page to the public page

This is the only way an organizer gets the public URL.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```
