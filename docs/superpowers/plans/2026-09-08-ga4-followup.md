# GA4 最終レビュー対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GA4 導入ブランチ `feat/ga4` の最終レビューで積み残した 3 件（URL のプライバシー、`record_result` の空発火、イベント名の流儀不一致）を解消する。

**Architecture:** イベント名を動詞先頭へ統一し、結果登録は「実際に書き込んだとき」だけ発火させ、GA へ送る `page_location` から秘密が載りうるクエリ文字列と不透明な ID を落とす。3 件目のために gtag の初期化を `@next/third-parties` の `GoogleAnalytics` から自前の `next/script` へ移す。これは同コンポーネントが `gtag('config', ...)` に追加パラメータを渡す口を持たず、初回 `page_view` を差し替えられないためである。

**Tech Stack:** Next.js 16.3.3 (App Router) / React 19 / TypeScript / vitest + @testing-library/react / Biome / pnpm

## Global Constraints

- パッケージ管理は **pnpm**。`npm` / `yarn` は使わない。
- 測定 ID の環境変数は `NEXT_PUBLIC_GA_ID`。未設定・空文字なら GA 関連の出力は一切なし。`process.env.NEXT_PUBLIC_GA_ID` は必ず直書き（動的アクセスはビルド時置換が効かず本番で `undefined` になる）。
- `src/shared/**` は `@/features/**`・`@/components/**` を import できない。`src/features/**` は `@/components/**`・`@/app/**` を import できない（Biome `noRestrictedImports`）。
- `sign_up` と `login` は GA4 の推奨イベント名。**この 2 つは絶対に改名しない**（Google の既定レポートに流れるため）。
- コメントは日本語で、*なぜ* を書く。
- 各タスクの最後に `pnpm test`・`pnpm typecheck` が通ること。`pnpm lint` は Windows チェックアウト由来の CRLF ノイズで全体としては落ちるので、変更したファイルに内容起因のエラーが無いことで判断する（`pnpm exec biome check <file>`）。
- コミットメッセージ末尾に必ず入れる:

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: イベント名を動詞先頭に統一する

`sign_up` / `login` / `record_result` は動詞先頭、`organization_create` などは名詞先頭で、GA4 のイベント一覧で 2 つの流儀が混ざる。データを貯め始める前の今なら改名は無料。

**Files:**
- Modify: `src/shared/lib/analytics/events.ts`
- Modify: `src/shared/lib/analytics/created.ts`
- Modify: `src/components/analytics/TrackCreated.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `AnalyticsEvent` の 6 値が `"sign_up" | "login" | "create_organization" | "create_tournament" | "create_division" | "record_result"` になる。

- [ ] **Step 1: テストの期待値を先に変える（失敗させる）**

`src/components/analytics/TrackCreated.test.tsx` の 3 つの期待値を書き換える。

- `expect(trackEvent).toHaveBeenCalledWith("organization_create")` → `"create_organization"`
- `expect(trackEvent).toHaveBeenCalledWith("tournament_create")` → `"create_tournament"`
- `expect(trackEvent).toHaveBeenCalledWith("division_create")` → `"create_division"`

**`created` に渡している値（`"organization"` / `"tournament"` / `"division"`）は変えない。** これは URL のクエリ値であり、イベント名とは別物。

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm vitest run src/components/analytics/TrackCreated.test.tsx`
Expected: FAIL。3 件が `"organization_create"` などで呼ばれていて期待値と食い違う。

- [ ] **Step 3: イベント名を変える**

`src/shared/lib/analytics/events.ts` の union を書き換える。

```ts
export type AnalyticsEvent =
  | "sign_up"
  | "login"
  | "create_organization"
  | "create_tournament"
  | "create_division"
  | "record_result";
```

`sign_up` と `login` は GA4 推奨イベント名なので動詞先頭のまま。残る 4 つもそれに合わせる。

`src/shared/lib/analytics/created.ts` のマップの**値**だけを書き換える。キー（クエリ値）はそのまま。

```ts
export const CREATED_EVENTS = {
  organization: "create_organization",
  tournament: "create_tournament",
  division: "create_division",
} as const satisfies Record<string, AnalyticsEvent>;
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm vitest run src/components/analytics/TrackCreated.test.tsx`
Expected: PASS

- [ ] **Step 5: 旧名が残っていないことを確かめる**

Run: `pnpm exec biome check src/shared/lib/analytics/events.ts src/shared/lib/analytics/created.ts src/components/analytics/TrackCreated.test.tsx`
Expected: 内容起因のエラーなし

