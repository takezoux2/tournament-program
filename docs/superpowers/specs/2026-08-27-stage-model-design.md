# Stage モデル設計 — Match モデルの置き換え

作成日: 2026-08-27

## 目的

Prisma の `Match` モデルを廃止し、「大会内の 1 つの競技形式」を表す `Stage` モデルに置き換える。
`Stage` は試合形式（シングル / ダブルエリミネーション / リーグ）と、組み合わせ・勝敗を Json で保持する。

## 背景

現行の `Match` は「1 試合 = 1 行」の粒度だった。しかし保持したいのは
「試合の種類」「マッチング設定」「勝敗記録」であり、これは 1 試合ではなく
1 つの競技形式のかたまりを指す。粒度が変わるため、モデル名も変える。

`Match` という語はテーブル名から外し、Json の中の 1 試合を指す TS 型
（`BracketMatch`）として使う。

## 命名

`Stage`（大会の段階）を採用する。

- 順序を持って複数並ぶ意味に正確（予選リーグ → 決勝トーナメント）
- トーナメント形式とリーグ形式の両方を中立に含められる
- Toornament / Challonge など大会運営 API の業界標準用語

不採用: `Bracket`（本来「勝ち上がり表」の意味で、総当たりを含むと語義が崩れる）、
`Competition`（`Tournament` と意味が近すぎる）、`Division`（並列の部門というニュアンスが強く、順序を持つ構成に合わない）。

## データモデル

`Tournament 1-N Stage 1-N Entry` の 3 層構成。

```prisma
model Tournament {
  // matches Match[]  ← 削除
  stages Stage[]
}

/// ステージ。大会内の 1 つの競技形式（予選リーグ、決勝トーナメントなど）。
model Stage {
  id             String      @id @default(uuid())
  tournamentId   String
  /// 表示名。「予選リーグ A」「決勝トーナメント」など。
  name           String
  /// 大会内の実施順（0 始まり）。
  order          Int
  /// 試合の種類。
  format         StageFormat
  /// マッチング設定。展開済みの組み合わせを保持する。MatchingConfig 型。
  matchingConfig Json        @default("{\"version\":1,\"matches\":[]}")
  /// 勝敗記録。StageResults 型。
  results        Json        @default("{\"version\":1,\"matches\":[]}")
  /// results の楽観ロック用リビジョン。results を更新するたびに +1 する。
  revision       Int         @default(0)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  entries    Entry[]

  @@unique([tournamentId, order])
  @@index([tournamentId])
}

enum StageFormat {
  /// シングルエリミネーション
  SINGLE_ELIMINATION
  /// ダブルエリミネーション。勝者トーナメント優勝者と敗者トーナメント優勝者が最終試合を行う。
  DOUBLE_ELIMINATION_GRAND_FINAL
  /// ダブルエリミネーション。敗者トーナメント優勝者が 3 位となる。
  DOUBLE_ELIMINATION_THIRD_PLACE
  /// リーグ（総当たり）
  ROUND_ROBIN
}

/// エントリー。「どの参加者がどのステージに何番シードで出るか」。
model Entry {
  id            String   @id @default(uuid())
  stageId       String
  participantId String
  /// ステージ内でのシード順（0 始まり）。
  seed          Int
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  stage       Stage       @relation(fields: [stageId], references: [id], onDelete: Cascade)
  participant Participant @relation(fields: [participantId], references: [id], onDelete: Cascade)

  @@unique([stageId, participantId])
  @@unique([stageId, seed])
  @@index([participantId])
}
```

### 変更点

削除:

- `model Match`
- `enum MatchStatus`
- `Entry.matchId` / `Entry.slot` / `Entry.isWinner` / `Entry.score`
  （slot は `matchingConfig`、isWinner / score は `results` に移る）

追加: `model Stage`、`enum StageFormat`、`Entry.stageId`。

据え置き: `User` / `Organization` / `OrganizationMember` / `Participant` は変更しない。
`Participant.seed` は大会全体の初期シード（エントリー順・ランキング）として残し、
`Entry.seed` はステージ内での位置として使い分ける。

## Json のスキーマ

Prisma は Json の中身を型付けしないため、TS 型として定義し、DB 境界で検証する。

```ts
/** 試合スロットが何から埋まるか */
type SlotSource =
  | { kind: "entry"; entryId: string }   // 初戦の枠
  | { kind: "winnerOf"; matchId: string }
  | { kind: "loserOf"; matchId: string } // ダブルエリミの敗者側送り
  | { kind: "bye" };                     // 空き枠（不戦勝）

/** 組み合わせの中の 1 試合 */
type BracketMatch = {
  id: string;
  /** シングルエリミネーションとリーグでは "winners" 固定 */
  bracket: "winners" | "losers" | "final";
  /** 1 = 1 回戦。リーグでは節番号 */
  round: number;
  /** ラウンド内の上からの位置（0 始まり） */
  order: number;
  slots: [SlotSource, SlotSource];
};

/** Stage.matchingConfig */
type MatchingConfig = {
  version: 1;
  matches: BracketMatch[];
};

/** Stage.results */
type StageResults = {
  version: 1;
  matches: {
    matchId: string;
    /** null = 引き分け。ROUND_ROBIN でのみ許可する */
    winnerEntryId: string | null;
    /** "3-1" などの表示用文字列 */
    score?: string;
    /** ISO 8601 */
    finishedAt?: string;
  }[];
};
```

