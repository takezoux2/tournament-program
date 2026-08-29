# 組織・大会の CRUD 画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Organization`（組織）と `Tournament`（大会）を作成・一覧・閲覧・編集・削除できる画面を作り、Mock しか無かったアプリを実データで動くようにする。

**Architecture:** アクティブな組織は URL のみが保持し、Cookie にもサーバー状態にも持たない。`/orgs/[slug]` 配下のページと Server Action は冒頭で `requireOrganization(slug)` を呼び、所属していなければ 404 を返す。フォームは Server Actions + `useActionState`。usecase 層は Effect のタグ付きエラーを使い、Prisma の型は repository の外へ出さない。

**Tech Stack:** Next.js 16.3.3 (App Router) / React 19.2 / Prisma 7.10 (PostgreSQL + `@prisma/adapter-pg`) / zod 4 / effect 3 / vitest 4 / biome 2.4 / Tailwind CSS 4

**設計書:** [docs/superpowers/specs/2026-08-29-organization-tournament-crud-design.md](../specs/2026-08-29-organization-tournament-crud-design.md)

## Global Constraints

これらは全タスクの要件に含まれる。

- パッケージマネージャは **pnpm** を使う（`pnpm add`, `pnpm exec`）。npm / yarn は使わない。
- **DB スキーマの変更もマイグレーションも一切不要。** `Organization` / `OrganizationUser` / `Tournament` は既に定義済みで、本計画はそこに何も足さない。`prisma/schema.prisma` を編集したら、それは計画からの逸脱である。
- Next.js 16 では `middleware.ts` は廃止され **`proxy.ts`** になっている。`middleware.ts` を作らない。
- ページの props の型は typegen が生成するグローバル型 **`PageProps<"/orgs/[slug]">`** を使う。`params` / `searchParams` は Promise なので `await` する。
- 新しい worktree では `pnpm typecheck` の前に **`pnpm exec next typegen`** が必要（`PageProps` / `LayoutProps` が解決できないため）。
- コードのフォーマットは biome（スペース 2 インデント、ダブルクォート）。各タスクの最後に `pnpm lint:fix` を通す。
- コメントと UI 文言は日本語。既存コードのコメント密度に合わせ、「なぜ」を書く。「何を」は書かない。
- `docs/code-design/architecture.md` の依存ルール: **`src/features/` 配下では上位（祖先）ディレクトリのみ依存してよい。同列（兄弟）・下位ディレクトリへの依存は禁止。** 他の機能カテゴリへの依存も禁止。
- UI コンポーネントは `src/components/` に置く。**`src/features/` 配下に `.tsx` は置かない。** `src/components/` と `src/app/` は `src/features/` に依存してよい（逆は不可）。
- `biome.json` の `overrides` は**後勝ちで options を置き換える**（マージではない）。下位スライスの override には、上位で書いた禁止パターンも全て書き直す。
- 認可の境界は `requireSession()` と `requireOrganization()` の 2 つだけ。**ページと Server Action の両方の冒頭で呼ぶ。** Server Action は独立した入口であり、ページで確認済みでも素通しはできない。
- 大会は必ず `findFirst({ where: { id, organizationId } })` の形で引く。id だけで引いて後から所属を検証する形にしない。
- `AGENTS.md` 冒頭のブロックは `next dev` が自動生成する。差分から消しても再生成されるので、変更があれば一緒にコミットしてよい。
- 各タスクの最後に `pnpm test` `pnpm typecheck` `pnpm lint` の 3 つを通してからコミットする。

---

## File Structure

### 移動・リネーム

| 移動元 | 移動先 | 理由 |
| --- | --- | --- |
| `src/features/tournament/**` | `src/features/bracket/**` | 中身はブラケット描画の純粋ロジックであり、大会エンティティの CRUD ではない。空いた名前を大会 CRUD に使う |
| `src/app/page.tsx` | `src/app/mock/page.tsx` | `/` は組織一覧になる。Mock 表示は描画ロジックの確認先として残す |

### 新規作成

| ファイル | 責務 |
| --- | --- |
| `src/shared/middleware/require-organization.ts` | `requireOrganization()`。組織スコープのセキュリティ境界 |
| `src/features/organization/domain.ts` | `validateSlug`。slug の純粋な検証 |
| `src/features/organization/errors.ts` | `OrganizationError` と `toOrganizationError`（Prisma の P2002 → `SlugTaken`） |
| `src/features/organization/messages.ts` | エラー → 日本語文言。`Match.exhaustive` と `Record` で網羅性を保証 |
| `src/features/organization/state.ts` | `OrganizationFormState`。handler と components が共有する型 |
| `src/features/organization/repository.ts` | `listOrganizationsForUser` |
| `src/features/organization/create/{schema,repository,usecase,handler}.ts` | 組織の作成 |
| `src/features/organization/update/{schema,repository,usecase,handler}.ts` | 組織の編集 |
| `src/features/organization/delete/{schema,repository,usecase,handler}.ts` | 組織の削除 |
| `src/features/tournament/errors.ts` | `TournamentError` と `toTournamentError` |
| `src/features/tournament/messages.ts` | エラー → 日本語文言 |
| `src/features/tournament/state.ts` | `TournamentFormState` |
| `src/features/tournament/status.ts` | `TOURNAMENT_STATUS_LABELS` |
| `src/features/tournament/format.ts` | `formatStartsAt` / `toDateTimeLocalValue` |
| `src/features/tournament/repository.ts` | `listTournamentsInOrganization` / `findTournamentInOrganization` |
| `src/features/tournament/create/{schema,repository,usecase,handler}.ts` | 大会の作成 |
| `src/features/tournament/update/{schema,repository,usecase,handler}.ts` | 大会の編集 |
| `src/features/tournament/delete/{schema,repository,usecase,handler}.ts` | 大会の削除 |
| `src/components/layout/AppHeader.tsx` | パンくず + ユーザー名 + ログアウト。全ページで使い回す |
| `src/components/organization/OrganizationList.tsx` | 組織一覧の表示 |
| `src/components/organization/OrganizationForm.tsx` | 組織の作成・編集フォーム（`"use client"`） |
| `src/components/organization/DeleteOrganizationForm.tsx` | 組織の削除確認（`"use client"`） |
| `src/components/tournament/TournamentList.tsx` | 大会一覧の表示 |
| `src/components/tournament/TournamentForm.tsx` | 大会の作成・編集フォーム（`"use client"`） |
| `src/components/tournament/DeleteTournamentForm.tsx` | 大会の削除確認（`"use client"`） |
| `src/app/page.tsx` | `/` 組織一覧 |
| `src/app/orgs/new/page.tsx` | `/orgs/new` |
| `src/app/orgs/[slug]/page.tsx` | `/orgs/[slug]` 組織の閲覧 + 大会一覧 |
| `src/app/orgs/[slug]/edit/page.tsx` | `/orgs/[slug]/edit` |
| `src/app/orgs/[slug]/tournaments/new/page.tsx` | 大会の作成 |
| `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` | 大会の閲覧 |
| `src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx` | 大会の編集 |

### handler.ts を単体テストしない理由

`handler.ts` は `requireSession` / `revalidatePath` / `redirect` という Next.js のランタイムに強く依存した糊であり、意味のある分岐を持たない。テストは `domain` / `schema` / `usecase` / `errors` / `messages` / コンポーネント / ミドルウェアに置く。この方針は既存の `features/auth` と同じ。

---

## Task 1: `features/tournament` を `features/bracket` にリネームする

**Files:**
- Move: `src/features/tournament/**` → `src/features/bracket/**`（9 ファイル）
- Modify: `src/app/page.tsx`
- Modify: `src/components/tournament/MatchCard.tsx`
- Modify: `src/components/tournament/MatchCard.test.tsx`
- Modify: `src/components/tournament/MatchNode.tsx`
- Modify: `src/components/tournament/TournamentFlow.tsx`
- Modify: `biome.json`

**Interfaces:**
- Consumes: なし
- Produces: `@/features/bracket/types`, `@/features/bracket/layout-bracket`, `@/features/bracket/resolve-bracket`, `@/features/bracket/to-flow-elements`, `@/features/bracket/mock/{bracket,participants,results}`。エクスポートされる名前（`layoutBracket`, `NODE_WIDTH`, `NODE_HEIGHT`, `resolveBracket`, `toFlowElements`, `MatchFlowNode`, `ResolvedMatch`, `ResolvedSlot`, `mockBracket`, `mockParticipants`, `mockResults`）は一切変えない。

これは純粋なリネームで、ロジックは 1 行も変えない。既存テストが安全網になる。

- [ ] **Step 1: リネーム前にテストが緑であることを確認する**

Run: `pnpm test`
Expected: PASS（全ファイル）

- [ ] **Step 2: ディレクトリを `git mv` でリネームする**

```bash
git mv src/features/tournament src/features/bracket
```

- [ ] **Step 3: import パスを一括で書き換える**

`@/features/tournament/` を `@/features/bracket/` に置き換える。対象は 5 ファイル。

```bash
grep -rl '@/features/tournament/' src | xargs sed -i 's|@/features/tournament/|@/features/bracket/|g'
```

書き換え後の内容を確認する。

```bash
grep -rn '@/features/bracket/' src
```

Expected: 以下の 6 箇所（`src/app/page.tsx` の 6 行と、`src/components/tournament/` の 4 ファイル）が `@/features/bracket/...` になっていること。`@/features/tournament/` の残りが 0 件であること。

```bash
grep -rn '@/features/tournament' src
```

Expected: 出力なし

- [ ] **Step 4: `biome.json` の `features/tournament` を `features/bracket` に書き換える**

`biome.json` の `overrides` 配列にある 4 箇所を書き換える。

1. `"includes": ["src/features/auth/**"]` の override 内、`group` の
   `"@/features/tournament/**"` → `"@/features/bracket/**"`、
   `"@/features/tournament"` → `"@/features/bracket"`、
   `"**/tournament/**"` → `"**/bracket/**"`
2. `"includes": ["src/features/auth/login/**"]` の override 内も同じ 3 つを書き換える
3. `"includes": ["src/features/auth/signup/**"]` の override 内も同じ 3 つを書き換える
4. `"includes": ["src/features/tournament/**"]` の override を丸ごと以下に差し替える

```json
    {
      "includes": ["src/features/bracket/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "**/auth/**",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/bracket は他の機能・UI・app に依存できません。"
                  },
                  {
                    "group": [
                      "@/features/bracket/mock/**",
                      "@/features/bracket/mock",
                      "**/mock/**"
                    ],
                    "message": "features/bracket 直下から下位スライス（mock）に依存することはできません。祖先方向の参照のみ許可されます。"
                  }
                ]
              }
            }
          }
        }
      }
    }
```

`src/features/auth/**` の 3 つの override にある `"message"` の文面は変更しない（「features/auth は他の機能・UI・app に依存できません」のまま）。

- [ ] **Step 5: テスト・型・lint を通す**

```bash
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS。`pnpm test` の件数は Step 1 と同じであること（リネームでテストが減っていないことの確認）。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "refactor: rename features/tournament to features/bracket"
```

---

## Task 2: 新スライス用の境界 lint を `biome.json` に追加する

**Files:**
- Modify: `biome.json`

**Interfaces:**
- Consumes: Task 1 でリネーム済みの `src/features/bracket/**` override
- Produces: `src/features/organization/**` と `src/features/tournament/**` の各スライスに対する境界ルール。以降のタスクで作るファイルはこのルールに従う。

まだ存在しないディレクトリに対する override を先に入れる。biome は存在しないパスの `includes` を無視するだけなので害はなく、以降のタスクで境界違反が即座に検出できるようになる。

**重要:** `biome.json` の override は**後勝ちで options を置き換える**。そのため下位スライスの override にも、上位で書いた禁止パターンを全て書き直す。

- [ ] **Step 1: `src/features/auth/**` の 3 つの override に organization / tournament を追加する**

`"includes": ["src/features/auth/**"]`、`["src/features/auth/login/**"]`、`["src/features/auth/signup/**"]` の 3 つの override の 1 つめの `group` 配列に、以下の 4 要素を追加する（既存の `@/features/bracket/**` などはそのまま残す）。

```json
                      "@/features/organization/**",
                      "@/features/organization",
                      "@/features/tournament/**",
                      "@/features/tournament",
                      "**/organization/**",
```

`**/organization/**` は相対パスでの参照を塞ぐために足す。一方 `**/tournament/**` は**足さない**。`src/components/tournament/` を指す相対 import まで巻き込むためで、`@/features/tournament/**` と `@/features/tournament` の明示パターンだけで features 間の参照は塞げる。

- [ ] **Step 2: `src/features/bracket/**` の override にも同じ 5 要素を追加する**

Task 1 の Step 4 で作った `"includes": ["src/features/bracket/**"]` の 1 つめの `group` 配列に、Step 1 と同じ 5 要素を追加する。

- [ ] **Step 3: organization の 4 つの override を `overrides` 配列の末尾に追加する**

```json
    {
      "includes": ["src/features/organization/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "@/features/bracket/**",
                      "@/features/bracket",
                      "@/features/tournament/**",
                      "@/features/tournament",
                      "**/auth/**",
                      "**/bracket/**",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/organization は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": [
                      "@/features/organization/create/**",
                      "@/features/organization/create",
                      "@/features/organization/update/**",
                      "@/features/organization/update",
                      "@/features/organization/delete/**",
                      "@/features/organization/delete"
                    ],
                    "message": "features/organization 直下から下位スライス（create・update・delete）に依存することはできません。祖先方向の参照のみ許可されます。共有するものは features/organization 直下か src/shared へ置いてください。"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/features/organization/create/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "@/features/bracket/**",
                      "@/features/bracket",
                      "@/features/tournament/**",
                      "@/features/tournament",
                      "**/auth/**",
                      "**/bracket/**",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/organization は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": [
                      "@/features/organization/update/**",
                      "@/features/organization/update",
                      "@/features/organization/delete/**",
                      "@/features/organization/delete",
                      "../update/**",
                      "../delete/**"
                    ],
                    "message": "同列のスライスには依存できません。共有するものは features/organization 直下か src/shared へ。"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/features/organization/update/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "@/features/bracket/**",
                      "@/features/bracket",
                      "@/features/tournament/**",
                      "@/features/tournament",
                      "**/auth/**",
                      "**/bracket/**",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/organization は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": [
                      "@/features/organization/create/**",
                      "@/features/organization/create",
                      "@/features/organization/delete/**",
                      "@/features/organization/delete",
                      "../create/**",
                      "../delete/**"
                    ],
                    "message": "同列のスライスには依存できません。共有するものは features/organization 直下か src/shared へ。"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/features/organization/delete/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "@/features/bracket/**",
                      "@/features/bracket",
                      "@/features/tournament/**",
                      "@/features/tournament",
                      "**/auth/**",
                      "**/bracket/**",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/organization は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": [
                      "@/features/organization/create/**",
                      "@/features/organization/create",
                      "@/features/organization/update/**",
                      "@/features/organization/update",
                      "../create/**",
                      "../update/**"
                    ],
                    "message": "同列のスライスには依存できません。共有するものは features/organization 直下か src/shared へ。"
                  }
                ]
              }
            }
          }
        }
      }
    }
```

