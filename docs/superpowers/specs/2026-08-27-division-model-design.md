# Division モデル設計 — Match / Entry モデルの置き換え

作成日: 2026-08-27

## 目的

Prisma の `Match` モデルと `Entry` モデルを廃止し、「大会内の 1 つの競技形式」を表す
`Division` モデルに置き換える。`Division` は試合形式（シングル / ダブルエリミネーション / リーグ）と、
エントリー・組み合わせ・勝敗を Json で保持する。

## 背景

現行の `Match` は「1 試合 = 1 行」の粒度だった。しかし保持したいのは
「試合の種類」「マッチング設定」「勝敗記録」であり、これは 1 試合ではなく
1 つの競技形式のかたまりを指す。粒度が変わるため、モデル名も変える。

`Entry` は試合単位の中間テーブルだったが、組み合わせが `matchingConfig` Json に入る以上、
エントリーだけを RDB に残す理由がない。`Division.entries` Json に統合する。

`Match` という語はテーブル名から外し、Json の中の 1 試合を指す TS 型
（`BracketMatch`）として使う。`Entry` も同様に、Json の中の 1 エントリーを指す TS 型
（`DivisionEntry`）として使う。

## 命名

`Division`（部門）を採用する。

大会内に複数並ぶ競技形式のまとまりを表す。「男子の部 / 女子の部」のような並列の部門にも、
「予選リーグ → 決勝トーナメント」のような順序を持つ構成にも使える。順序は `order` 列で表す。

不採用: `Match`（1 試合を指すため粒度が合わない）、`Bracket`（本来「勝ち上がり表」の意味で、
総当たりを含むと語義が崩れる）、`Competition`（`Tournament` と意味が近すぎる）。

## データモデル

RDB は `Tournament 1-N Division` と `Tournament 1-N Participant` の 2 系統。
Division と Participant は `entries` Json 経由で緩く結ばれる。

```prisma
model Tournament {
  // matches Match[]  ← 削除
  divisions    Division[]    // ← 追加
  participants Participant[]
}

/// 部門。大会内の 1 つの競技形式（男子の部、決勝トーナメントなど）。
model Division {
  id             String         @id @default(uuid())
  tournamentId   String
  /// 表示名。「男子シングルス」「決勝トーナメント」など。
  name           String
  /// 大会内での表示順・実施順（0 始まり）。
  order          Int
  /// 試合の種類。
  format         DivisionFormat
  /// エントリー情報。DivisionEntries 型。
  entries        Json           @default("{\"version\":1,\"entries\":[]}")
  /// マッチング設定。展開済みの組み合わせを保持する。MatchingConfig 型。
  matchingConfig Json           @default("{\"version\":1,\"matches\":[]}")
  /// 勝敗記録。DivisionResults 型。
  results        Json           @default("{\"version\":1,\"matches\":[]}")
  /// results の楽観ロック用リビジョン。results を更新するたびに +1 する。
  revision       Int            @default(0)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)

  @@unique([tournamentId, order])
  @@index([tournamentId])
}

enum DivisionFormat {
  /// シングルエリミネーション
  SINGLE_ELIMINATION
  /// ダブルエリミネーション。勝者トーナメント優勝者と敗者トーナメント優勝者が最終試合を行う。
  DOUBLE_ELIMINATION_GRAND_FINAL
  /// ダブルエリミネーション。敗者トーナメント優勝者が 3 位となる。
  DOUBLE_ELIMINATION_THIRD_PLACE
  /// リーグ（総当たり）
  ROUND_ROBIN
}

/// 参加者。大会単位のマスタ。複数の部門にエントリーしうる。
model Participant {
  id           String   @id @default(uuid())
  tournamentId String
  name         String
  /// 大会全体の初期シード（エントリー順・ランキング）。
  seed         Int?
  team         String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  // entries Entry[]  ← 削除

  @@unique([tournamentId, seed])
  @@index([tournamentId])
}
```

### 変更点

削除:

- `model Match`
- `enum MatchStatus`
- `model Entry`（`Division.entries` Json に統合）
- `Participant.entries` リレーション

追加: `model Division`、`enum DivisionFormat`。

据え置き: `User` / `Organization` / `OrganizationMember` は変更しない。
`Participant` はリレーションの削除のみで、列は変更しない。

## Json のスキーマ

Prisma は Json の中身を型付けしないため、TS 型として定義し、DB 境界で検証する。