リポジトリ全体を検索し、`organization_create` / `tournament_create` / `division_create` が 1 件も残っていないことを確認する（ドキュメントは Task 4 でまとめて直すので、`docs/` 配下のヒットは残っていてよい）。

- [ ] **Step 6: 全テスト・typecheck を通してコミット**

Run: `pnpm test` → 全件 PASS
Run: `pnpm typecheck` → エラー 0 件

```bash
git add src/shared/lib/analytics/events.ts src/shared/lib/analytics/created.ts src/components/analytics/TrackCreated.test.tsx
git commit -m "$(cat <<'EOF'
refactor(analytics): name create events verb-first for consistency

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 何も書き込まなかったときは record_result を送らない

`recordResultInDb` は「勝者が変わらない」場合、何も書かずに `{ found: true, value: null }` を返す（`repository.ts` の `unchanged` 分岐）。書き込んだ場合の戻り値と区別が付かないため、ハンドラーは無条件に `succeeded` を増やし、イベントが飛ぶ。

同じ勝者のボタンをもう一度押す操作は `MatchResultRow` が確認ダイアログを意図的に省いている正規の操作なので、大会当日に普通に起きる。

**Files:**
- Modify: `src/features/division/record-result/repository.ts`
- Modify: `src/features/division/record-result/repository.test.ts`
- Modify: `src/features/division/record-result/usecase.ts`
- Modify: `src/features/division/record-result/handler.ts`
- Modify: `src/features/division/record-result/handler.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `RecordResultPort` の戻り値が `DivisionSetupOutcome<{ recorded: boolean }>` になる。`recorded` は実際に DB を更新したときだけ `true`。

- [ ] **Step 1: ハンドラーの失敗するテストを書く**

`src/features/division/record-result/handler.test.ts` を編集する。

まず、既存の `beforeEach` にある

```ts
  recordResultInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
```

を、書き込みが起きた場合の形に変える。

```ts
  recordResultInDb.mockReturnValue(
    Effect.succeed({ found: true, value: { recorded: true } }),
  );
```

次に、describe の末尾へ「書き込みが無ければ増えない」テストを足す。

```ts
  it("勝者が変わらず何も書かなかったときは succeeded を増やさない", async () => {
    // repository は「変更なし」を recorded: false で返す。増やしてしまうと
    // 同じ勝者の再タップだけで record_result が飛び、記録していない操作が
    // 記録として計上される。
    recordResultInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { recorded: false } }),
    );

    const state = await recordResultAction(
      { error: null, succeeded: 3 },
      formData(validInput),
    );

    expect(state).toEqual({ error: null, succeeded: 3 });
  });
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm vitest run src/features/division/record-result/handler.test.ts`
Expected: FAIL。新しいテストで `succeeded` が 4 になる。

- [ ] **Step 3: repository が「書いたかどうか」を返すようにする**

`src/features/division/record-result/repository.ts` を編集する。

型を変える。

```ts
export type RecordResultPort = (
  ids: DivisionIds,
  input: RecordResultInput,
) => Effect.Effect<DivisionSetupOutcome<{ recorded: boolean }>, DivisionError>;
```

`unchanged` の分岐の戻り値を変える。

```ts
        if (unchanged) {
          return { found: true, value: { recorded: false } };
        }
```

書き込みが成功した末尾の戻り値を変える。

```ts
        return { found: true, value: { recorded: true } };
```

`prisma.$transaction` のコールバックの戻り値型注釈が `DivisionSetupOutcome<null>` を明示している場合は `DivisionSetupOutcome<{ recorded: boolean }>` に直す。

- [ ] **Step 4: usecase の型を合わせる**

`src/features/division/record-result/usecase.ts` の戻り値型を変える。

```ts
export const recordResultForDivision = (
  port: RecordResultPort,
  ids: DivisionIds,
  input: RecordResultInput,
): Effect.Effect<DivisionSetupOutcome<{ recorded: boolean }>, DivisionError> =>
  port(ids, input);
```

- [ ] **Step 5: ハンドラーが recorded を見るようにする**

`src/features/division/record-result/handler.ts` の末尾を変える。

```ts
  revalidateDivisionResults(slug, tournamentId, divisionId);
  // 勝者が変わらなければ repository は何も書かない。書いていない操作で
  // record_result を飛ばすと、記録していない再タップまで記録として数えられる。
  if (!exit.value.value.recorded) {
    return { error: null };
  }
  return { error: null, succeeded: (prevState.succeeded ?? 0) + 1 };
```