- [ ] **Step 4: tournament の 4 つの override を `overrides` 配列の末尾に追加する**

organization の 4 つと同じ形で、`organization` と `tournament` を入れ替えたものを追加する。禁止する他機能は `auth` / `bracket` / `organization` の 3 つになる。

```json
    {
      "includes": ["src/features/tournament/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "@/features/bracket/**",
                      "@/features/bracket",
                      "@/features/organization/**",
                      "@/features/organization",
                      "**/auth/**",
                      "**/bracket/**",
                      "**/organization/**",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/tournament は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": [
                      "@/features/tournament/create/**",
                      "@/features/tournament/create",
                      "@/features/tournament/update/**",
                      "@/features/tournament/update",
                      "@/features/tournament/delete/**",
                      "@/features/tournament/delete"
                    ],
                    "message": "features/tournament 直下から下位スライス（create・update・delete）に依存することはできません。祖先方向の参照のみ許可されます。共有するものは features/tournament 直下か src/shared へ置いてください。"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/features/tournament/create/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "@/features/bracket/**",
                      "@/features/bracket",
                      "@/features/organization/**",
                      "@/features/organization",
                      "**/auth/**",
                      "**/bracket/**",
                      "**/organization/**",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/tournament は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": [
                      "@/features/tournament/update/**",
                      "@/features/tournament/update",
                      "@/features/tournament/delete/**",
                      "@/features/tournament/delete",
                      "../update/**",
                      "../delete/**"
                    ],
                    "message": "同列のスライスには依存できません。共有するものは features/tournament 直下か src/shared へ。"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/features/tournament/update/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "@/features/bracket/**",
                      "@/features/bracket",
                      "@/features/organization/**",
                      "@/features/organization",
                      "**/auth/**",
                      "**/bracket/**",
                      "**/organization/**",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/tournament は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": [
                      "@/features/tournament/create/**",
                      "@/features/tournament/create",
                      "@/features/tournament/delete/**",
                      "@/features/tournament/delete",
                      "../create/**",
                      "../delete/**"
                    ],
                    "message": "同列のスライスには依存できません。共有するものは features/tournament 直下か src/shared へ。"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/features/tournament/delete/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "@/features/bracket/**",
                      "@/features/bracket",
                      "@/features/organization/**",
                      "@/features/organization",
                      "**/auth/**",
                      "**/bracket/**",
                      "**/organization/**",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/tournament は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": [
                      "@/features/tournament/create/**",
                      "@/features/tournament/create",
                      "@/features/tournament/update/**",
                      "@/features/tournament/update",
                      "../create/**",
                      "../update/**"
                    ],
                    "message": "同列のスライスには依存できません。共有するものは features/tournament 直下か src/shared へ。"
                  }
                ]
              }
            }
          }
        }
      }
    }
```

- [ ] **Step 5: 違反プローブでルールが効いていることを確認する**

lint 設定にはテストが書けないので、意図的に違反するファイルを一時的に作って検出されることを確認する。

```bash
mkdir -p src/features/organization/create
printf 'import { layoutBracket } from "@/features/bracket/layout-bracket";\nexport const x = layoutBracket;\n' > src/features/organization/create/violation-probe.ts
pnpm lint src/features/organization/create/violation-probe.ts
```

Expected: FAIL。「features/organization は他の機能・UI・app に依存できません」を含むエラーが出る。

同列スライスの禁止も確認する。

```bash
mkdir -p src/features/organization/update
printf 'export const y = 1;\n' > src/features/organization/update/probe-target.ts
printf 'import { y } from "@/features/organization/update/probe-target";\nexport const z = y;\n' > src/features/organization/create/violation-probe.ts
pnpm lint src/features/organization/create/violation-probe.ts
```

Expected: FAIL。「同列のスライスには依存できません」を含むエラーが出る。

- [ ] **Step 6: プローブを削除する**

```bash
rm -rf src/features/organization src/features/tournament
```

Expected: `git status --short` に `biome.json` の変更だけが残ること。

- [ ] **Step 7: lint と型を通す**

```bash
pnpm lint
pnpm test
pnpm typecheck
```

Expected: すべて PASS

- [ ] **Step 8: コミット**

```bash
git add biome.json
git commit -m "chore: add feature boundary lint rules for organization and tournament slices"
```

---

## Task 3: `requireOrganization()` 認可境界を作る

**Files:**
- Create: `src/shared/middleware/require-organization.ts`
- Test: `src/shared/middleware/require-organization.test.ts`

**Interfaces:**
- Consumes: `requireSession` from `@/shared/middleware/require-session`、`prisma` from `@/shared/db/prisma`
- Produces:
  ```ts
  requireOrganization(slug: string): Promise<{
    session: Awaited<ReturnType<typeof requireSession>>;
    organization: { id: string; name: string; slug: string; createdAt: Date; updatedAt: Date };
    role: OrganizationRole;
  }>
  ```
  所属していない場合は `notFound()` を呼ぶ（戻らない）。以降の全タスクの `/orgs/[slug]` 配下のページと Server Action がこれを冒頭で呼ぶ。

- [ ] **Step 1: 失敗するテストを書く**

Create `src/shared/middleware/require-organization.test.ts`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const findFirst = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。同じ形を模す。
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { findFirst: (args: unknown) => findFirst(args) },
  },
}));

vi.mock("./require-session", () => ({
  requireSession: () => requireSession(),
}));

const { requireOrganization } = await import("./require-organization");

const session = { user: { id: "u1", name: "竹添" } };
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