```ts
/** Division.entries — 「誰がこの部門に何番シードで出るか」 */
type DivisionEntry = {
  /** 部門内で一意。matchingConfig / results はこの id で参照する */
  id: string;
  /** Participant.id */
  participantId: string;
  /** 部門内でのシード順（0 始まり） */
  seed: number;
};

type DivisionEntries = {
  version: 1;
  entries: DivisionEntry[];
};

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

/** Division.matchingConfig */
type MatchingConfig = {
  version: 1;
  matches: BracketMatch[];
};

/** Division.results */
type DivisionResults = {
  version: 1;
  matches: {
    matchId: string;
    /** DivisionEntry.id。null = 引き分け（ROUND_ROBIN でのみ許可） */
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

デフォルト値は空配列を持つ有効な構造とする。空オブジェクト `{}` は上記のいずれの型も
満たさないため、デフォルトには使わない。「まだ組み合わせが決まっていない部門」は
`matches` が空配列の状態で表す。

組み合わせと勝敗は `participantId` ではなく `DivisionEntry.id` を参照する。
これにより、同じ参加者が複数の部門に出ても部門ごとに独立して扱える。

### 3 層分離との対応

既存 spec（`2026-08-27-tournament-bracket-design.md`）の 3 層分離は Json の中で維持される。

| spec の層 | 保持場所 |
| --- | --- |
| 参加者マスタ（誰が出るか） | `Participant` テーブル + `Division.entries` |
| ブラケット構造（どの試合がどこへ繋がるか） | `Division.matchingConfig` |
| 勝敗データ（誰が勝ったか） | `Division.results` |

`results.matches` を空配列にすれば「まだ 1 試合も終わっていない部門」がそのまま描ける。

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

3 つの Json はいずれも外部キー制約が効かない。以下はアプリ側で検証する。

1. `entries[].id` は部門内で一意
2. `entries[].participantId` は同じ大会に属する `Participant` の id で、部門内で重複しない
3. `entries[].seed` は部門内で一意
4. `matchingConfig.matches[].id` は部門内で一意
5. `SlotSource.entryId` は `entries[].id` のいずれか
6. `winnerOf` / `loserOf` は自分より小さい `round` の試合のみ参照する（循環禁止）
7. `results.matches[].matchId` は `matchingConfig.matches[].id` のいずれか
8. `results.matches[].winnerEntryId` は、その試合のいずれかのスロットに到達しうる `entries[].id`
9. `winnerEntryId === null` は `format === "ROUND_ROBIN"` のときのみ許可

1・3 は `entries` 書き込み時、4〜6 は `matchingConfig` 書き込み時、7〜9 は結果入力時に検証する。
2 は `Participant` を読む必要があるため、`entries` 書き込み時に DB アクセスを伴う。

## results の楽観ロック

`results` は Json 一括更新のため、1 試合の結果を書くにも全体を read-modify-write する。
複数人が同時に入力すると lost update が起きるため、`Division.revision` で楽観ロックする。

更新手順:

1. `Division` を読み、`results` と `revision` を取得する
2. `results` に 1 試合分の結果を反映する
3. `revision` を条件に含めて更新する

```ts
await prisma.division.update({
  where: { id: divisionId, revision: currentRevision },
  data: { results: nextResults, revision: currentRevision + 1 },
});
```

Prisma の extended where unique により、`update` の `where` にユニークキー以外の条件を
含められる。条件に合う行がなければ `P2025` が投げられるので、これを競合として扱い、
呼び出し元に「他の人が更新しました。再読み込みしてください」を返す。

`revision` は `results` を更新するときのみ増やす。`entries` / `matchingConfig` は
部門の開始前に確定させる想定で、同時編集の対象としない。`name` / `order` の変更でも増やさない。

## ファイル構成

```
prisma/schema.prisma                     Division / DivisionFormat の定義、Match / Entry の削除
prisma/migrations/<新規>/                init マイグレーションを作り直す

src/lib/division/types.ts                DivisionEntries / MatchingConfig / DivisionResults ほか
src/lib/division/parse.ts                Prisma.JsonValue → 上記型 への検証付き変換
src/lib/division/validate.ts             「整合性の担保」1〜9 の検証
src/lib/division/results.ts              1 試合分の結果を results に反映する純関数 + 楽観ロック更新
```

`src/lib/division/` 配下は Prisma に依存しない純粋な関数を基本とし、
DB アクセスは `results.ts` の更新関数と、整合性ルール 2 の参加者チェックのみに閉じる。
これにより Json のロジックを DB なしでテストできる。

## マイグレーション

破壊的変更（`Match` / `Entry` テーブル削除）だが、既存のマイグレーションは
`20260827000000_init` のみで本番データが存在しないため、init マイグレーションを作り直す。

1. `prisma/migrations/20260827000000_init/` を削除する
2. `prisma migrate dev --name init` で新しい init を生成する
3. `prisma generate` で `src/generated/prisma` を再生成する

## テスト

Vitest。DB を必要としない純関数のテストを中心に置く。

- `parse.ts` — 不正な Json（version 不一致、必須フィールド欠落、想定外の `kind`）を弾く
- `validate.ts` — 整合性ルール 1・3〜9 それぞれについて、通る例と弾く例
- `results.ts` — 結果反映の純関数について、新規追加 / 同じ matchId の上書き / 引き分けの扱い

整合性ルール 2（participantId の実在チェック）と楽観ロックの競合は DB の挙動を伴うため、
単体テストでは扱わない。

## 対象外

- 組み合わせの自動生成アルゴリズム（別途）
- 部門間の参加者引き継ぎ（予選の成績で決勝のシードを決める）
- 部門の進行状態（`status`）。`results` の埋まり具合から導出できるため列は持たない
- 認証・認可