`revalidateDivisionResults` は `recorded` にかかわらず呼ぶ（既存の挙動を変えない）。

- [ ] **Step 6: repository のテストを合わせる**

`src/features/division/record-result/repository.test.ts` で `{ found: true, value: null }` を期待している箇所を探し、書き込みが起きるケースは `{ recorded: true }`、「変更なし」のケースは `{ recorded: false }` に直す。「変更なし」を確かめている既存テストがあれば、そこが `recorded: false` を返すことも確かめる。無ければ 1 件足す。

- [ ] **Step 7: テストが通ることを確かめる**

Run: `pnpm vitest run src/features/division/record-result/`
Expected: PASS

- [ ] **Step 8: 全テスト・typecheck を通してコミット**

Run: `pnpm test` → 全件 PASS
Run: `pnpm typecheck` → エラー 0 件

```bash
git add src/features/division/record-result/
git commit -m "$(cat <<'EOF'
fix(analytics): only send record_result when a result was actually written

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: GA に送る URL から秘密と ID を落とす

GA はルートレイアウトにあり、gtag は既定で `page_location`（クエリ込みの完全 URL）を送る。今は秘密が載っていないが、`docs/superpowers/specs/2026-09-08-password-reset-design.md` は `/reset-password?token=<token>` を**ページ**として定義しており、実装されると有効なリセットトークンが Google に送られて保存される。GA4 は既定で任意のクエリを除去しない。

`@next/third-parties` の `GoogleAnalytics` は `gtag('config', ...)` に追加パラメータを渡す口を持たない（`node_modules/@next/third-parties/dist/google/ga.js` を読むと `debugMode` 以外は渡せない）。初回の `page_view` は `config` が即座に送るため、あのコンポーネントを使う限りサニタイズできない。よって gtag の初期化を自前に移す。

**Files:**
- Create: `src/shared/lib/analytics/sanitize-url.ts`
- Test: `src/shared/lib/analytics/sanitize-url.test.ts`
- Create: `src/components/analytics/GoogleAnalytics.tsx`
- Test: `src/components/analytics/GoogleAnalytics.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/shared/lib/analytics/events.ts`
- Modify: `src/shared/lib/analytics/events.test.ts`
- Modify: `package.json`（`@next/third-parties` を外す）
- Modify: `.env.example`

**Interfaces:**
- Consumes: `gaMeasurementId()`（`./ga-id`）
- Produces:
  - `sanitizePagePath(pathname: string): string`
  - `GoogleAnalytics({ gaId }: { gaId: string })`
  - `trackEvent` の実装が `sendGAEvent` ではなく自前の `window.dataLayer.push` になる（シグネチャは不変）

- [ ] **Step 1: サニタイザの失敗するテストを書く**

`src/shared/lib/analytics/sanitize-url.test.ts` を新規作成する。

```ts
import { describe, expect, it } from "vitest";
import { sanitizePagePath } from "./sanitize-url";