describe("requireOrganization", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findFirst.mockReset();
    notFound.mockClear();
    requireSession.mockResolvedValue(session);
  });

  it("所属していれば組織とロールを返す", async () => {
    findFirst.mockResolvedValue({ role: "OWNER", organization });

    await expect(requireOrganization("tennis")).resolves.toEqual({
      session,
      organization,
      role: "OWNER",
    });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("所属していなければ notFound を呼ぶ", async () => {
    findFirst.mockResolvedValue(null);

    await expect(requireOrganization("tennis")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("ログインしていなければ requireSession の時点で打ち切られ、DB を引かない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(requireOrganization("tennis")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("slug と userId の両方を where に含めて引く", async () => {
    // 横断アクセス防止の回帰テスト。slug だけで引くと他人の組織が見える。
    findFirst.mockResolvedValue({ role: "MEMBER", organization });

    await requireOrganization("tennis");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization: { slug: "tennis" }, userId: "u1" },
      }),
    );
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/shared/middleware/require-organization.test.ts`
Expected: FAIL。`Failed to resolve import "./require-organization"` のようなエラー。

- [ ] **Step 3: 実装を書く**

Create `src/shared/middleware/require-organization.ts`:

```ts
import { notFound } from "next/navigation";
import { prisma } from "@/shared/db/prisma";
import { requireSession } from "./require-session";

/**
 * 組織スコープの実際のセキュリティ境界。/orgs/[slug] 配下の Server Component と
 * Server Action の冒頭で必ず呼ぶ。ページで確認済みでも Server Action は
 * 独立した入口であり、素通しにはできない。
 */
export const requireOrganization = async (slug: string) => {
  const session = await requireSession();

  const membership = await prisma.organizationUser.findFirst({
    where: { organization: { slug }, userId: session.user.id },
    include: { organization: true },
  });

  // 非所属を 403 ではなく 404 にするのは、組織の存在自体を漏らさないため。
  if (!membership) {
    notFound();
  }

  return {
    session,
    organization: membership.organization,
    role: membership.role,
  };
};
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm test src/shared/middleware/require-organization.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: 型と lint を通す**

```bash
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS

- [ ] **Step 6: コミット**

```bash
git add src/shared/middleware/require-organization.ts src/shared/middleware/require-organization.test.ts
git commit -m "feat: add requireOrganization authorization boundary"
```

---

## Task 4: 組織のドメイン・エラー・文言を作る

**Files:**
- Create: `src/features/organization/domain.ts`
- Create: `src/features/organization/errors.ts`
- Create: `src/features/organization/messages.ts`
- Create: `src/features/organization/state.ts`
- Test: `src/features/organization/domain.test.ts`
- Test: `src/features/organization/errors.test.ts`
- Test: `src/features/organization/messages.test.ts`

**Interfaces:**
- Consumes: `Prisma` from `@/generated/prisma/client`（`PrismaClientKnownRequestError` の判定に使う）
- Produces:
  - `validateSlug(raw: string): SlugViolation | null`
  - `type SlugViolation = "empty" | "tooShort" | "tooLong" | "invalidCharacter" | "hyphenEdge" | "consecutiveHyphen" | "reserved"`
  - `MIN_SLUG_LENGTH = 3` / `MAX_SLUG_LENGTH = 50` / `RESERVED_SLUGS`
  - `class SlugTaken` / `class UnexpectedOrganizationError` / `type OrganizationError`
  - `toOrganizationError(reason: unknown, slug: string): OrganizationError`
  - `organizationErrorMessage(error: OrganizationError): string`
  - `slugViolationMessage(violation: SlugViolation): string`
  - `type OrganizationFormState = { error: string | null }` / `INITIAL_ORGANIZATION_FORM_STATE`

- [ ] **Step 1: `domain.ts` の失敗するテストを書く**

Create `src/features/organization/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_SLUG_LENGTH, validateSlug } from "./domain";

describe("validateSlug", () => {
  it("英小文字・数字・ハイフンだけの妥当な値を通す", () => {
    expect(validateSlug("tennis")).toBeNull();
    expect(validateSlug("tennis-club-2026")).toBeNull();
    expect(validateSlug("a1b")).toBeNull();
  });

  it("空文字を empty として弾く", () => {
    expect(validateSlug("")).toBe("empty");
  });

  it("3 文字未満を tooShort として弾く", () => {
    expect(validateSlug("ab")).toBe("tooShort");
  });

  it("50 文字超を tooLong として弾く", () => {
    expect(validateSlug("a".repeat(MAX_SLUG_LENGTH))).toBeNull();
    expect(validateSlug("a".repeat(MAX_SLUG_LENGTH + 1))).toBe("tooLong");
  });

  it("大文字・日本語・記号を invalidCharacter として弾く", () => {
    expect(validateSlug("Tennis")).toBe("invalidCharacter");
    expect(validateSlug("テニス部")).toBe("invalidCharacter");
    expect(validateSlug("tennis_club")).toBe("invalidCharacter");
    expect(validateSlug("tennis club")).toBe("invalidCharacter");
    expect(validateSlug("tennis/evil")).toBe("invalidCharacter");
  });

  it("先頭・末尾のハイフンを hyphenEdge として弾く", () => {
    expect(validateSlug("-tennis")).toBe("hyphenEdge");
    expect(validateSlug("tennis-")).toBe("hyphenEdge");
  });

  it("連続したハイフンを consecutiveHyphen として弾く", () => {
    expect(validateSlug("ten--nis")).toBe("consecutiveHyphen");
  });

  it("ルーティングと衝突する予約語を reserved として弾く", () => {
    expect(validateSlug("new")).toBe("reserved");
    expect(validateSlug("orgs")).toBe("reserved");
    expect(validateSlug("api")).toBe("reserved");
    expect(validateSlug("login")).toBe("reserved");
    expect(validateSlug("signup")).toBe("reserved");
    expect(validateSlug("mock")).toBe("reserved");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/features/organization/domain.test.ts`
Expected: FAIL。`Failed to resolve import "./domain"`

- [ ] **Step 3: `domain.ts` を実装する**

Create `src/features/organization/domain.ts`:

```ts
export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 50;

/** ルーティングと衝突する語。組織 ID として使わせない。 */
export const RESERVED_SLUGS = [
  "new",
  "orgs",
  "api",
  "login",
  "signup",
  "mock",
] as const;

export type SlugViolation =
  | "empty"
  | "tooShort"
  | "tooLong"
  | "invalidCharacter"
  | "hyphenEdge"
  | "consecutiveHyphen"
  | "reserved";

/**
 * 妥当なら null、そうでなければ違反の種類を返す。
 *
 * 正規化ではなく拒否で扱う。slug は URL の一部としてそのまま出るため、
 * 入力を黙って書き換えるとユーザーが打った ID と実際の URL がずれる。
 */
export const validateSlug = (raw: string): SlugViolation | null => {
  if (raw.length === 0) return "empty";
  if (raw.length < MIN_SLUG_LENGTH) return "tooShort";
  if (raw.length > MAX_SLUG_LENGTH) return "tooLong";
  if (!/^[a-z0-9-]+$/.test(raw)) return "invalidCharacter";
  if (raw.startsWith("-") || raw.endsWith("-")) return "hyphenEdge";
  if (raw.includes("--")) return "consecutiveHyphen";
  if ((RESERVED_SLUGS as readonly string[]).includes(raw)) return "reserved";
  return null;
};
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm test src/features/organization/domain.test.ts`
Expected: PASS（8 件）

- [ ] **Step 5: `errors.ts` の失敗するテストを書く**

Create `src/features/organization/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { toOrganizationError } from "./errors";

/** P2002（unique 制約違反）を模した Prisma のエラーを作る。 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
  });

describe("toOrganizationError", () => {
  it("P2002 を SlugTaken に写像する", () => {
    const error = toOrganizationError(uniqueViolation(), "tennis");
    expect(error._tag).toBe("SlugTaken");
    expect(error).toMatchObject({ slug: "tennis" });
  });

  it("P2002 以外の Prisma エラーは UnexpectedOrganizationError にする", () => {
    const cause = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "7.10.0",
    });
    const error = toOrganizationError(cause, "tennis");
    expect(error._tag).toBe("UnexpectedOrganizationError");
    expect(error).toMatchObject({ reason: cause });
  });

  it("Prisma と無関係な例外も握り潰さず reason に残す", () => {
    const cause = new Error("network");
    const error = toOrganizationError(cause, "tennis");
    expect(error._tag).toBe("UnexpectedOrganizationError");
    expect(error).toMatchObject({ reason: cause });
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `pnpm test src/features/organization/errors.test.ts`
Expected: FAIL。`Failed to resolve import "./errors"`

- [ ] **Step 7: `errors.ts` を実装する**

Create `src/features/organization/errors.ts`:

```ts
import { Data } from "effect";
import { Prisma } from "@/generated/prisma/client";

export class SlugTaken extends Data.TaggedError("SlugTaken")<{
  readonly slug: string;
}> {}

export class UnexpectedOrganizationError extends Data.TaggedError(
  "UnexpectedOrganizationError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type OrganizationError = SlugTaken | UnexpectedOrganizationError;

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 */
export const toOrganizationError = (
  reason: unknown,
  slug: string,
): OrganizationError => {
  if (
    reason instanceof Prisma.PrismaClientKnownRequestError &&
    reason.code === "P2002"
  ) {
    return new SlugTaken({ slug });
  }
  return new UnexpectedOrganizationError({ reason });
};
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `pnpm test src/features/organization/errors.test.ts`
Expected: PASS（3 件）

- [ ] **Step 9: `messages.ts` の失敗するテストを書く**

Create `src/features/organization/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SlugViolation } from "./domain";
import { SlugTaken, UnexpectedOrganizationError } from "./errors";
import { organizationErrorMessage, slugViolationMessage } from "./messages";

describe("organizationErrorMessage", () => {
  it("SlugTaken に専用の文言を返す", () => {
    expect(organizationErrorMessage(new SlugTaken({ slug: "tennis" }))).toBe(
      "この組織 ID は既に使われています",
    );
  });

  it("UnexpectedOrganizationError に汎用の文言を返す", () => {
    expect(
      organizationErrorMessage(
        new UnexpectedOrganizationError({ reason: new Error("x") }),
      ),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});

describe("slugViolationMessage", () => {
  const violations: SlugViolation[] = [
    "empty",
    "tooShort",
    "tooLong",
    "invalidCharacter",
    "hyphenEdge",
    "consecutiveHyphen",
    "reserved",
  ];

  it("全ての違反に空でない文言を返す", () => {
    for (const violation of violations) {
      expect(slugViolationMessage(violation)).not.toBe("");
    }
  });

  it("違反ごとに異なる文言を返す", () => {
    // 同じ文言を使い回すと、ユーザーはどこを直せばよいか分からない。
    const messages = violations.map(slugViolationMessage);
    expect(new Set(messages).size).toBe(violations.length);
  });
});
```

- [ ] **Step 10: テストを実行して失敗を確認する**

Run: `pnpm test src/features/organization/messages.test.ts`
Expected: FAIL。`Failed to resolve import "./messages"`

- [ ] **Step 11: `messages.ts` を実装する**

Create `src/features/organization/messages.ts`:

```ts
import { Match } from "effect";
import {
  MAX_SLUG_LENGTH,
  MIN_SLUG_LENGTH,
  type SlugViolation,
} from "./domain";
import type { OrganizationError } from "./errors";

/**
 * Match.exhaustive により、OrganizationError にタグを足したのにここへ
 * 文言を足し忘れるとコンパイルエラーになる。
 */
export const organizationErrorMessage: (error: OrganizationError) => string =
  Match.type<OrganizationError>().pipe(
    Match.tag("SlugTaken", () => "この組織 ID は既に使われています"),
    Match.tag(
      "UnexpectedOrganizationError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );

/**
 * Record のキーを SlugViolation に固定しているため、違反の種類を足して
 * 文言を書き忘れるとコンパイルエラーになる。
 */
const SLUG_VIOLATION_MESSAGES: Record<SlugViolation, string> = {
  empty: "組織 ID を入力してください",
  tooShort: `組織 ID は${MIN_SLUG_LENGTH}文字以上で入力してください`,
  tooLong: `組織 ID は${MAX_SLUG_LENGTH}文字以内で入力してください`,
  invalidCharacter: "組織 ID は半角英小文字・数字・ハイフンのみ使えます",
  hyphenEdge: "組織 ID の先頭と末尾にハイフンは使えません",
  consecutiveHyphen: "組織 ID にハイフンを連続して使うことはできません",
  reserved: "この組織 ID は予約されているため使えません",
};

export const slugViolationMessage = (violation: SlugViolation): string =>
  SLUG_VIOLATION_MESSAGES[violation];
```

- [ ] **Step 12: テストを実行して成功を確認する**

Run: `pnpm test src/features/organization/messages.test.ts`
Expected: PASS（4 件）

- [ ] **Step 13: `state.ts` を作る**

Create `src/features/organization/state.ts`:

```ts
/**
 * 組織のフォームが Server Action から受け取る状態。
 * handler（features）とフォーム（components）の両方が参照するため、
 * どちらからも依存できる features 直下に置く。
 */
export type OrganizationFormState = {
  error: string | null;
};

export const INITIAL_ORGANIZATION_FORM_STATE: OrganizationFormState = {
  error: null,
};
```

テストは書かない。分岐のない型と定数だけであり、検証する挙動がない。

- [ ] **Step 14: 全体を通す**

```bash
pnpm test
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS

- [ ] **Step 15: コミット**

```bash
git add src/features/organization
git commit -m "feat: add organization domain, errors, messages and form state"
```

---

## Task 5: 組織一覧画面（`/`）を作り、Mock を `/mock` へ移す

**Files:**
- Create: `src/features/organization/repository.ts`
- Create: `src/components/layout/AppHeader.tsx`
- Create: `src/components/organization/OrganizationList.tsx`
- Test: `src/components/organization/OrganizationList.test.tsx`
- Move: `src/app/page.tsx` → `src/app/mock/page.tsx`
- Create: `src/app/page.tsx`

**Interfaces:**
- Consumes: `requireSession` from `@/shared/middleware/require-session`
- Produces:
  - `type OrganizationSummary = { id: string; name: string; slug: string }`
  - `listOrganizationsForUser(userId: string): Promise<OrganizationSummary[]>`
  - `<AppHeader crumbs={Crumb[]} userName={string} />` と `type Crumb = { label: string; href?: string }`
  - `<OrganizationList organizations={OrganizationSummary[]} />`

- [ ] **Step 1: Mock ページを `/mock` へ移す**

```bash
mkdir -p src/app/mock
git mv src/app/page.tsx src/app/mock/page.tsx
```

中身は変更しない。Task 1 で import は `@/features/bracket/*` に更新済み。

- [ ] **Step 2: `OrganizationList` の失敗するテストを書く**

Create `src/components/organization/OrganizationList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrganizationList } from "./OrganizationList";

describe("OrganizationList", () => {
  it("組織名を /orgs/[slug] へのリンクとして表示する", () => {
    render(
      <OrganizationList
        organizations={[
          { id: "o1", name: "テニス部", slug: "tennis" },
          { id: "o2", name: "卓球部", slug: "table-tennis" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "テニス部" })).toHaveAttribute(
      "href",
      "/orgs/tennis",
    );
    expect(screen.getByRole("link", { name: "卓球部" })).toHaveAttribute(
      "href",
      "/orgs/table-tennis",
    );
  });

  it("組織が無いときは空であることを伝える", () => {
    render(<OrganizationList organizations={[]} />);

    expect(screen.getByText("まだ組織がありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `pnpm test src/components/organization/OrganizationList.test.tsx`
Expected: FAIL。`Failed to resolve import "./OrganizationList"`

- [ ] **Step 4: `repository.ts` を実装する**

Create `src/features/organization/repository.ts`:

```ts
import "server-only";
import { prisma } from "@/shared/db/prisma";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
};

/**
 * ユーザーが所属する組織を参加した順に返す。
 * 所属していない組織はそもそも返さないため、この関数自体が絞り込みの境界になる。
 */
export const listOrganizationsForUser = async (
  userId: string,
): Promise<OrganizationSummary[]> => {
  const memberships = await prisma.organizationUser.findMany({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  return memberships.map((membership) => membership.organization);
};
```

- [ ] **Step 5: `OrganizationList` を実装する**

Create `src/components/organization/OrganizationList.tsx`:

```tsx
import Link from "next/link";
import type { OrganizationSummary } from "@/features/organization/repository";

export function OrganizationList({
  organizations,
}: {
  organizations: OrganizationSummary[];
}) {
  if (organizations.length === 0) {
    return <p className="text-sm text-slate-600">まだ組織がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {organizations.map((organization) => (
        <li
          key={organization.id}
          className="rounded border border-slate-200 bg-white px-4 py-3"
        >
          <Link
            href={`/orgs/${organization.slug}`}
            className="font-medium text-slate-800 underline"
          >
            {organization.name}
          </Link>
          <p className="text-xs text-slate-500">{organization.slug}</p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: テストを実行して成功を確認する**

Run: `pnpm test src/components/organization/OrganizationList.test.tsx`
Expected: PASS（2 件）

- [ ] **Step 7: `AppHeader` を作る**

Create `src/components/layout/AppHeader.tsx`:

```tsx
import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";

export type Crumb = {
  label: string;
  /** 省略した場合は現在地としてリンクにしない。 */
  href?: string;
};

export function AppHeader({
  crumbs,
  userName,
}: {
  crumbs: Crumb[];
  userName: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <nav aria-label="パンくず" className="flex items-center gap-2 text-sm">
        {crumbs.map((crumb, index) => (
          <span
            key={crumb.href ?? crumb.label}
            className="flex items-center gap-2"
          >
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
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-700">{userName}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
```

- [ ] **Step 8: `/` を組織一覧に差し替える**

Create `src/app/page.tsx`:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { OrganizationList } from "@/components/organization/OrganizationList";
import { listOrganizationsForUser } from "@/features/organization/repository";
import { requireSession } from "@/shared/middleware/require-session";

export default async function Home() {
  const session = await requireSession();
  const organizations = await listOrganizationsForUser(session.user.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader crumbs={[{ label: "組織" }]} userName={session.user.name} />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">組織</h1>
          <Link
            href="/orgs/new"
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white"
          >
            組織を作成
          </Link>
        </div>

        <OrganizationList organizations={organizations} />
      </div>
    </main>
  );
}
```

- [ ] **Step 9: 全体を通す**

```bash
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS

- [ ] **Step 10: 実際に動かして確認する**

`pnpm dev` を起動し、`http://localhost:3000/mock` で従来の Mock トーナメント表が表示されること、`http://localhost:3000/` で「まだ組織がありません」と「組織を作成」ボタンが表示されることを確認する。「組織を作成」のリンク先は Task 6 まで 404 になる。

- [ ] **Step 11: コミット**

```bash
git add -A
git commit -m "feat: add organization list page and move mock bracket to /mock"
```

---

## Task 6: 組織の作成（`/orgs/new`）

**Files:**
- Modify: `src/features/organization/state.ts`
- Create: `src/features/organization/create/schema.ts`
- Create: `src/features/organization/create/repository.ts`
- Create: `src/features/organization/create/usecase.ts`
- Create: `src/features/organization/create/handler.ts`
- Test: `src/features/organization/create/schema.test.ts`
- Test: `src/features/organization/create/usecase.test.ts`
- Create: `src/components/organization/OrganizationForm.tsx`
- Test: `src/components/organization/OrganizationForm.test.tsx`
- Create: `src/app/orgs/new/page.tsx`

**Interfaces:**
- Consumes: `validateSlug` / `slugViolationMessage` / `toOrganizationError` / `organizationErrorMessage` / `OrganizationFormState`（Task 4）、`requireSession`
- Produces:
  - `type OrganizationFormAction = (state: OrganizationFormState, formData: FormData) => Promise<OrganizationFormState>`
  - `createOrganizationSchema` / `type CreateOrganizationInput = { name: string; slug: string }`
  - `type CreateOrganizationPort = (input: CreateOrganizationInput & { ownerUserId: string }) => Effect.Effect<{ slug: string }, OrganizationError>`
  - `createOrganizationInDb: CreateOrganizationPort`
  - `createOrganization(port, input, ownerUserId): Effect.Effect<{ slug: string }, OrganizationError>`
  - `createOrganizationAction: OrganizationFormAction`
  - `<OrganizationForm action={...} submitLabel={...} defaultName={...} fixedSlug={...} />`

- [ ] **Step 1: `state.ts` にアクションの型を足す**

Modify `src/features/organization/state.ts` — 末尾に追記する。

```ts
/**
 * useActionState に渡す Server Action の形。フォーム側はこの型だけに依存し、
 * 具体的な Server Action は呼び出し元のページから渡す。
 */
export type OrganizationFormAction = (
  state: OrganizationFormState,
  formData: FormData,
) => Promise<OrganizationFormState>;
```

- [ ] **Step 2: `create/schema.ts` の失敗するテストを書く**

Create `src/features/organization/create/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createOrganizationSchema } from "./schema";

const parse = (input: { name: unknown; slug: unknown }) =>
  createOrganizationSchema.safeParse(input);

describe("createOrganizationSchema", () => {
  it("妥当な入力を通し、前後の空白を落とす", () => {
    const result = parse({ name: "  テニス部  ", slug: "  tennis  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "テニス部", slug: "tennis" });
    }
  });

  it("空の組織名を弾く", () => {
    const result = parse({ name: "   ", slug: "tennis" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("組織名を入力してください");
    }
  });

  it("100 文字超の組織名を弾く", () => {
    const result = parse({ name: "あ".repeat(101), slug: "tennis" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "組織名は100文字以内で入力してください",
      );
    }
  });

  it("slug の違反を domain の文言でそのまま返す", () => {
    const result = parse({ name: "テニス部", slug: "Tennis" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "組織 ID は半角英小文字・数字・ハイフンのみ使えます",
      );
    }
  });

  it("予約語の slug を弾く", () => {
    const result = parse({ name: "テニス部", slug: "new" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "この組織 ID は予約されているため使えません",
      );
    }
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `pnpm test src/features/organization/create/schema.test.ts`
Expected: FAIL。`Failed to resolve import "./schema"`

- [ ] **Step 4: `create/schema.ts` を実装する**

Create `src/features/organization/create/schema.ts`:

```ts
import { z } from "zod";
import { validateSlug } from "../domain";
import { slugViolationMessage } from "../messages";

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "組織名を入力してください")
        .max(100, "組織名は100文字以内で入力してください"),
    ),
  slug: z
    .string()
    .transform((raw) => raw.trim())
    .superRefine((value, ctx) => {
      // 検証の実体は domain 側に置き、スキーマからは呼ぶだけにする。
      // 文言もそこから引くことで、違反の種類と文言の対応が 1 箇所に集まる。
      const violation = validateSlug(value);
      if (violation !== null) {
        ctx.addIssue({
          code: "custom",
          message: slugViolationMessage(violation),
        });
      }
    }),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `pnpm test src/features/organization/create/schema.test.ts`
Expected: PASS（5 件）

- [ ] **Step 6: `create/repository.ts` を実装する**

Create `src/features/organization/create/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { type OrganizationError, toOrganizationError } from "../errors";
import { prisma } from "@/shared/db/prisma";
import type { CreateOrganizationInput } from "./schema";

export type CreateOrganizationPort = (
  input: CreateOrganizationInput & { ownerUserId: string },
) => Effect.Effect<{ slug: string }, OrganizationError>;

export const createOrganizationInDb: CreateOrganizationPort = (input) =>
  Effect.tryPromise({
    try: () =>
      prisma.organization.create({
        // 組織と OWNER の所属行は必ず同時に作る。片方だけ作られると
        // 誰にも見えない組織が残る。nested write なら 1 クエリで原子的に入る。
        data: {
          name: input.name,
          slug: input.slug,
          users: { create: { userId: input.ownerUserId, role: "OWNER" } },
        },
        select: { slug: true },
      }),
    catch: (reason) => toOrganizationError(reason, input.slug),
  });
```

- [ ] **Step 7: `create/usecase.ts` の失敗するテストを書く**

Create `src/features/organization/create/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { SlugTaken } from "../errors";
import { failureTag } from "@/shared/testing/exit";
import type { CreateOrganizationPort } from "./repository";
import { createOrganization } from "./usecase";

describe("createOrganization", () => {
  it("入力とオーナーの id を合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ slug: "tennis" }),
    ) as unknown as CreateOrganizationPort;

    const exit = await Effect.runPromiseExit(
      createOrganization(port, { name: "テニス部", slug: "tennis" }, "u1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      name: "テニス部",
      slug: "tennis",
      ownerUserId: "u1",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: CreateOrganizationPort = () =>
      Effect.fail(new SlugTaken({ slug: "tennis" }));

    const exit = await Effect.runPromiseExit(
      createOrganization(port, { name: "テニス部", slug: "tennis" }, "u1"),
    );

    expect(failureTag(exit)).toBe("SlugTaken");
  });
});
```

- [ ] **Step 8: テストを実行して失敗を確認する**

Run: `pnpm test src/features/organization/create/usecase.test.ts`
Expected: FAIL。`Failed to resolve import "./usecase"`

- [ ] **Step 9: `create/usecase.ts` を実装する**

Create `src/features/organization/create/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { OrganizationError } from "../errors";
import type { CreateOrganizationPort } from "./repository";
import type { CreateOrganizationInput } from "./schema";

/**
 * port を引数で受けるのは、テストで DB を差し替えられるようにするため。
 * 既存の features/auth/login/usecase.ts と同じ形にしている。
 */
export const createOrganization = (
  port: CreateOrganizationPort,
  input: CreateOrganizationInput,
  ownerUserId: string,
): Effect.Effect<{ slug: string }, OrganizationError> =>
  port({ ...input, ownerUserId });
```

- [ ] **Step 10: テストを実行して成功を確認する**

Run: `pnpm test src/features/organization/create/usecase.test.ts`
Expected: PASS（2 件）

- [ ] **Step 11: `create/handler.ts` を実装する**

Create `src/features/organization/create/handler.ts`:

```ts
"use server";

import { Cause, Effect, Exit, Option } from "effect";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { organizationErrorMessage } from "../messages";
import type { OrganizationFormState } from "../state";
import { requireSession } from "@/shared/middleware/require-session";
import { createOrganizationInDb } from "./repository";
import { createOrganizationSchema } from "./schema";
import { createOrganization } from "./usecase";

export const createOrganizationAction = async (
  _prevState: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> => {
  const session = await requireSession();

  const parsed = createOrganizationSchema.safeParse({
    // FormData は null を返しうる。空文字に寄せることで、型のエラーではなく
    // 「入力してください」という人間向けの文言に落ちる。
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    createOrganization(createOrganizationInDb, parsed.data, session.user.id),
  );

  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    return {
      error: Option.isSome(failure)
        ? organizationErrorMessage(failure.value)
        : "処理に失敗しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath("/");
  // redirect は例外を投げて制御を打ち切るため、Effect の実行が終わった後に呼ぶ。
  redirect(`/orgs/${exit.value.slug}`);
};
```

- [ ] **Step 12: `OrganizationForm` の失敗するテストを書く**

Create `src/components/organization/OrganizationForm.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationFormState } from "@/features/organization/state";
import { OrganizationForm } from "./OrganizationForm";

const noop = async (): Promise<OrganizationFormState> => ({ error: null });

/** render の container からフォーム要素を取り出す。 */
const formIn = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (!form) throw new Error("form が見つからない");
  return form;
};

describe("OrganizationForm", () => {
  it("fixedSlug が無いときは組織 ID を入力させる", () => {
    render(<OrganizationForm action={noop} submitLabel="作成する" />);

    expect(screen.getByLabelText("組織 ID")).toBeEnabled();
    expect(screen.getByRole("button", { name: "作成する" })).toBeInTheDocument();
  });

  it("fixedSlug があるときは組織 ID を入力させず、値だけ表示する", () => {
    // slug を変えると共有済みリンクが壊れるため、編集画面では変更させない。
    const { container } = render(
      <OrganizationForm
        action={noop}
        submitLabel="保存する"
        defaultName="テニス部"
        fixedSlug="tennis"
      />,
    );

    expect(screen.queryByLabelText("組織 ID")).not.toBeInTheDocument();
    expect(screen.getByText("tennis")).toBeInTheDocument();
    expect(
      container.querySelector('input[type="hidden"][name="slug"]'),
    ).toHaveValue("tennis");
  });

  it("既定値を組織名の入力に入れる", () => {
    render(
      <OrganizationForm
        action={noop}
        submitLabel="保存する"
        defaultName="テニス部"
        fixedSlug="tennis"
      />,
    );

    expect(screen.getByLabelText("組織名")).toHaveValue("テニス部");
  });

  it("送信すると入力値を FormData として action に渡す", async () => {
    const action = vi.fn(
      async (_state: OrganizationFormState, formData: FormData) => {
        expect(formData.get("name")).toBe("卓球部");
        expect(formData.get("slug")).toBe("table-tennis");
        return { error: null };
      },
    );

    const { container } = render(
      <OrganizationForm action={action} submitLabel="作成する" />,
    );

    fireEvent.change(screen.getByLabelText("組織名"), {
      target: { value: "卓球部" },
    });
    fireEvent.change(screen.getByLabelText("組織 ID"), {
      target: { value: "table-tennis" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("action がエラーを返したらアラートとして表示する", async () => {
    const action = async (): Promise<OrganizationFormState> => ({
      error: "この組織 ID は既に使われています",
    });

    const { container } = render(
      <OrganizationForm action={action} submitLabel="作成する" />,
    );

    fireEvent.submit(formIn(container));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "この組織 ID は既に使われています",
    );
  });
});
```

- [ ] **Step 13: テストを実行して失敗を確認する**

Run: `pnpm test src/components/organization/OrganizationForm.test.tsx`
Expected: FAIL。`Failed to resolve import "./OrganizationForm"`

- [ ] **Step 14: `OrganizationForm` を実装する**

Create `src/components/organization/OrganizationForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_ORGANIZATION_FORM_STATE,
  type OrganizationFormAction,
} from "@/features/organization/state";

export function OrganizationForm({
  action,
  submitLabel,
  defaultName = "",
  fixedSlug,
}: {
  action: OrganizationFormAction;
  submitLabel: string;
  defaultName?: string;
  /** 編集時に渡す。渡された場合、組織 ID は変更できず hidden で送るだけになる。 */
  fixedSlug?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ORGANIZATION_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          組織名
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {fixedSlug === undefined ? (
        <div className="space-y-1">
          <label
            htmlFor="slug"
            className="block text-sm font-medium text-slate-700"
          >
            組織 ID
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            URL に使う。半角英小文字・数字・ハイフンのみ。あとから変更できない
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="block text-sm font-medium text-slate-700">組織 ID</p>
          <p className="text-sm text-slate-600">{fixedSlug}</p>
          <input type="hidden" name="slug" value={fixedSlug} />
        </div>
      )}

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "送信中..." : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 15: テストを実行して成功を確認する**

Run: `pnpm test src/components/organization/OrganizationForm.test.tsx`
Expected: PASS（5 件）

- [ ] **Step 16: `/orgs/new` を作る**

Create `src/app/orgs/new/page.tsx`:

```tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { OrganizationForm } from "@/components/organization/OrganizationForm";
import { createOrganizationAction } from "@/features/organization/create/handler";
import { requireSession } from "@/shared/middleware/require-session";

export default async function NewOrganizationPage() {
  const session = await requireSession();

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[{ label: "組織", href: "/" }, { label: "組織を作成" }]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-sm space-y-6 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">組織を作成</h1>
        <OrganizationForm
          action={createOrganizationAction}
          submitLabel="作成する"
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 17: 全体を通す**

```bash
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS

- [ ] **Step 18: 実際に動かして確認する**

`pnpm dev` を起動して `http://localhost:3000/orgs/new` を開き、

1. 組織名「テニス部」・組織 ID「tennis」で作成すると `/orgs/tennis` へ遷移する（Task 7 まで 404 だが、URL が変わることを確認する）
2. `/` に戻ると一覧に「テニス部」が出ている
3. もう一度 `/orgs/new` で同じ組織 ID「tennis」を送ると「この組織 ID は既に使われています」が表示され、遷移しない
4. 組織 ID に「Tennis」を入れると「組織 ID は半角英小文字・数字・ハイフンのみ使えます」が表示される

- [ ] **Step 19: コミット**

```bash
git add -A
git commit -m "feat: add organization creation"
```

---

## Task 7: 組織の閲覧（`/orgs/[slug]`）と大会一覧

**Files:**
- Create: `src/features/tournament/status.ts`
- Create: `src/features/tournament/format.ts`
- Create: `src/features/tournament/repository.ts`
- Test: `src/features/tournament/format.test.ts`
- Create: `src/components/tournament/TournamentList.tsx`
- Test: `src/components/tournament/TournamentList.test.tsx`
- Create: `src/app/orgs/[slug]/page.tsx`

**Interfaces:**
- Consumes: `requireOrganization`（Task 3）、`AppHeader`（Task 5）
- Produces:
  - `TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string>`
  - `formatStartsAt(value: Date | null): string`
  - `toDateTimeLocalValue(value: Date | null): string`
  - `type TournamentSummary = { id: string; name: string; startsAt: Date | null; status: TournamentStatus }`
  - `type TournamentDetail = TournamentSummary & { createdAt: Date }`
  - `listTournamentsInOrganization(organizationId: string): Promise<TournamentSummary[]>`
  - `findTournamentInOrganization(organizationId: string, tournamentId: string): Promise<TournamentDetail | null>`
  - `<TournamentList slug={string} tournaments={TournamentSummary[]} />`

- [ ] **Step 1: `format.ts` の失敗するテストを書く**

Create `src/features/tournament/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatStartsAt, toDateTimeLocalValue } from "./format";

describe("formatStartsAt", () => {
  it("null を「未設定」にする", () => {
    expect(formatStartsAt(null)).toBe("未設定");
  });

  it("日時を年月日を含む文字列にする", () => {
    // 実行環境のタイムゾーンで表記が変わるため、年が含まれることだけを見る。
    expect(formatStartsAt(new Date(2026, 7, 29, 10, 5))).toContain("2026");
  });
});

describe("toDateTimeLocalValue", () => {
  it("null を空文字にする", () => {
    expect(toDateTimeLocalValue(null)).toBe("");
  });

  it("datetime-local が受け付ける形式に直す", () => {
    expect(toDateTimeLocalValue(new Date(2026, 7, 29, 10, 5))).toBe(
      "2026-08-29T10:05",
    );
  });

  it("1 桁の月・日・時・分をゼロ埋めする", () => {
    expect(toDateTimeLocalValue(new Date(2026, 0, 2, 3, 4))).toBe(
      "2026-01-02T03:04",
    );
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/features/tournament/format.test.ts`
Expected: FAIL。`Failed to resolve import "./format"`

- [ ] **Step 3: `status.ts` と `format.ts` を実装する**

Create `src/features/tournament/status.ts`:

```ts
import type { TournamentStatus } from "@/generated/prisma/enums";

/**
 * Record のキーを TournamentStatus に固定しているため、enum に値を足して
 * 文言を書き忘れるとコンパイルエラーになる。
 */
export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  DRAFT: "準備中",
  IN_PROGRESS: "進行中",
  COMPLETED: "完了",
};
```

Create `src/features/tournament/format.ts`:

```ts
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** 一覧・詳細での開始日時の表示。 */
export const formatStartsAt = (value: Date | null): string =>
  value === null ? "未設定" : DATE_TIME_FORMAT.format(value);

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * <input type="datetime-local"> の value 形式（YYYY-MM-DDTHH:mm）に直す。
 * ローカル時刻で組み立てるのは、入力欄がローカル時刻として解釈するため。
 * 作成・編集時のパース側（schema.ts の new Date）と対になっている。
 */
export const toDateTimeLocalValue = (value: Date | null): string => {
  if (value === null) return "";
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate(),
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm test src/features/tournament/format.test.ts`
Expected: PASS（5 件）

- [ ] **Step 5: `repository.ts` を実装する**

Create `src/features/tournament/repository.ts`:

```ts
import "server-only";
import type { TournamentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";

export type TournamentSummary = {
  id: string;
  name: string;
  startsAt: Date | null;
  status: TournamentStatus;
};

export type TournamentDetail = TournamentSummary & {
  createdAt: Date;
};

/** 大会一覧。startsAt は nullable で未設定の位置が定まらないため createdAt で並べる。 */
export const listTournamentsInOrganization = (
  organizationId: string,
): Promise<TournamentSummary[]> =>
  prisma.tournament.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, startsAt: true, status: true },
  });

/**
 * organizationId を where に含めるのが横断アクセス防止の要。
 * id だけで引いて後から所属を検証する形にすると、検証を書き忘れた箇所が
 * そのまま穴になる。この形なら書き忘れは「見つからない」に倒れる。
 */
export const findTournamentInOrganization = (
  organizationId: string,
  tournamentId: string,
): Promise<TournamentDetail | null> =>
  prisma.tournament.findFirst({
    where: { id: tournamentId, organizationId },
    select: {
      id: true,
      name: true,
      startsAt: true,
      status: true,
      createdAt: true,
    },
  });
```

- [ ] **Step 6: `TournamentList` の失敗するテストを書く**

Create `src/components/tournament/TournamentList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TournamentList } from "./TournamentList";

describe("TournamentList", () => {
  it("大会名を詳細ページへのリンクとして表示する", () => {
    render(
      <TournamentList
        slug="tennis"
        tournaments={[
          {
            id: "t1",
            name: "春季大会",
            startsAt: new Date(2026, 7, 29, 10, 0),
            status: "DRAFT",
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1",
    );
    expect(screen.getByText("準備中")).toBeInTheDocument();
  });

  it("開始日が未設定の大会にも「未設定」と出す", () => {
    render(
      <TournamentList
        slug="tennis"
        tournaments={[
          { id: "t1", name: "春季大会", startsAt: null, status: "DRAFT" },
        ]}
      />,
    );

    expect(screen.getByText("未設定")).toBeInTheDocument();
  });

  it("大会が無いときは空であることを伝える", () => {
    render(<TournamentList slug="tennis" tournaments={[]} />);

    expect(screen.getByText("まだ大会がありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
```

- [ ] **Step 7: テストを実行して失敗を確認する**

Run: `pnpm test src/components/tournament/TournamentList.test.tsx`
Expected: FAIL。`Failed to resolve import "./TournamentList"`

- [ ] **Step 8: `TournamentList` を実装する**

Create `src/components/tournament/TournamentList.tsx`:

```tsx
import Link from "next/link";
import { formatStartsAt } from "@/features/tournament/format";
import type { TournamentSummary } from "@/features/tournament/repository";
import { TOURNAMENT_STATUS_LABELS } from "@/features/tournament/status";

export function TournamentList({
  slug,
  tournaments,
}: {
  slug: string;
  tournaments: TournamentSummary[];
}) {
  if (tournaments.length === 0) {
    return <p className="text-sm text-slate-600">まだ大会がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {tournaments.map((tournament) => (
        <li
          key={tournament.id}
          className="rounded border border-slate-200 bg-white px-4 py-3"
        >
          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}`}
            className="font-medium text-slate-800 underline"
          >
            {tournament.name}
          </Link>
          <p className="text-xs text-slate-500">
            <span>{TOURNAMENT_STATUS_LABELS[tournament.status]}</span>
            {" / 開始 "}
            <span>{formatStartsAt(tournament.startsAt)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 9: テストを実行して成功を確認する**

Run: `pnpm test src/components/tournament/TournamentList.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 10: `/orgs/[slug]` を作る**

Create `src/app/orgs/[slug]/page.tsx`:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { TournamentList } from "@/components/tournament/TournamentList";
import { listTournamentsInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function OrganizationPage({
  params,
}: PageProps<"/orgs/[slug]">) {
  const { slug } = await params;
  const { session, organization } = await requireOrganization(slug);
  const tournaments = await listTournamentsInOrganization(organization.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[{ label: "組織", href: "/" }, { label: organization.name }]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {organization.name}
            </h1>
            <p className="text-xs text-slate-500">{organization.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/orgs/${slug}/edit`}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              組織を編集
            </Link>
            <Link
              href={`/orgs/${slug}/tournaments/new`}
              className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white"
            >
              大会を作成
            </Link>
          </div>
        </div>

        <h2 className="pt-4 text-sm font-bold text-slate-700">大会</h2>
        <TournamentList slug={slug} tournaments={tournaments} />
      </div>
    </main>
  );
}
```

- [ ] **Step 11: 全体を通す**

```bash
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS

- [ ] **Step 12: 実際に動かして確認する**

`pnpm dev` を起動し、

1. Task 6 で作った組織の `/orgs/tennis` が開き、「まだ大会がありません」が出る
2. 存在しない `/orgs/does-not-exist` が 404 になる
3. 別のユーザーで作った組織の slug を開いても 404 になる（`BYPASS_AUTH=1` と `USER_ID` Cookie で別ユーザーに切り替えて確認する。手順は README の「開発用の認証バイパス」を参照）

- [ ] **Step 13: コミット**

```bash
git add -A
git commit -m "feat: add organization detail page with tournament list"
```

---

## Task 8: 組織の編集と削除（`/orgs/[slug]/edit`）

**Files:**
- Create: `src/features/organization/update/{schema,repository,usecase,handler}.ts`
- Test: `src/features/organization/update/schema.test.ts`
- Test: `src/features/organization/update/usecase.test.ts`
- Create: `src/features/organization/delete/{schema,repository,usecase,handler}.ts`
- Test: `src/features/organization/delete/usecase.test.ts`
- Create: `src/components/organization/DeleteOrganizationForm.tsx`
- Test: `src/components/organization/DeleteOrganizationForm.test.tsx`
- Create: `src/app/orgs/[slug]/edit/page.tsx`

**Interfaces:**
- Consumes: `requireOrganization`、`OrganizationFormAction` / `OrganizationFormState`、`toOrganizationError` / `organizationErrorMessage`、`OrganizationForm`（Task 6、`fixedSlug` 付きで再利用する）
- Produces:
  - `updateOrganizationSchema` / `type UpdateOrganizationInput = { name: string }`
  - `type UpdateOrganizationPort = (input: { organizationId: string; name: string }) => Effect.Effect<void, OrganizationError>`
  - `updateOrganizationAction: OrganizationFormAction`
  - `type DeleteOrganizationPort = (input: { organizationId: string }) => Effect.Effect<void, OrganizationError>`
  - `deleteOrganizationAction: OrganizationFormAction`
  - `<DeleteOrganizationForm action={...} organizationName={string} slug={string} />`

`slug` は編集できないので、フォームからは hidden で送るだけにする。handler はその slug で `requireOrganization` を呼ぶため、送られた値が偽装されていても所属していない組織なら 404 になる。

- [ ] **Step 1: `update/schema.ts` の失敗するテストを書く**

Create `src/features/organization/update/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { updateOrganizationSchema } from "./schema";

describe("updateOrganizationSchema", () => {
  it("妥当な組織名を通し、前後の空白を落とす", () => {
    const result = updateOrganizationSchema.safeParse({ name: "  卓球部  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "卓球部" });
    }
  });

  it("空の組織名を弾く", () => {
    const result = updateOrganizationSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("組織名を入力してください");
    }
  });

  it("100 文字超の組織名を弾く", () => {
    const result = updateOrganizationSchema.safeParse({
      name: "あ".repeat(101),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "組織名は100文字以内で入力してください",
      );
    }
  });

  it("slug は受け付けない（編集できないため）", () => {
    const result = updateOrganizationSchema.safeParse({
      name: "卓球部",
      slug: "table-tennis",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("slug");
    }
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/features/organization/update/schema.test.ts`
Expected: FAIL。`Failed to resolve import "./schema"`

- [ ] **Step 3: `update/schema.ts` を実装する**

Create `src/features/organization/update/schema.ts`:

```ts
import { z } from "zod";

/**
 * slug を含めないのは、変更させないため。URL が変わると共有済みリンクと
 * ブックマークが黙って壊れる。フォームが送ってくる slug は組織の特定にだけ使い、
 * handler が requireOrganization へ渡す。
 */
export const updateOrganizationSchema = z.object({
  name: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "組織名を入力してください")
        .max(100, "組織名は100文字以内で入力してください"),
    ),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm test src/features/organization/update/schema.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: `update/repository.ts` を実装する**

Create `src/features/organization/update/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { type OrganizationError, toOrganizationError } from "../errors";
import { prisma } from "@/shared/db/prisma";

export type UpdateOrganizationPort = (input: {
  organizationId: string;
  name: string;
}) => Effect.Effect<void, OrganizationError>;

export const updateOrganizationInDb: UpdateOrganizationPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      await prisma.organization.update({
        where: { id: input.organizationId },
        data: { name: input.name },
      });
    },
    // 組織名に unique 制約はないため P2002 は起きないが、写像は
    // 作成側と同じ関数を通しておく。slug は使われないので空文字を渡す。
    catch: (reason) => toOrganizationError(reason, ""),
  });
```

- [ ] **Step 6: `update/usecase.ts` の失敗するテストを書く**

Create `src/features/organization/update/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { UnexpectedOrganizationError } from "../errors";
import { failureTag } from "@/shared/testing/exit";
import type { UpdateOrganizationPort } from "./repository";
import { updateOrganization } from "./usecase";

describe("updateOrganization", () => {
  it("組織 id と名前を port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.void,
    ) as unknown as UpdateOrganizationPort;

    const exit = await Effect.runPromiseExit(
      updateOrganization(port, { name: "卓球部" }, "o1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      name: "卓球部",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: UpdateOrganizationPort = () =>
      Effect.fail(new UnexpectedOrganizationError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      updateOrganization(port, { name: "卓球部" }, "o1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
  });
});
```

- [ ] **Step 7: テストを実行して失敗を確認する**

Run: `pnpm test src/features/organization/update/usecase.test.ts`
Expected: FAIL。`Failed to resolve import "./usecase"`

- [ ] **Step 8: `update/usecase.ts` を実装する**

Create `src/features/organization/update/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { OrganizationError } from "../errors";
import type { UpdateOrganizationPort } from "./repository";
import type { UpdateOrganizationInput } from "./schema";

export const updateOrganization = (
  port: UpdateOrganizationPort,
  input: UpdateOrganizationInput,
  organizationId: string,
): Effect.Effect<void, OrganizationError> =>
  port({ organizationId, name: input.name });
```

- [ ] **Step 9: テストを実行して成功を確認する**

Run: `pnpm test src/features/organization/update/usecase.test.ts`
Expected: PASS（2 件）

- [ ] **Step 10: `update/handler.ts` を実装する**

Create `src/features/organization/update/handler.ts`:

```ts
"use server";

import { Cause, Effect, Exit, Option } from "effect";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { organizationErrorMessage } from "../messages";
import type { OrganizationFormState } from "../state";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { updateOrganizationInDb } from "./repository";
import { updateOrganizationSchema } from "./schema";
import { updateOrganization } from "./usecase";

export const updateOrganizationAction = async (
  _prevState: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> => {
  const slug = String(formData.get("slug") ?? "");
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  // slug が偽装されていても、所属していない組織なら 404 になる。
  const { organization } = await requireOrganization(slug);

  const parsed = updateOrganizationSchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    updateOrganization(updateOrganizationInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    return {
      error: Option.isSome(failure)
        ? organizationErrorMessage(failure.value)
        : "処理に失敗しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath("/");
  revalidatePath(`/orgs/${slug}`);
  redirect(`/orgs/${slug}`);
};
```

- [ ] **Step 11: 削除スライスを実装する**

Create `src/features/organization/delete/schema.ts`:

```ts
import { z } from "zod";

/**
 * 組織の削除は Cascade で大会・メンバーまで消える。押し間違いが効かないよう、
 * 組織名の入力を求める。実際の一致判定は handler が DB の値と突き合わせる。
 */
export const deleteOrganizationSchema = z.object({
  confirmName: z.string().transform((raw) => raw.trim()),
});

export type DeleteOrganizationInput = z.infer<typeof deleteOrganizationSchema>;
```

Create `src/features/organization/delete/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { type OrganizationError, toOrganizationError } from "../errors";
import { prisma } from "@/shared/db/prisma";

export type DeleteOrganizationPort = (input: {
  organizationId: string;
}) => Effect.Effect<void, OrganizationError>;

export const deleteOrganizationInDb: DeleteOrganizationPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      await prisma.organization.delete({ where: { id: input.organizationId } });
    },
    catch: (reason) => toOrganizationError(reason, ""),
  });
```

Create `src/features/organization/delete/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { OrganizationError } from "../errors";
import type { DeleteOrganizationPort } from "./repository";

export const deleteOrganization = (
  port: DeleteOrganizationPort,
  organizationId: string,
): Effect.Effect<void, OrganizationError> => port({ organizationId });
```

Create `src/features/organization/delete/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { UnexpectedOrganizationError } from "../errors";
import { failureTag } from "@/shared/testing/exit";
import type { DeleteOrganizationPort } from "./repository";
import { deleteOrganization } from "./usecase";

describe("deleteOrganization", () => {
  it("組織 id を port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.void,
    ) as unknown as DeleteOrganizationPort;

    const exit = await Effect.runPromiseExit(deleteOrganization(port, "o1"));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ organizationId: "o1" });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: DeleteOrganizationPort = () =>
      Effect.fail(new UnexpectedOrganizationError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(deleteOrganization(port, "o1"));

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
  });
});
```

Create `src/features/organization/delete/handler.ts`:

```ts
"use server";

import { Cause, Effect, Exit, Option } from "effect";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { organizationErrorMessage } from "../messages";
import type { OrganizationFormState } from "../state";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { deleteOrganizationInDb } from "./repository";
import { deleteOrganizationSchema } from "./schema";
import { deleteOrganization } from "./usecase";

export const deleteOrganizationAction = async (
  _prevState: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = deleteOrganizationSchema.safeParse({
    confirmName: String(formData.get("confirmName") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // クライアント側の入力チェックは体感のためのもので、境界はここ。
  // Server Action は誰でも直接叩ける。
  if (parsed.data.confirmName !== organization.name) {
    return { error: "組織名が一致しません" };
  }

  const exit = await Effect.runPromiseExit(
    deleteOrganization(deleteOrganizationInDb, organization.id),
  );

  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    return {
      error: Option.isSome(failure)
        ? organizationErrorMessage(failure.value)
        : "処理に失敗しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath("/");
  redirect("/");
};
```

- [ ] **Step 12: テストを実行して成功を確認する**

Run: `pnpm test src/features/organization/delete/usecase.test.ts`
Expected: PASS（2 件）

- [ ] **Step 13: `DeleteOrganizationForm` の失敗するテストを書く**

Create `src/components/organization/DeleteOrganizationForm.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationFormState } from "@/features/organization/state";
import { DeleteOrganizationForm } from "./DeleteOrganizationForm";

const noop = async (): Promise<OrganizationFormState> => ({ error: null });

const formIn = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (!form) throw new Error("form が見つからない");
  return form;
};

describe("DeleteOrganizationForm", () => {
  it("削除で何が消えるかを明示する", () => {
    render(
      <DeleteOrganizationForm
        action={noop}
        organizationName="テニス部"
        slug="tennis"
      />,
    );

    expect(
      screen.getByText(/大会とメンバーもすべて削除されます/),
    ).toBeInTheDocument();
  });

  it("組織名が一致するまで削除ボタンを押せない", () => {
    render(
      <DeleteOrganizationForm
        action={noop}
        organizationName="テニス部"
        slug="tennis"
      />,
    );

    const button = screen.getByRole("button", { name: "この組織を削除する" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("確認のため組織名を入力"), {
      target: { value: "テニス" },
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("確認のため組織名を入力"), {
      target: { value: "テニス部" },
    });
    expect(button).toBeEnabled();
  });

  it("送信すると slug と入力値を action に渡す", async () => {
    const action = vi.fn(
      async (_state: OrganizationFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("confirmName")).toBe("テニス部");
        return { error: null };
      },
    );

    const { container } = render(
      <DeleteOrganizationForm
        action={action}
        organizationName="テニス部"
        slug="tennis"
      />,
    );

    fireEvent.change(screen.getByLabelText("確認のため組織名を入力"), {
      target: { value: "テニス部" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("action がエラーを返したらアラートとして表示する", async () => {
    const action = async (): Promise<OrganizationFormState> => ({
      error: "組織名が一致しません",
    });

    const { container } = render(
      <DeleteOrganizationForm
        action={action}
        organizationName="テニス部"
        slug="tennis"
      />,
    );

    fireEvent.submit(formIn(container));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "組織名が一致しません",
    );
  });
});
```

- [ ] **Step 14: テストを実行して失敗を確認する**

Run: `pnpm test src/components/organization/DeleteOrganizationForm.test.tsx`
Expected: FAIL。`Failed to resolve import "./DeleteOrganizationForm"`

- [ ] **Step 15: `DeleteOrganizationForm` を実装する**

Create `src/components/organization/DeleteOrganizationForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_ORGANIZATION_FORM_STATE,
  type OrganizationFormAction,
} from "@/features/organization/state";

export function DeleteOrganizationForm({
  action,
  organizationName,
  slug,
}: {
  action: OrganizationFormAction;
  organizationName: string;
  slug: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ORGANIZATION_FORM_STATE,
  );
  const [confirmName, setConfirmName] = useState("");

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-red-200 bg-red-50 p-4"
    >
      <h2 className="text-sm font-bold text-red-800">組織を削除</h2>
      <p className="text-xs text-red-700">
        この組織に属する大会とメンバーもすべて削除されます。元に戻せません。
      </p>

      <input type="hidden" name="slug" value={slug} />

      <div className="space-y-1">
        <label
          htmlFor="confirmName"
          className="block text-sm font-medium text-red-800"
        >
          確認のため組織名を入力
        </label>
        <input
          id="confirmName"
          name="confirmName"
          type="text"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          className="w-full rounded border border-red-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        // ボタンの活性はあくまで体感のためで、境界ではない。
        // 一致の判定は handler が DB の値と突き合わせて行う。
        disabled={pending || confirmName !== organizationName}
        className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "削除中..." : "この組織を削除する"}
      </button>
    </form>
  );
}
```

- [ ] **Step 16: テストを実行して成功を確認する**

Run: `pnpm test src/components/organization/DeleteOrganizationForm.test.tsx`
Expected: PASS（4 件）

- [ ] **Step 17: `/orgs/[slug]/edit` を作る**

Create `src/app/orgs/[slug]/edit/page.tsx`:

```tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { DeleteOrganizationForm } from "@/components/organization/DeleteOrganizationForm";
import { OrganizationForm } from "@/components/organization/OrganizationForm";
import { deleteOrganizationAction } from "@/features/organization/delete/handler";
import { updateOrganizationAction } from "@/features/organization/update/handler";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function EditOrganizationPage({
  params,
}: PageProps<"/orgs/[slug]/edit">) {
  const { slug } = await params;
  const { session, organization } = await requireOrganization(slug);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "編集" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-sm space-y-8 px-6 py-8">
        <div className="space-y-4">
          <h1 className="text-lg font-bold text-slate-800">組織を編集</h1>
          <OrganizationForm
            action={updateOrganizationAction}
            submitLabel="保存する"
            defaultName={organization.name}
            fixedSlug={organization.slug}
          />
        </div>

        <DeleteOrganizationForm
          action={deleteOrganizationAction}
          organizationName={organization.name}
          slug={organization.slug}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 18: 全体を通す**

```bash
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS

- [ ] **Step 19: 実際に動かして確認する**

`pnpm dev` を起動し、

1. `/orgs/tennis/edit` で組織名を「テニス部A」に変えて保存すると `/orgs/tennis` に戻り、名前が変わっている
2. `/` の一覧でも名前が変わっている
3. 組織 ID は入力欄ではなくテキストとして表示され、変更できない
4. 削除の確認欄に誤った名前を入れているあいだはボタンが押せない
5. 正しい名前を入れて削除すると `/` に戻り、一覧から消えている

- [ ] **Step 20: コミット**

```bash
git add -A
git commit -m "feat: add organization edit and delete"
```

---

## Task 9: 大会の作成（`/orgs/[slug]/tournaments/new`）

**Files:**
- Create: `src/features/tournament/errors.ts`
- Create: `src/features/tournament/messages.ts`
- Create: `src/features/tournament/state.ts`
- Test: `src/features/tournament/errors.test.ts`
- Test: `src/features/tournament/messages.test.ts`
- Create: `src/features/tournament/create/{schema,repository,usecase,handler}.ts`
- Test: `src/features/tournament/create/schema.test.ts`
- Test: `src/features/tournament/create/usecase.test.ts`
- Create: `src/components/tournament/TournamentForm.tsx`
- Test: `src/components/tournament/TournamentForm.test.tsx`
- Create: `src/app/orgs/[slug]/tournaments/new/page.tsx`

**Interfaces:**
- Consumes: `requireOrganization`、`toDateTimeLocalValue`（Task 7）
- Produces:
  - `class UnexpectedTournamentError` / `type TournamentError` / `toTournamentError(reason: unknown): TournamentError`
  - `tournamentErrorMessage(error: TournamentError): string`
  - `type TournamentFormState = { error: string | null }` / `INITIAL_TOURNAMENT_FORM_STATE` / `type TournamentFormAction`
  - `createTournamentSchema` / `type CreateTournamentInput = { name: string; startsAt: Date | null }`
  - `type CreateTournamentPort = (input: CreateTournamentInput & { organizationId: string }) => Effect.Effect<{ id: string }, TournamentError>`
  - `createTournamentAction: TournamentFormAction`
  - `<TournamentForm action={...} slug={string} submitLabel={string} defaultName={...} defaultStartsAt={...} tournamentId={...} />`

- [ ] **Step 1: `errors.ts` の失敗するテストを書く**

Create `src/features/tournament/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toTournamentError } from "./errors";

describe("toTournamentError", () => {
  it("例外を UnexpectedTournamentError に包み、原因を残す", () => {
    const cause = new Error("network");
    const error = toTournamentError(cause);

    expect(error._tag).toBe("UnexpectedTournamentError");
    expect(error).toMatchObject({ reason: cause });
  });

  it("Error 以外の値も握り潰さず reason に残す", () => {
    const error = toTournamentError("なにか");

    expect(error._tag).toBe("UnexpectedTournamentError");
    expect(error).toMatchObject({ reason: "なにか" });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/features/tournament/errors.test.ts`
Expected: FAIL。`Failed to resolve import "./errors"`

- [ ] **Step 3: `errors.ts` / `messages.ts` / `state.ts` を実装する**

Create `src/features/tournament/errors.ts`:

```ts
import { Data } from "effect";

export class UnexpectedTournamentError extends Data.TaggedError(
  "UnexpectedTournamentError",
)<{
  readonly reason: unknown;
}> {}

/**
 * 大会には unique 制約による衝突がないため、固有のドメインエラーを持たない。
 * 種類が増えたらここに足し、messages.ts の Match.exhaustive がコンパイル時に
 * 文言の追加を要求する。
 */
export type TournamentError = UnexpectedTournamentError;

export const toTournamentError = (reason: unknown): TournamentError =>
  new UnexpectedTournamentError({ reason });
```

Create `src/features/tournament/messages.ts`:

```ts
import { Match } from "effect";
import type { TournamentError } from "./errors";

export const tournamentErrorMessage: (error: TournamentError) => string =
  Match.type<TournamentError>().pipe(
    Match.tag(
      "UnexpectedTournamentError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
```

Create `src/features/tournament/state.ts`:

```ts
export type TournamentFormState = {
  error: string | null;
};

export const INITIAL_TOURNAMENT_FORM_STATE: TournamentFormState = {
  error: null,
};

export type TournamentFormAction = (
  state: TournamentFormState,
  formData: FormData,
) => Promise<TournamentFormState>;
```

Create `src/features/tournament/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { UnexpectedTournamentError } from "./errors";
import { tournamentErrorMessage } from "./messages";

describe("tournamentErrorMessage", () => {
  it("UnexpectedTournamentError に汎用の文言を返す", () => {
    expect(
      tournamentErrorMessage(
        new UnexpectedTournamentError({ reason: new Error("x") }),
      ),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm test src/features/tournament`
Expected: PASS（`errors.test.ts` 2 件、`messages.test.ts` 1 件、`format.test.ts` 5 件）

- [ ] **Step 5: `create/schema.ts` の失敗するテストを書く**

Create `src/features/tournament/create/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTournamentSchema } from "./schema";

const parse = (input: { name: unknown; startsAt: unknown }) =>
  createTournamentSchema.safeParse(input);

describe("createTournamentSchema", () => {
  it("妥当な入力を通し、前後の空白を落とす", () => {
    const result = parse({ name: "  春季大会  ", startsAt: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "春季大会", startsAt: null });
    }
  });

  it("空の開始日時を null にする", () => {
    const result = parse({ name: "春季大会", startsAt: "   " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startsAt).toBeNull();
    }
  });

  it("datetime-local の値をローカル時刻の Date にする", () => {
    const result = parse({ name: "春季大会", startsAt: "2026-08-29T10:05" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startsAt).toEqual(new Date(2026, 7, 29, 10, 5));
    }
  });

  it("日時として読めない値を弾く", () => {
    const result = parse({ name: "春季大会", startsAt: "きのう" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "開始日時の形式が正しくありません",
      );
    }
  });

  it("空の大会名を弾く", () => {
    const result = parse({ name: "   ", startsAt: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("大会名を入力してください");
    }
  });

  it("100 文字超の大会名を弾く", () => {
    const result = parse({ name: "あ".repeat(101), startsAt: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "大会名は100文字以内で入力してください",
      );
    }
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `pnpm test src/features/tournament/create/schema.test.ts`
Expected: FAIL。`Failed to resolve import "./schema"`

- [ ] **Step 7: `create/schema.ts` を実装する**

Create `src/features/tournament/create/schema.ts`:

```ts
import { z } from "zod";

/**
 * 開始日時は任意。<input type="datetime-local"> は未入力を空文字で送ってくるため、
 * 空文字を null に畳んでから Date にする。Date.parse はローカル時刻として
 * 解釈するので、表示側の toDateTimeLocalValue と対になる。
 */
const startsAtSchema = z
  .string()
  .transform((raw) => raw.trim())
  .refine(
    (value) => value === "" || !Number.isNaN(Date.parse(value)),
    "開始日時の形式が正しくありません",
  )
  .transform((value) => (value === "" ? null : new Date(value)));

export const createTournamentSchema = z.object({
  name: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "大会名を入力してください")
        .max(100, "大会名は100文字以内で入力してください"),
    ),
  startsAt: startsAtSchema,
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `pnpm test src/features/tournament/create/schema.test.ts`
Expected: PASS（6 件）

- [ ] **Step 9: `create/repository.ts` と `create/usecase.ts` を実装する**

Create `src/features/tournament/create/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { type TournamentError, toTournamentError } from "../errors";
import { prisma } from "@/shared/db/prisma";
import type { CreateTournamentInput } from "./schema";

export type CreateTournamentPort = (
  input: CreateTournamentInput & { organizationId: string },
) => Effect.Effect<{ id: string }, TournamentError>;

export const createTournamentInDb: CreateTournamentPort = (input) =>
  Effect.tryPromise({
    try: () =>
      prisma.tournament.create({
        // status は既定の DRAFT のまま。遷移は結果入力機能と一緒に設計する。
        data: {
          organizationId: input.organizationId,
          name: input.name,
          startsAt: input.startsAt,
        },
        select: { id: true },
      }),
    catch: toTournamentError,
  });
```

Create `src/features/tournament/create/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { CreateTournamentPort } from "./repository";
import type { CreateTournamentInput } from "./schema";

export const createTournament = (
  port: CreateTournamentPort,
  input: CreateTournamentInput,
  organizationId: string,
): Effect.Effect<{ id: string }, TournamentError> =>
  port({ ...input, organizationId });
```

Create `src/features/tournament/create/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { UnexpectedTournamentError } from "../errors";
import { failureTag } from "@/shared/testing/exit";
import type { CreateTournamentPort } from "./repository";
import { createTournament } from "./usecase";

const input = { name: "春季大会", startsAt: null };

describe("createTournament", () => {
  it("入力と組織 id を合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ id: "t1" }),
    ) as unknown as CreateTournamentPort;

    const exit = await Effect.runPromiseExit(
      createTournament(port, input, "o1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      name: "春季大会",
      startsAt: null,
      organizationId: "o1",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: CreateTournamentPort = () =>
      Effect.fail(new UnexpectedTournamentError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      createTournament(port, input, "o1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
```

- [ ] **Step 10: テストを実行して成功を確認する**

Run: `pnpm test src/features/tournament/create/usecase.test.ts`
Expected: PASS（2 件）

- [ ] **Step 11: `create/handler.ts` を実装する**

Create `src/features/tournament/create/handler.ts`:

```ts
"use server";

import { Cause, Effect, Exit, Option } from "effect";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { tournamentErrorMessage } from "../messages";
import type { TournamentFormState } from "../state";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { createTournamentInDb } from "./repository";
import { createTournamentSchema } from "./schema";
import { createTournament } from "./usecase";

export const createTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = createTournamentSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    createTournament(createTournamentInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    return {
      error: Option.isSome(failure)
        ? tournamentErrorMessage(failure.value)
        : "処理に失敗しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath(`/orgs/${slug}`);
  redirect(`/orgs/${slug}/tournaments/${exit.value.id}`);
};
```

- [ ] **Step 12: `TournamentForm` の失敗するテストを書く**

Create `src/components/tournament/TournamentForm.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TournamentFormState } from "@/features/tournament/state";
import { TournamentForm } from "./TournamentForm";

const noop = async (): Promise<TournamentFormState> => ({ error: null });

const formIn = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (!form) throw new Error("form が見つからない");
  return form;
};

describe("TournamentForm", () => {
  it("slug を hidden で送る", () => {
    const { container } = render(
      <TournamentForm action={noop} slug="tennis" submitLabel="作成する" />,
    );

    expect(
      container.querySelector('input[type="hidden"][name="slug"]'),
    ).toHaveValue("tennis");
  });

  it("tournamentId を渡したときだけ hidden で送る", () => {
    const { container, rerender } = render(
      <TournamentForm action={noop} slug="tennis" submitLabel="作成する" />,
    );
    expect(
      container.querySelector('input[type="hidden"][name="tournamentId"]'),
    ).toBeNull();

    rerender(
      <TournamentForm
        action={noop}
        slug="tennis"
        submitLabel="保存する"
        tournamentId="t1"
      />,
    );
    expect(
      container.querySelector('input[type="hidden"][name="tournamentId"]'),
    ).toHaveValue("t1");
  });

  it("既定値を各入力に入れる", () => {
    render(
      <TournamentForm
        action={noop}
        slug="tennis"
        submitLabel="保存する"
        defaultName="春季大会"
        defaultStartsAt="2026-08-29T10:05"
      />,
    );

    expect(screen.getByLabelText("大会名")).toHaveValue("春季大会");
    expect(screen.getByLabelText("開始日時")).toHaveValue("2026-08-29T10:05");
  });

  it("送信すると入力値を FormData として action に渡す", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("name")).toBe("秋季大会");
        expect(formData.get("startsAt")).toBe("2026-10-01T09:00");
        return { error: null };
      },
    );

    const { container } = render(
      <TournamentForm action={action} slug="tennis" submitLabel="作成する" />,
    );

    fireEvent.change(screen.getByLabelText("大会名"), {
      target: { value: "秋季大会" },
    });
    fireEvent.change(screen.getByLabelText("開始日時"), {
      target: { value: "2026-10-01T09:00" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("action がエラーを返したらアラートとして表示する", async () => {
    const action = async (): Promise<TournamentFormState> => ({
      error: "大会名を入力してください",
    });

    const { container } = render(
      <TournamentForm action={action} slug="tennis" submitLabel="作成する" />,
    );

    fireEvent.submit(formIn(container));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "大会名を入力してください",
    );
  });
});
```

- [ ] **Step 13: テストを実行して失敗を確認する**

Run: `pnpm test src/components/tournament/TournamentForm.test.tsx`
Expected: FAIL。`Failed to resolve import "./TournamentForm"`

- [ ] **Step 14: `TournamentForm` を実装する**

Create `src/components/tournament/TournamentForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";

export function TournamentForm({
  action,
  slug,
  submitLabel,
  defaultName = "",
  defaultStartsAt = "",
  tournamentId,
}: {
  action: TournamentFormAction;
  slug: string;
  submitLabel: string;
  defaultName?: string;
  /** toDateTimeLocalValue で作った YYYY-MM-DDTHH:mm 形式の文字列。 */
  defaultStartsAt?: string;
  /** 編集時に渡す。どの大会を更新するかを handler へ伝える。 */
  tournamentId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TOURNAMENT_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      {tournamentId !== undefined && (
        <input type="hidden" name="tournamentId" value={tournamentId} />
      )}

      <div className="space-y-1">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          大会名
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="startsAt"
          className="block text-sm font-medium text-slate-700"
        >
          開始日時
        </label>
        <input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          defaultValue={defaultStartsAt}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-500">未定なら空のままでよい</p>
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "送信中..." : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 15: テストを実行して成功を確認する**

Run: `pnpm test src/components/tournament/TournamentForm.test.tsx`
Expected: PASS（5 件）

- [ ] **Step 16: `/orgs/[slug]/tournaments/new` を作る**

Create `src/app/orgs/[slug]/tournaments/new/page.tsx`:

```tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { TournamentForm } from "@/components/tournament/TournamentForm";
import { createTournamentAction } from "@/features/tournament/create/handler";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function NewTournamentPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/new">) {
  const { slug } = await params;
  const { session, organization } = await requireOrganization(slug);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "大会を作成" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-sm space-y-6 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">大会を作成</h1>
        <TournamentForm
          action={createTournamentAction}
          slug={slug}
          submitLabel="作成する"
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 17: 全体を通す**

```bash
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS

- [ ] **Step 18: 実際に動かして確認する**

`pnpm dev` を起動し、

1. `/orgs/tennis/tournaments/new` で「春季大会」を開始日時なしで作成すると、`/orgs/tennis/tournaments/<id>` へ遷移する（Task 10 まで 404 だが URL が変わることを確認する）
2. `/orgs/tennis` に戻ると一覧に「春季大会 / 準備中 / 開始 未設定」が出ている
3. 開始日時を入れて作った大会は、一覧に日時が表示される

- [ ] **Step 19: コミット**

```bash
git add -A
git commit -m "feat: add tournament creation"
```

---

## Task 10: 大会の閲覧（`/orgs/[slug]/tournaments/[tournamentId]`）

**Files:**
- Create: `src/components/tournament/TournamentDetail.tsx`
- Test: `src/components/tournament/TournamentDetail.test.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`

**Interfaces:**
- Consumes: `findTournamentInOrganization` / `TournamentDetail`（Task 7 の repository）、`formatStartsAt`、`TOURNAMENT_STATUS_LABELS`、`requireOrganization`
- Produces: `<TournamentDetailView slug={string} tournament={TournamentDetail} />`

コンポーネント名を `TournamentDetailView` にするのは、repository が export する型 `TournamentDetail` と名前が衝突しないようにするため。

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/tournament/TournamentDetail.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TournamentDetailView } from "./TournamentDetail";

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: new Date(2026, 7, 29, 10, 5),
  status: "DRAFT" as const,
  createdAt: new Date(2026, 7, 1, 9, 0),
};

describe("TournamentDetailView", () => {
  it("大会名とステータスの日本語表記を表示する", () => {
    render(<TournamentDetailView slug="tennis" tournament={tournament} />);

    expect(
      screen.getByRole("heading", { name: "春季大会" }),
    ).toBeInTheDocument();
    expect(screen.getByText("準備中")).toBeInTheDocument();
  });

  it("開始日時が未設定なら「未設定」と出す", () => {
    render(
      <TournamentDetailView
        slug="tennis"
        tournament={{ ...tournament, startsAt: null }}
      />,
    );

    expect(screen.getByText("未設定")).toBeInTheDocument();
  });

  it("編集ページへのリンクを持つ", () => {
    render(<TournamentDetailView slug="tennis" tournament={tournament} />);

    expect(screen.getByRole("link", { name: "大会を編集" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1/edit",
    );
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test src/components/tournament/TournamentDetail.test.tsx`
Expected: FAIL。`Failed to resolve import "./TournamentDetail"`

- [ ] **Step 3: 実装を書く**

Create `src/components/tournament/TournamentDetail.tsx`:

```tsx
import Link from "next/link";
import { formatStartsAt } from "@/features/tournament/format";
import type { TournamentDetail } from "@/features/tournament/repository";
import { TOURNAMENT_STATUS_LABELS } from "@/features/tournament/status";

export function TournamentDetailView({
  slug,
  tournament,
}: {
  slug: string;
  tournament: TournamentDetail;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <h1 className="text-lg font-bold text-slate-800">{tournament.name}</h1>
        <Link
          href={`/orgs/${slug}/tournaments/${tournament.id}/edit`}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
        >
          大会を編集
        </Link>
      </div>

      <dl className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">ステータス</dt>
          <dd className="text-slate-800">
            {TOURNAMENT_STATUS_LABELS[tournament.status]}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">開始日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(tournament.startsAt)}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">作成日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(tournament.createdAt)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm test src/components/tournament/TournamentDetail.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 5: 大会の閲覧ページを作る**

Create `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { TournamentDetailView } from "@/components/tournament/TournamentDetail";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: tournament.name },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl px-6 py-8">
        <TournamentDetailView slug={slug} tournament={tournament} />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: 全体を通す**

```bash
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS

- [ ] **Step 7: 実際に動かして確認する**

`pnpm dev` を起動し、

1. `/orgs/tennis` の一覧から大会名をクリックすると詳細が開く
2. 存在しない大会 ID を URL に入れると 404 になる
3. **別の組織に属する大会の ID を、自分の組織の URL に入れても 404 になる**（横断アクセス防止の確認。組織を 2 つ作り、片方の大会 ID をもう片方の URL に貼って試す）

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: add tournament detail page"
```

---

## Task 11: 大会の編集と削除（`/orgs/[slug]/tournaments/[tournamentId]/edit`）

**Files:**
- Create: `src/features/tournament/update/{schema,repository,usecase,handler}.ts`
- Test: `src/features/tournament/update/usecase.test.ts`
- Create: `src/features/tournament/delete/{schema,repository,usecase,handler}.ts`
- Test: `src/features/tournament/delete/usecase.test.ts`
- Create: `src/components/tournament/DeleteTournamentForm.tsx`
- Test: `src/components/tournament/DeleteTournamentForm.test.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx`

**Interfaces:**
- Consumes: `TournamentForm`（Task 9、`tournamentId` 付きで再利用）、`findTournamentInOrganization`、`toDateTimeLocalValue`、`requireOrganization`
- Produces:
  - `updateTournamentSchema`（`createTournamentSchema` と同じ形）
  - `type UpdateTournamentPort = (input: { organizationId: string; tournamentId: string; name: string; startsAt: Date | null }) => Effect.Effect<{ updated: number }, TournamentError>`
  - `updateTournamentAction: TournamentFormAction`
  - `type DeleteTournamentPort = (input: { organizationId: string; tournamentId: string }) => Effect.Effect<{ deleted: number }, TournamentError>`
  - `deleteTournamentAction: TournamentFormAction`
  - `<DeleteTournamentForm action={...} tournamentName={string} slug={string} tournamentId={string} />`

**なぜ `updateMany` / `deleteMany` を使うか:** Prisma の `update` / `delete` は unique な `where` しか受け付けないため、`where` が `{ id }` だけになり `organizationId` を含められない。`updateMany` / `deleteMany` なら `{ id, organizationId }` のまま 1 クエリで書き換えられ、他組織の大会には決して当たらない。件数が 0 なら `notFound()` を返す。

- [ ] **Step 1: 更新スライスを実装する**

Create `src/features/tournament/update/schema.ts`:

```ts
import { z } from "zod";

/**
 * 入力の形は作成時と同じ。スキーマを create から import しないのは、
 * 同列スライスへの依存を禁じているため。共通化するなら features/tournament
 * 直下へ引き上げることになるが、今のところ 2 箇所の重複で済むので置かない。
 */
const startsAtSchema = z
  .string()
  .transform((raw) => raw.trim())
  .refine(
    (value) => value === "" || !Number.isNaN(Date.parse(value)),
    "開始日時の形式が正しくありません",
  )
  .transform((value) => (value === "" ? null : new Date(value)));

export const updateTournamentSchema = z.object({
  name: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "大会名を入力してください")
        .max(100, "大会名は100文字以内で入力してください"),
    ),
  startsAt: startsAtSchema,
});

export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
```

Create `src/features/tournament/update/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { type TournamentError, toTournamentError } from "../errors";
import { prisma } from "@/shared/db/prisma";

export type UpdateTournamentPort = (input: {
  organizationId: string;
  tournamentId: string;
  name: string;
  startsAt: Date | null;
}) => Effect.Effect<{ updated: number }, TournamentError>;

export const updateTournamentInDb: UpdateTournamentPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany を使うのは where に organizationId を残したまま更新するため。
      // update は unique な where しか受け付けず、id 単独になってしまう。
      const result = await prisma.tournament.updateMany({
        where: { id: input.tournamentId, organizationId: input.organizationId },
        data: { name: input.name, startsAt: input.startsAt },
      });
      return { updated: result.count };
    },
    catch: toTournamentError,
  });
```

Create `src/features/tournament/update/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { UpdateTournamentPort } from "./repository";
import type { UpdateTournamentInput } from "./schema";

export const updateTournament = (
  port: UpdateTournamentPort,
  input: UpdateTournamentInput,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ updated: number }, TournamentError> =>
  port({
    organizationId,
    tournamentId,
    name: input.name,
    startsAt: input.startsAt,
  });
```

Create `src/features/tournament/update/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { UnexpectedTournamentError } from "../errors";
import { failureTag } from "@/shared/testing/exit";
import type { UpdateTournamentPort } from "./repository";
import { updateTournament } from "./usecase";

const input = { name: "春季大会", startsAt: null };

describe("updateTournament", () => {
  it("組織 id と大会 id を両方 port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ updated: 1 }),
    ) as unknown as UpdateTournamentPort;

    const exit = await Effect.runPromiseExit(
      updateTournament(port, input, "o1", "t1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    // organizationId が落ちると他組織の大会を書き換えられてしまう。
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      name: "春季大会",
      startsAt: null,
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: UpdateTournamentPort = () =>
      Effect.fail(new UnexpectedTournamentError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      updateTournament(port, input, "o1", "t1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
```

Create `src/features/tournament/update/handler.ts`:

```ts
"use server";

import { Cause, Effect, Exit, Option } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { tournamentErrorMessage } from "../messages";
import type { TournamentFormState } from "../state";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { updateTournamentInDb } from "./repository";
import { updateTournamentSchema } from "./schema";
import { updateTournament } from "./usecase";

export const updateTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = updateTournamentSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    updateTournament(
      updateTournamentInDb,
      parsed.data,
      organization.id,
      tournamentId,
    ),
  );

  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    return {
      error: Option.isSome(failure)
        ? tournamentErrorMessage(failure.value)
        : "処理に失敗しました。時間をおいて再度お試しください",
    };
  }

  // 0 件は「この組織にその大会が無い」を意味する。存在を漏らさないよう 404。
  if (exit.value.updated === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}`);
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  redirect(`/orgs/${slug}/tournaments/${tournamentId}`);
};
```

- [ ] **Step 2: テストを実行して成功を確認する**

Run: `pnpm test src/features/tournament/update/usecase.test.ts`
Expected: PASS（2 件）

- [ ] **Step 3: 削除スライスを実装する**

Create `src/features/tournament/delete/schema.ts`:

```ts
import { z } from "zod";

export const deleteTournamentSchema = z.object({
  confirmName: z.string().transform((raw) => raw.trim()),
});

export type DeleteTournamentInput = z.infer<typeof deleteTournamentSchema>;
```

Create `src/features/tournament/delete/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { type TournamentError, toTournamentError } from "../errors";
import { prisma } from "@/shared/db/prisma";

export type DeleteTournamentPort = (input: {
  organizationId: string;
  tournamentId: string;
}) => Effect.Effect<{ deleted: number }, TournamentError>;

export const deleteTournamentInDb: DeleteTournamentPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany と同じ理由で deleteMany を使う。where に organizationId を残す。
      const result = await prisma.tournament.deleteMany({
        where: { id: input.tournamentId, organizationId: input.organizationId },
      });
      return { deleted: result.count };
    },
    catch: toTournamentError,
  });
```

Create `src/features/tournament/delete/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { DeleteTournamentPort } from "./repository";

export const deleteTournament = (
  port: DeleteTournamentPort,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ deleted: number }, TournamentError> =>
  port({ organizationId, tournamentId });
```

Create `src/features/tournament/delete/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { UnexpectedTournamentError } from "../errors";
import { failureTag } from "@/shared/testing/exit";
import type { DeleteTournamentPort } from "./repository";
import { deleteTournament } from "./usecase";

describe("deleteTournament", () => {
  it("組織 id と大会 id を両方 port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ deleted: 1 }),
    ) as unknown as DeleteTournamentPort;

    const exit = await Effect.runPromiseExit(
      deleteTournament(port, "o1", "t1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: DeleteTournamentPort = () =>
      Effect.fail(new UnexpectedTournamentError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      deleteTournament(port, "o1", "t1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
```

Create `src/features/tournament/delete/handler.ts`:

```ts
"use server";

import { Cause, Effect, Exit, Option } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { tournamentErrorMessage } from "../messages";
import { findTournamentInOrganization } from "../repository";
import type { TournamentFormState } from "../state";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { deleteTournamentInDb } from "./repository";
import { deleteTournamentSchema } from "./schema";
import { deleteTournament } from "./usecase";

export const deleteTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const parsed = deleteTournamentSchema.safeParse({
    confirmName: String(formData.get("confirmName") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // クライアント側の入力チェックは体感のためのもので、境界はここ。
  if (parsed.data.confirmName !== tournament.name) {
    return { error: "大会名が一致しません" };
  }

  const exit = await Effect.runPromiseExit(
    deleteTournament(deleteTournamentInDb, organization.id, tournamentId),
  );

  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    return {
      error: Option.isSome(failure)
        ? tournamentErrorMessage(failure.value)
        : "処理に失敗しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath(`/orgs/${slug}`);
  redirect(`/orgs/${slug}`);
};
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm test src/features/tournament/delete/usecase.test.ts`
Expected: PASS（2 件）

- [ ] **Step 5: `DeleteTournamentForm` の失敗するテストを書く**

Create `src/components/tournament/DeleteTournamentForm.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TournamentFormState } from "@/features/tournament/state";
import { DeleteTournamentForm } from "./DeleteTournamentForm";

const noop = async (): Promise<TournamentFormState> => ({ error: null });

const formIn = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (!form) throw new Error("form が見つからない");
  return form;
};

describe("DeleteTournamentForm", () => {
  it("大会名が一致するまで削除ボタンを押せない", () => {
    render(
      <DeleteTournamentForm
        action={noop}
        tournamentName="春季大会"
        slug="tennis"
        tournamentId="t1"
      />,
    );

    const button = screen.getByRole("button", { name: "この大会を削除する" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("確認のため大会名を入力"), {
      target: { value: "春季大会" },
    });
    expect(button).toBeEnabled();
  });

  it("送信すると slug・大会 id・入力値を action に渡す", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("tournamentId")).toBe("t1");
        expect(formData.get("confirmName")).toBe("春季大会");
        return { error: null };
      },
    );

    const { container } = render(
      <DeleteTournamentForm
        action={action}
        tournamentName="春季大会"
        slug="tennis"
        tournamentId="t1"
      />,
    );

    fireEvent.change(screen.getByLabelText("確認のため大会名を入力"), {
      target: { value: "春季大会" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("action がエラーを返したらアラートとして表示する", async () => {
    const action = async (): Promise<TournamentFormState> => ({
      error: "大会名が一致しません",
    });

    const { container } = render(
      <DeleteTournamentForm
        action={action}
        tournamentName="春季大会"
        slug="tennis"
        tournamentId="t1"
      />,
    );

    fireEvent.submit(formIn(container));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "大会名が一致しません",
    );
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `pnpm test src/components/tournament/DeleteTournamentForm.test.tsx`
Expected: FAIL。`Failed to resolve import "./DeleteTournamentForm"`

- [ ] **Step 7: `DeleteTournamentForm` を実装する**

Create `src/components/tournament/DeleteTournamentForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";

export function DeleteTournamentForm({
  action,
  tournamentName,
  slug,
  tournamentId,
}: {
  action: TournamentFormAction;
  tournamentName: string;
  slug: string;
  tournamentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TOURNAMENT_FORM_STATE,
  );
  const [confirmName, setConfirmName] = useState("");

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-red-200 bg-red-50 p-4"
    >
      <h2 className="text-sm font-bold text-red-800">大会を削除</h2>
      <p className="text-xs text-red-700">
        この大会に属する部門もすべて削除されます。元に戻せません。
      </p>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />

      <div className="space-y-1">
        <label
          htmlFor="confirmName"
          className="block text-sm font-medium text-red-800"
        >
          確認のため大会名を入力
        </label>
        <input
          id="confirmName"
          name="confirmName"
          type="text"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          className="w-full rounded border border-red-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        // 活性の判定は体感のためで、境界ではない。一致は handler が DB と突き合わせる。
        disabled={pending || confirmName !== tournamentName}
        className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "削除中..." : "この大会を削除する"}
      </button>
    </form>
  );
}
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `pnpm test src/components/tournament/DeleteTournamentForm.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 9: 大会の編集ページを作る**

Create `src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeleteTournamentForm } from "@/components/tournament/DeleteTournamentForm";
import { TournamentForm } from "@/components/tournament/TournamentForm";
import { deleteTournamentAction } from "@/features/tournament/delete/handler";
import { toDateTimeLocalValue } from "@/features/tournament/format";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { updateTournamentAction } from "@/features/tournament/update/handler";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function EditTournamentPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/edit">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
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
          { label: "編集" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-sm space-y-8 px-6 py-8">
        <div className="space-y-4">
          <h1 className="text-lg font-bold text-slate-800">大会を編集</h1>
          <TournamentForm
            action={updateTournamentAction}
            slug={slug}
            submitLabel="保存する"
            defaultName={tournament.name}
            defaultStartsAt={toDateTimeLocalValue(tournament.startsAt)}
            tournamentId={tournament.id}
          />
        </div>

        <DeleteTournamentForm
          action={deleteTournamentAction}
          tournamentName={tournament.name}
          slug={slug}
          tournamentId={tournament.id}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 10: 全体を通す**

```bash
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint:fix
pnpm lint
```

Expected: すべて PASS

- [ ] **Step 11: 実際に動かして確認する**

`pnpm dev` を起動し、

1. 大会の詳細から「大会を編集」を開き、名前と開始日時を変えて保存すると詳細に戻り、値が変わっている
2. 開始日時を空にして保存すると「未設定」に戻る
3. 既に開始日時が入っている大会の編集画面で、入力欄に既存の値が入っている
4. 削除の確認欄に正しい大会名を入れて削除すると `/orgs/tennis` に戻り、一覧から消えている
5. 2 つの組織を作り、組織 A の URL に組織 B の大会 ID を入れて編集ページを開くと 404 になる

- [ ] **Step 12: コミット**

```bash
git add -A
git commit -m "feat: add tournament edit and delete"
```

---

## Task 12: ドキュメントの更新と通しの確認

**Files:**
- Modify: `docs/code-design/architecture.md`

**Interfaces:**
- Consumes: Task 1〜11 の全成果物
- Produces: なし（ドキュメントのみ）

- [ ] **Step 1: `architecture.md` に `features/bracket` の位置づけを追記する**

`docs/code-design/architecture.md` の末尾（`## 例外: features/auth` セクションの後）に、以下を追記する。

```markdown
## features/bracket と features/tournament の違い

`features/bracket` はブラケット（トーナメント表）の描画に閉じた純粋ロジックを持つ。
参加者・組み合わせ・勝敗の 3 データを突き合わせて座標付きの描画要素にするところまでで、
永続化には関わらない。

`features/tournament` は `Tournament` エンティティの CRUD を持つ。
DB への読み書きが責務であり、描画には関わらない。

粒度も更新頻度も違うため、同じカテゴリに置かない。
```

- [ ] **Step 2: 全画面を通しで確認する**

`pnpm dev` を起動し、ログイン済みの状態で以下を順に行う。

1. `/` — 組織一覧が出る
2. 「組織を作成」→ 組織を 2 つ作る（`tennis` と `table-tennis`）
3. `/` — 2 つとも一覧に出て、参加した順（作った順）に並んでいる
4. `/orgs/tennis` — 大会一覧が「まだ大会がありません」
5. 「大会を作成」→ 開始日時ありの大会と、なしの大会を 1 つずつ作る
6. `/orgs/tennis` — 2 つとも並び、新しい方が上に出ている
7. 大会名をクリック → 詳細が出る
8. 「大会を編集」→ 名前を変えて保存 → 詳細に反映され、一覧にも反映されている
9. 大会を削除 → `/orgs/tennis` に戻り、一覧から消えている
10. 「組織を編集」→ 名前を変えて保存 → `/` の一覧にも反映されている
11. `/orgs/table-tennis` で作った大会の ID を `/orgs/tennis/tournaments/<その ID>` に貼る → 404
12. 組織を削除 → `/` に戻り、一覧から消えている。その組織に属していた大会の URL も 404 になる
13. `/mock` — 従来の Mock トーナメント表が表示される
14. ログアウトして `/orgs/tennis` を直接開く → `/login?redirect=/orgs/tennis` に飛ぶ

- [ ] **Step 3: 最終確認を実行する**

```bash
pnpm test
pnpm exec next typegen
pnpm typecheck
pnpm lint
pnpm build
```

Expected: すべて PASS。`pnpm build` が成功すること。

- [ ] **Step 4: `prisma/schema.prisma` に変更が無いことを確認する**

```bash
git log --oneline -12 -- prisma/
```

Expected: Task 1〜11 で作ったコミットが 1 つも出てこないこと。本計画は DB スキーマを一切変更しない。

- [ ] **Step 5: コミット**

```bash
git add docs/code-design/architecture.md
git commit -m "docs: document the split between features/bracket and features/tournament"
```

---

## 本計画の対象外（次にやること）

1. `Division`（部門）のメタ情報 CRUD。あわせて `Division` の
   `@@unique([tournamentId, order])` を解除し、並び替えを単純な UPDATE 2 行にする
2. `Member` / `Participant` の登録と、部門へのエントリー登録
3. 組み合わせ抽選（`matchingConfig` の生成）
4. 勝敗入力（`results` の更新、`revision` による楽観ロック）
5. 大会ステータスの遷移（`DRAFT` → `IN_PROGRESS` → `COMPLETED`）
6. 組織へのメンバー招待とロール管理
7. 部門の閲覧画面を Mock から実データのブラケット描画に差し替える
