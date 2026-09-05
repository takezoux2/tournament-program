# 大会の公開（view only）ページ 設計

作成日: 2026-09-05

## 目的

大会の情報を、ログイン不要で誰でも閲覧できる画面として公開する。閲覧者は参加者・
観客・保護者などで、URL を渡された人が対象。操作は一切持たせない（並べ替え・編集・
削除のいずれも出さない）。表示はスマートフォンで見やすいことを最優先にする。

## 公開する内容

* 大会概要（名称・ステータス・開始日時・説明 Markdown・主催組織名）
* 試合一覧（進行順・区切り行の見出しと開始予定時刻）
* 部門一覧とブラケット（組み合わせ表）
* 参加者一覧（選手番号・氏名・チーム）

参加者の氏名を公開することは、この設計の前提として合意済みである。

## ルーティング

```
/t/[tournamentId]                          大会概要 + 部門への入口
/t/[tournamentId]/schedule                 試合一覧
/t/[tournamentId]/divisions/[divisionId]   ブラケット
/t/[tournamentId]/participants             参加者一覧
```

`/orgs/[slug]/...` の配下には置かない。`/orgs` 配下は「冒頭で必ず
`requireOrganization` を呼ぶ」という約束を持つ領域であり、そこへ境界を呼ばない
ページを 1 枚混ぜると、後から読んだときに事故なのか意図なのか区別できない。
木を分けることで `/orgs` は要ログイン、`/t` は公開、と一目で分かる形にする。

`tournamentId` は uuid なので、URL は推測できない。公開の可否は次節のゲートが
`status` で決め、URL の秘匿性には依存しない。

## 公開ゲート

`src/features/tournament/repository.ts` に `findPublicTournament` を足す。
新しいスライスは作らない。Tournament の読み出しであり既存カテゴリに属するうえ、
新スライスは `biome.json` の import 制約ブロックを 1 つ増やすことになるため。

```ts
export type PublicTournament = TournamentDetail & {
  organizationId: string;
  organizationName: string;
};

/** 公開ページの唯一の入口。DRAFT は「見つからない」に倒す。 */
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
  // organization.name はここで平す。ネストしたまま渡すと、ページ側が
  // Prisma の select の形を知ることになる。
  const { organization, ...rest } = row;
  return { ...rest, organizationName: organization.name };
};
```

`status: { not: "DRAFT" }` を `where` に入れることが要点である。取得してから
`if (status === "DRAFT")` で弾く形にすると、4 ページのうち 1 枚で書き忘れた箇所が
そのまま公開の穴になる。`where` に置けば書き忘れは「見つからない」に倒れる。
既存の「所有権はクエリの `where` に入れる」（`docs/code-design/architecture.md`
テナント分離の 2 原則）と同じ理由づけである。

4 ページとも冒頭でこれを呼び、`null` なら `notFound()` を投げる。
返ってきた `organizationId` を既存リポジトリへ渡す。

## データ取得

新しいクエリは追加しない。既存リポジトリは全て `organizationId` を引数に取る形
なので、ゲートが返した値を渡すだけで所有権チェックが効いたまま再利用できる。

| ページ | 呼び出し |
| --- | --- |
| 概要 | `findPublicTournament` → `listDivisionsInTournament` |
| 試合一覧 | `findPublicTournament` → `loadScheduleView` |
| ブラケット | `findPublicTournament` → `findDivisionInTournament` + `listParticipantsInTournament` |
| 参加者 | `findPublicTournament` → `listParticipantsInTournament` |

`listParticipantsInTournament` は並び順を持たないため、参加者一覧の表示側で
選手番号順に並べる。選手番号は文字列だが数値として比較する
（`Intl.Collator(undefined, { numeric: true })` を使う）。

## コンポーネント

新規に `src/components/public/` を置く。

* `PublicHeader` — 組織名 / 大会名のパンくずのみ。`AppHeader` は `userName` が必須で
  `LogoutButton` を含むため流用しない。
* `PublicTournamentSummary` — 名称・ステータス・開始日時・説明。説明の描画は
  既存の `TournamentDescriptionMarkdown` を再利用する。
* `PublicScheduleList` — Server Component。`ScheduleRowView[]` を読んで描くだけ。
  既存の `ScheduleList` は dnd と Server Action を前提とした Client Component
  なので再利用しない。区切り行は見出しと開始予定時刻、試合行は試合番号・
  対戦カード・部門名とラウンドを出す。
* `PublicDivisionList` — 概要ページに置く部門の一覧。部門名と形式を出し、
  各行がその部門のブラケットページへのリンクになる。並びは `order` 昇順
  （`listDivisionsInTournament` の返す順）。
* `PublicParticipantList` — 選手番号・氏名・チーム。

既存への変更は 2 点に限る。

* `DivisionBracket` に任意の高さ指定の prop を足す。既定値は現在の `h-[28rem]` の
  ままとし、管理画面側は無変更で通す。公開のブラケットページはこの prop で
  `dvh` 基準の高さを渡し、画面をほぼ占有させる。ブラケット専用のページなので、
  React Flow がタッチを取ってもページのスクロールと衝突しにくい。
* 管理側の大会ページ
  （`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`）に
  「公開ページを開く」リンクを足す。運営者が公開 URL を取り出す唯一の導線になる。

## スマートフォン向けの決め

* 本文の器は `mx-auto max-w-3xl px-4 py-6`（既存の管理画面は `px-6`）
* 試合一覧の行は縦積みにし、`truncate` を使わず折り返す。対戦カードが途中で
  切れると情報として成立しないため。
* 部門リンクなどのタップ対象は 44px 相当の縦余白を確保する
* ブラケットの高さは `dvh` 基準（モバイルブラウザのアドレスバーで変わる `vh` を避ける）
* 各ページで `generateMetadata` を実装し、`<title>` を「大会名 | 組織名」にする。
  SNS で URL が共有される前提のため。

## テスト

* `src/features/tournament/repository.test.ts` に `findPublicTournament` の
  テストを追記する。**`where` に `status: { not: "DRAFT" }` と `id` が入ること**を
  確認する。ここが公開範囲の実体であり、最も守るべき 1 点。
* 4 ページぶんの `page.test.tsx`。既存の
  `src/app/orgs/[slug]/tournaments/[tournamentId]/matches/page.test.tsx` に倣い、
  リポジトリを `vi.mock` してから `await import("./page")` する形にする。
  各ページで確認するのは次の 2 点。
  * 正常時に、そのページが載せる情報が画面に出ること
  * ゲートが `null` を返したとき `notFound()` が呼ばれること
* `PublicScheduleList` / `PublicParticipantList` のコンポーネントテスト。
  前者は区切りと試合が並ぶこと、後者は選手番号順に並ぶことを確認する。

## やらないこと

* 公開フラグ（`Tournament.isPublic`）の新設。既存の `status` を公開スイッチとして
  使うため、スキーマ変更もマイグレーションも行わない。
* 組織単位の公開大会一覧ページ。導線は管理画面からの URL 共有に限る。
* ブラケットのモバイル専用表示（ラウンドごとの縦リスト）。既存の React Flow を
  そのまま使う。
* 自動更新・リアルタイム反映。閲覧者は再読み込みで最新を見る。
* `SINGLE_ELIMINATION` 以外のブラケット描画。既存の `DivisionBracket` と同じく
  未対応の案内を出すに留める。
