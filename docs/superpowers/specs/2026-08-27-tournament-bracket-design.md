# シングルエリミネーション・トーナメント表 設計

作成日: 2026-08-27

## 目的

React Flow を使い、シングルエリミネーション方式のトーナメント表を描画する。データは Mock。
参加者データと勝敗データを分離して保持することを必須要件とする。

## スコープ

対象:

- Mock データからのトーナメント表の描画（表示専用）
- 任意の参加者数に対応し、2 のべき乗でない場合は BYE（不戦勝）として扱う
- 試合を 1 ノードとして描き、勝ち上がりをエッジで接続
- パン・ズーム（React Flow 標準機能）

対象外:

- 勝敗の編集、スコア入力
- 永続化、API、認証
- 3 位決定戦、敗者復活、総当たり戦

## データモデル

3 層に分離する。3 つは出所も更新頻度も異なるため、独立した型・ファイルとして保持し、描画時に合成する。

```ts
/** 参加者マスタ — 「誰が出るか」 */
type Participant = {
  id: string;
  name: string;
  seed: number;
  team?: string;
};

/** 試合スロットが何から埋まるか */
type SlotSource =
  | { kind: "participant"; participantId: string } // 初戦の枠
  | { kind: "winnerOf"; matchId: string }          // 前試合の勝者
  | { kind: "bye" };                               // 空き枠（不戦勝）

/** ブラケット構造 — 「どの試合がどこへ繋がるか」 */
type Match = {
  id: string;
  round: number;  // 1 = 1 回戦
  order: number;  // ラウンド内の上からの位置（0 始まり）
  slots: [SlotSource, SlotSource];
};

type Bracket = {
  id: string;
  name: string;
  matches: Match[];
};

/** 勝敗データ — 「誰が勝ったか」。上 2 つから完全に独立 */
type MatchResult = {
  matchId: string;
  winnerId: string; // Participant["id"]
  score?: string;   // "3-1" などの表示用文字列
};
```

分離の実利: `results` を空配列にすれば「まだ 1 試合も終わっていないトーナメント表」がそのまま描ける。
`bracket` を差し替えれば別大会の組み合わせを描ける。

### 構造上の制約

- `Match.id` は `Bracket` 内で一意
- `winnerOf` は自分より小さい `round` の試合のみを参照する（循環禁止）
- 各試合は高々 1 つの試合からしか参照されない（決勝を除き、必ず 1 つから参照される）
- `MatchResult.winnerId` は、その試合のいずれかのスロットに実際に到達しうる参加者の id であること

## アーキテクチャ

```
mock (participants / bracket / results)
        |
        v
resolveBracket()   … 3 つを突き合わせ、勝者を伝播（純粋関数）
        |
        v
ResolvedMatch[]
        |
        +--> layoutBracket()      … 各試合の x, y 座標を決定（純粋関数）
        |
        v
toFlowElements()   … React Flow の nodes / edges へ変換（純粋関数）
        |
        v
TournamentFlow ("use client") --> MatchNode
```

ロジックはすべて React Flow に依存しない純粋関数に閉じ込める。React に依存するのは
`TournamentFlow` と `MatchNode` の 2 つだけ。

### resolveBracket

`resolveBracket(participants, bracket, results) → ResolvedMatch[]`

```ts
type SlotState = "confirmed" | "pending" | "bye";

type ResolvedSlot = {
  participant: Participant | null; // pending / bye のときは null
  state: SlotState;
  isWinner: boolean;
};

type MatchStatus = "done" | "ready" | "waiting" | "bye";

type ResolvedMatch = {
  id: string;
  round: number;
  order: number;
  slots: [ResolvedSlot, ResolvedSlot];
  winnerId: string | null;
  score: string | null;
  status: MatchStatus;
  /** 各スロットの供給元試合 id。エッジ生成に使う */
  sourceMatchIds: [string | null, string | null];
};
```

責務:

1. `round` 昇順に走査し、`winnerOf` 参照を解決済みの前試合の勝者で埋める
2. `results` に該当エントリがあれば `winnerId` / `score` を設定
3. BYE の自動勝ち上がり: 片側が `bye` かつ他方が確定参加者なら、`results` になくてもその参加者を勝者とし、`status` を `"bye"` とする
4. 両側 `bye`（起こりうるなら）は勝者なし・`status` は `"bye"`
5. スロットの状態を決定する
   - `confirmed`: 参加者が確定している
   - `pending`: 供給元の試合がまだ決着していない
   - `bye`: 空き枠
6. `status` の決定
   - `bye`: いずれかのスロットが `bye`
   - `done`: `winnerId` が確定
   - `ready`: 両スロット `confirmed` だが未決着
   - `waiting`: いずれかが `pending`

不正データの扱い: 存在しない `participantId` / `matchId` の参照、および結果が入っている試合の
`winnerId` がそのどちらのスロットにも一致しない場合は、開発時に気付けるよう例外を投げる。
Mock を手で書くため、静かに握り潰すより早く落とす方が良い。