describe("sanitizePagePath", () => {
  it("組織のパスはそのまま通す", () => {
    expect(sanitizePagePath("/orgs/tennis-club")).toBe("/orgs/tennis-club");
  });

  it("大会 ID は :id に伏せる", () => {
    // cuid。大会・部門・ユーザーの ID はすべてこの形。
    expect(
      sanitizePagePath("/orgs/tennis-club/tournaments/clx1a2b3c4d5e6f7g8h9i0jk"),
    ).toBe("/orgs/tennis-club/tournaments/:id");
  });

  it("数値の ID も伏せる", () => {
    expect(sanitizePagePath("/orgs/tennis-club/users/42/permissions")).toBe(
      "/orgs/tennis-club/users/:id/permissions",
    );
  });

  it("UUID も伏せる", () => {
    expect(
      sanitizePagePath("/t/3f2504e0-4f89-11d3-9a0c-0305e82c3301/schedule"),
    ).toBe("/t/:id/schedule");
  });

  it("短い語は伏せない", () => {
    // "new" や "edit" のような画面名を :id にしてしまうと、
    // ページ別レポートで作成画面と詳細画面の区別が付かなくなる。
    expect(sanitizePagePath("/orgs/tennis-club/tournaments/new")).toBe(
      "/orgs/tennis-club/tournaments/new",
    );
    expect(sanitizePagePath("/orgs/abc/edit")).toBe("/orgs/abc/edit");
  });

  it("ルートはそのまま", () => {
    expect(sanitizePagePath("/")).toBe("/");
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm vitest run src/shared/lib/analytics/sanitize-url.test.ts`
Expected: FAIL。`Failed to resolve import "./sanitize-url"`

- [ ] **Step 3: サニタイザを実装する**

`src/shared/lib/analytics/sanitize-url.ts` を新規作成する。

```ts
/**
 * GA へ送るページパス。個体を指す ID を :id に伏せる。
 *
 * 伏せる理由は 2 つある。ユーザー ID のように個人を指す値を分析基盤へ
 * 渡さないこと、そして 1 大会につき 1 行になってしまうページ別レポートを
 * 画面ごとに集約して読めるようにすること。
 *
 * 組織 slug は伏せない。どの組織で使われているかは運営上の指標として要る。
 */
const ID_LIKE = /^(?:\d+|[0-9a-f-]{16,}|[a-z0-9]{16,})$/i;

export const sanitizePagePath = (pathname: string): string =>
  pathname
    .split("/")
    .map((segment) => (ID_LIKE.test(segment) ? ":id" : segment))
    .join("/");
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm vitest run src/shared/lib/analytics/sanitize-url.test.ts`
Expected: PASS（6 件）

- [ ] **Step 5: gtag の初期化を自前に移す**

`src/components/analytics/GoogleAnalytics.tsx` を新規作成する。

**設計の要点。** `config` に `send_page_view: false` を渡し、初回もクライアント遷移も同じ `useEffect` から `page_view` を送る。初回だけ別扱いにしないので、二重送信も送り漏れも起きない。ブートストラップは `strategy="beforeInteractive"` にする。これで `window.gtag` は hydration より前に必ず定義され、effect が動く時点で存在が保証される（gtag.js 本体の読み込みを待つ必要はない。呼び出しは dataLayer に積まれるだけで、後から読み込まれた gtag.js が順に処理する）。

```tsx
"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";
import { sanitizePagePath } from "@/shared/lib/analytics/sanitize-url";

/**
 * gtag.js を読み込み、ページビューを自前で送る。
 *
 * @next/third-parties の GoogleAnalytics を使わないのは、あれが
 * gtag('config', ...) に追加パラメータを渡す口を持たないため。
 * 既定の config は即座に page_location（クエリ込みの完全 URL）で
 * page_view を送ってしまい、差し替える隙が無い。
 * パスワード再設定は /reset-password?token=... というページなので、
 * そのままでは有効なトークンが Google に保存される。
 *
 * send_page_view: false にして、クエリを落とし ID を伏せたパスだけを送る。
 * GA4 側の拡張計測「ブラウザの履歴イベントに基づくページの変更」は必ず
 * 切ること。切らないと GA が素の URL でも page_view を送ってしまう。
 */
export function GoogleAnalytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();

  // 初回もクライアント遷移も、同じ経路で 1 回ずつ送る。初回だけ config に
  // 兼ねさせると、送信経路が 2 つになり片方だけサニタイズし忘れる。
  useEffect(() => {
    window.gtag("event", "page_view", {
      page_location: window.location.origin + sanitizePagePath(pathname),
    });
  }, [pathname]);

  return (
    <>
      <Script
        id="ga-bootstrap"
        strategy="beforeInteractive"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: gtag の
        // ブートストラップは Google が指定するインラインスクリプトの形で
        // しか書けない。埋め込む値は測定 ID だけで、JSON.stringify を通す。
        dangerouslySetInnerHTML={{
          __html: [
            "window.dataLayer = window.dataLayer || [];",
            "function gtag(){dataLayer.push(arguments);}",
            "window.gtag = gtag;",
            "gtag('js', new Date());",
            `gtag('config', ${JSON.stringify(gaId)}, { send_page_view: false });`,
          ].join("\n"),
        }}
      />
      <Script
        id="ga-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
      />
    </>
  );
}
```

`window.gtag` の型は `src/shared/lib/analytics/gtag.d.ts` を新規作成して宣言する。

```ts
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export {};
```

- [ ] **Step 6: GoogleAnalytics のテストを書く**

`src/components/analytics/GoogleAnalytics.test.tsx` を新規作成し、少なくとも次を確かめる。

- 描画したインラインスクリプトの中身に `send_page_view: false` が含まれる
- 描画したインラインスクリプトの中身に測定 ID が含まれる
- インラインスクリプトの中身にクエリ文字列（`?`）を含む URL が現れない
- 初回描画で `window.gtag` が `("event", "page_view", { page_location: <サニタイズ済み> })` で 1 回呼ばれる
- `usePathname` の戻り値を変えて再描画すると、新しいパスでもう 1 回呼ばれる
- ID を含むパス（例 `/orgs/tennis/tournaments/clx1a2b3c4d5e6f7g8h9i0jk`）で送られる `page_location` に生の ID が含まれない

`next/script` は `vi.mock("next/script", ...)` で素の `<script>` を返すダミーに差し替える。`window.gtag` はテスト側で `vi.fn()` を代入しておく（本物のブートストラップは jsdom では走らないため）。

- [ ] **Step 7: layout を差し替える**

`src/app/layout.tsx` の import を `@next/third-parties/google` から `@/components/analytics/GoogleAnalytics` に変える。`gaId !== null` のときだけ描画する条件はそのまま。

- [ ] **Step 8: trackEvent を自前の dataLayer push に変える**

`src/shared/lib/analytics/events.ts` から `@next/third-parties/google` の import を外し、`sendGAEvent` の代わりに `window.gtag` を呼ぶ。測定 ID が無いときに何もしないガードはそのまま残す。

`src/shared/lib/analytics/events.test.ts` のモックを、`@next/third-parties/google` のモックから `window.gtag` のスパイに差し替える。テストの意味（ID 無しでは呼ばない／名前とパラメータをそのまま渡す／パラメータ省略時は空オブジェクト）は変えない。

- [ ] **Step 9: 依存を外す**

Run: `pnpm remove @next/third-parties`

リポジトリ全体を検索し、`@next/third-parties` への参照が 1 件も残っていないことを確認する。

- [ ] **Step 10: 運用上の前提を書き残す**

`.env.example` の `NEXT_PUBLIC_GA_ID` のコメントに、GA4 プロパティ側の必須設定を追記する。

```
# 【重要】このアプリは page_view を自前で送る（クエリ文字列を落とし、
# ID を :id に伏せた path だけを送る）。GA4 プロパティの拡張計測から
# 「ブラウザの履歴イベントに基づくページの変更」を必ずオフにすること。
# オンのままだと GA が素の URL でも page_view を送り、
# /reset-password?token=... のようなページでトークンが Google に保存される。
```

`docs/superpowers/specs/2026-09-08-ga4-design.md` にも同じ前提と、自前初期化へ移した理由を追記する。

`docs/superpowers/specs/2026-09-08-password-reset-design.md` に、トークンがクエリに載るページであることと、GA へは送られない仕組みになっていることを 2〜3 行で追記する。

- [ ] **Step 11: 全テスト・typecheck を通してコミット**

Run: `pnpm test` → 全件 PASS
Run: `pnpm typecheck` → エラー 0 件
Run: `pnpm exec biome check` を変更したファイルに対して実行 → 内容起因のエラーなし

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(analytics): keep query strings and ids out of the URLs sent to GA

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ドキュメントの追随

**Files:**
- Modify: `docs/superpowers/specs/2026-09-08-ga4-design.md`
- Modify: `docs/superpowers/plans/2026-09-08-ga4.md`

- [ ] **Step 1: 仕様書のイベント名を直す**

`organization_create` / `tournament_create` / `division_create` を `create_organization` / `create_tournament` / `create_division` に置き換える。`?created=` のクエリ値（`organization` など）は変えない。

- [ ] **Step 2: 変わった設計判断を追記する**

仕様書に次を書き足す。

- gtag の初期化を `@next/third-parties` から自前へ移したこと、その理由（`config` に追加パラメータを渡せず初回 page_view をサニタイズできない）
- `page_location` はクエリを落とし ID を `:id` に伏せた path を送ること
- GA4 プロパティ側で拡張計測の履歴ベース page_view を切るのが前提であること
- `record_result` は実際に書き込んだときだけ送ること（勝者が変わらない再タップでは送らない）
- `login` の `method` は `"email"` 固定ではなく識別子の種別を送ること

- [ ] **Step 3: 実装計画に追随済みの注記を入れる**

`docs/superpowers/plans/2026-09-08-ga4.md` の冒頭に、この計画の一部が `2026-09-08-ga4-followup.md` で更新されている旨を 2 行で書く。

- [ ] **Step 4: コミット**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs(analytics): update GA4 spec for renamed events and URL sanitizing

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完了条件

- `pnpm test` / `pnpm typecheck` が通る
- `@next/third-parties` への参照がリポジトリに残っていない
- 測定 ID 未設定で GA 系リクエストが 0 件
- 測定 ID 設定時、`?created=organization` で `create_organization` が飛び、GA へ送られる `page_location` にクエリ文字列が含まれない
- 同じ勝者を 2 回タップしても `record_result` は 1 回しか飛ばない