`version` は Json の形を後で変えたときにマイグレーションを書けるようにするための番号。
現時点では常に `1`。

デフォルト値は `{"version":1,"matches":[]}` とする。空オブジェクト `{}` は
`MatchingConfig` / `StageResults` のいずれも満たさないため、デフォルトには使わない。
「まだ組み合わせが決まっていないステージ」は `matches` が空配列の状態で表す。

スロットの参照先は `participantId` ではなく `entryId` にする。`Entry` がステージ単位の
名簿なので、`matchingConfig` はステージ内で自己完結する。

### 3 層分離との対応

既存 spec（`2026-08-27-tournament-bracket-design.md`）の 3 層分離はそのまま維持される。

| spec の層 | 保持場所 |
| --- | --- |
| 参加者マスタ（誰が出るか） | `Participant` / `Entry` テーブル |
| ブラケット構造（どの試合がどこへ繋がるか） | `Stage.matchingConfig` |
| 勝敗データ（誰が勝ったか） | `Stage.results` |

`results.matches` を空配列にすれば「まだ 1 試合も終わっていないステージ」がそのまま描ける。

### 形式ごとの `matchingConfig` の使い方

- `SINGLE_ELIMINATION` — `bracket` は全て `"winners"`。参加者数が 2 のべき乗でない場合、
  余った枠を `{ kind: "bye" }` で埋める。
- `DOUBLE_ELIMINATION_GRAND_FINAL` — 勝者側が `"winners"`、敗者側が `"losers"`、
  最終試合が `"final"`。`"final"` の 2 スロットは各ブラケット決勝の `winnerOf`。
- `DOUBLE_ELIMINATION_THIRD_PLACE` — `"final"` の試合を持たない。
  敗者ブラケット決勝の勝者がそのまま 3 位。
- `ROUND_ROBIN` — 全組み合わせを列挙し、両スロットとも `{ kind: "entry" }`。
  `round` は節番号として使う。

## 整合性の担保

`matchingConfig` / `results` は Json なので外部キー制約が効かない。以下はアプリ側で検証する。

1. `matchingConfig.matches[].id` はステージ内で一意
2. `SlotSource.entryId` はそのステージに属する `Entry` の id
3. `winnerOf` / `loserOf` は自分より小さい `round` の試合のみ参照する（循環禁止）
4. `results.matches[].matchId` は `matchingConfig.matches[].id` のいずれか
5. `results.matches[].winnerEntryId` は、その試合のいずれかのスロットに到達しうる `Entry` の id
6. `winnerEntryId === null` は `format === "ROUND_ROBIN"` のときのみ許可

検証は `Stage` 確定時（`matchingConfig` 書き込み時）と結果入力時に行う。

## results の楽観ロック

`results` は Json 一括更新のため、1 試合の結果を書くにも全体を read-modify-write する。
複数人が同時に入力すると lost update が起きるため、`Stage.revision` で楽観ロックする。

更新手順:

1. `Stage` を読み、`results` と `revision` を取得する
2. `results` に 1 試合分の結果を反映する
3. `revision` を条件に含めて更新する

```ts
await prisma.stage.update({
  where: { id: stageId, revision: currentRevision },
  data: { results: nextResults, revision: currentRevision + 1 },
});
```

Prisma の extended where unique により、`update` の `where` にユニークキー以外の条件を
含められる。条件に合う行がなければ `P2025` が投げられるので、これを競合として扱い、
呼び出し元に「他の人が更新しました。再読み込みしてください」を返す。

`revision` は `results` を更新するときのみ増やす。`name` / `order` の変更では増やさない。

## ファイル構成

```
prisma/schema.prisma                  Stage / StageFormat / Entry の定義
prisma/migrations/<新規>/             init マイグレーションを作り直す

src/lib/stage/types.ts                MatchingConfig / StageResults / SlotSource / BracketMatch
src/lib/stage/parse.ts                Prisma.JsonValue → 上記型 への検証付き変換
src/lib/stage/validate.ts             「整合性の担保」1〜6 の検証
src/lib/stage/results.ts              1 試合分の結果を results に反映する純関数 + 楽観ロック更新
```

`src/lib/stage/` 配下は Prisma に依存しない純粋な関数を基本とし、
DB アクセスは `results.ts` の更新関数のみに閉じる。これにより Json のロジックを
DB なしでテストできる。

## マイグレーション

破壊的変更（`Match` テーブル削除、`Entry` の親付け替え）だが、既存のマイグレーションは
`20260827000000_init` のみで本番データが存在しないため、init マイグレーションを作り直す。

1. `prisma/migrations/20260827000000_init/` を削除する
2. `prisma migrate dev --name init` で新しい init を生成する
3. `prisma generate` で `src/generated/prisma` を再生成する

## テスト

Vitest。DB を必要としない純関数のテストを中心に置く。

- `parse.ts` — 不正な Json（version 不一致、必須フィールド欠落、想定外の `kind`）を弾く
- `validate.ts` — 整合性ルール 1〜6 それぞれについて、通る例と弾く例
- `results.ts` — 結果反映の純関数について、新規追加 / 同じ matchId の上書き / 引き分けの扱い

楽観ロックの競合そのものは Prisma の挙動なので、単体テストでは扱わない。

## 対象外

- 組み合わせの自動生成アルゴリズム（別途）
- ステージ間の参加者引き継ぎ（予選の成績で決勝のシードを決める）
- ステージの進行状態（`status`）。`results` の埋まり具合から導出できるため列は持たない
- 認証・認可