### layoutBracket

`layoutBracket(matches) → Map<matchId, {x, y}>`

`NODE_WIDTH` / `NODE_HEIGHT` / `GAP_X` / `GAP_Y` は `layout-bracket.ts` に定数として定義し、
`MatchNode` からも同じ値を import してノードの実寸に使う（レイアウト計算と実際の描画サイズを一致させるため）。

- `x = (round - 1) * (NODE_WIDTH + GAP_X)`
- `y`: 1 回戦は `order * (NODE_HEIGHT + GAP_Y)`。2 回戦以降は供給元 2 試合の y の中点。
  供給元が 1 つしかない場合はその y をそのまま使う
- ラウンド 1 から順に確定させるため、1 パスで計算できる

### toFlowElements

`toFlowElements(resolvedMatches, positions) → { nodes, edges }`

- ノード: `type: "match"`、`data` に `ResolvedMatch` を渡す
- エッジ: `sourceMatchIds` の非 null エントリごとに 1 本。供給元試合 → 当該試合
- 決着済みの試合から伸びるエッジは強調表示、未決着は淡色

## UI

`MatchNode`:

- 上下 2 スロット。各スロットに参加者名とシード番号
- 勝者側をハイライト（背景色 + 太字）
- `pending` は「未定」、`bye` は「BYE」と淡色表示
- スコアがあれば右端に表示
- 左端に target ハンドル、右端に source ハンドル

`TournamentFlow`（`"use client"`）:

- `nodes` / `edges` は `useMemo` で 1 回計算。表示専用のため状態更新はない
- `fitView`、`Background`、`Controls` を有効化
- 高さは画面全体（`h-screen`）

`page.tsx` は Server Component のまま `TournamentFlow` を描画する。

スタイリングは Tailwind CSS v4（既存設定）を使う。React Flow の CSS（`@xyflow/react/dist/style.css`）を
インポートする必要がある。

## Mock データ

12 人。16 枠のうち 4 つが BYE、4 ラウンド構成。

組み合わせは標準シーディング（1 vs 16、8 vs 9、… の形）に従って手書きし、`bracket.ts` に固定で持つ。
シード 1〜4 の相手枠（16・15・14・13 相当）が空くため、この 4 名が 1 回戦 BYE となる。

- 1 回戦（8 試合）: うち 4 試合が BYE（上位シード 4 名が不戦勝）
- 準々決勝（4 試合）、準決勝（2 試合）、決勝（1 試合）
- `results` は準決勝までを埋め、決勝は未確定にする

これにより `confirmed` / `pending` / `bye` の 3 状態と `done` / `waiting` / `bye` が
一画面で確認できる。

## テスト

vitest + @testing-library/react（既存構成）。

`resolveBracket`:

- 結果が空のとき、1 回戦の参加者が確定し以降はすべて `pending`
- 1 回戦の結果を入れると 2 回戦のスロットが確定する
- BYE の相手が結果なしで自動的に勝ち上がる
- 勝者スロットに `isWinner` が立つ
- `status` が状況に応じて `done` / `ready` / `waiting` / `bye` になる
- 存在しない参加者 id を参照したら例外を投げる
- `winnerId` がどちらのスロットにも一致しなければ例外を投げる

`layoutBracket`:

- 1 回戦の y が等間隔になる
- 2 回戦の y が供給元 2 試合の中点になる
- x がラウンドごとに等間隔になる

`toFlowElements`:

- 試合数と同数のノードが生成される
- エッジが `winnerOf` 参照と 1 対 1 対応する

`MatchNode`:

- 参加者名・シード・スコアが表示される
- 勝者が視覚的に区別される（クラスまたは aria 属性で検証）
- `pending` / `bye` のプレースホルダが表示される

`TournamentFlow` 自体は jsdom がノードサイズを計測できないため、レンダリングテストは行わない。

## ファイル構成

```
src/
  app/
    page.tsx                              … TournamentFlow を描画
  features/tournament/
    types.ts                              … Participant / Match / Bracket / MatchResult / Resolved*
    mock/
      participants.ts
      bracket.ts
      results.ts
    lib/
      resolve-bracket.ts
      resolve-bracket.test.ts
      layout-bracket.ts
      layout-bracket.test.ts
      to-flow-elements.ts
      to-flow-elements.test.ts
    components/
      MatchNode.tsx
      MatchNode.test.tsx
      TournamentFlow.tsx
```

## 依存追加

- `@xyflow/react`（React Flow v12 系。React 19 対応版を使う）

## 既存コードへの影響

- `src/app/page.tsx` を置き換える。既存の `src/app/page.test.tsx`（"Hello world!" のプレースホルダ
  テスト）は不要になるため削除する
- `src/app/layout.tsx` の `metadata` をトーナメント表に合わせて更新する
