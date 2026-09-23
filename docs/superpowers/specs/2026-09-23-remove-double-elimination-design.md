# ダブルエリミネーション機能の削除 設計

作成日: 2026-09-23

## 目的

`DOUBLE_ELIMINATION_GRAND_FINAL` / `DOUBLE_ELIMINATION_THIRD_PLACE` 形式を製品から取り除く。
2026-09-17 に入れた組み合わせ生成・編集・描画の一式（`docs/superpowers/specs/2026-09-17-double-elimination-design.md`）を、
それが導入した抽象ごと畳んで、シングルエリミネーションとリーグの 2 形式だけを扱う状態に戻す。

## スコープ

含む:

* `DivisionFormat` enum から DE 2 値を削除するマイグレーション（既存 DE 部門は行ごと削除）
* `src/features/division/double-elimination/` の削除
* DE を扱うために導入した `SlotBracketFormat` 抽象の畳み込み
* 形式ディスパッチ（ラベル・リンク・描画・印刷）から DE の分岐を削除
* 上記に追従するテストの更新

含まない:

* `SlotSource` の `loserOf`、`BracketSide` の `"losers"` / `"final"` の削除。**残す**（後述）
* `BracketMatch.bracket` フィールドの削除
* `matchingConfig` Json の書き換えマイグレーション
* 2026-09-17 の spec / plan の削除・改変（日付つきの実施記録なのでそのまま残す）

## 決定事項

| 項目 | 決定 |
| --- | --- |
| DB の enum 値 | 削除する。`SINGLE_ELIMINATION` / `ROUND_ROBIN` の 2 値にする |
| 既存の DE 部門 | マイグレーションで `DELETE`。`ScheduleItem` は FK の `onDelete: Cascade` で追従する |
| `BracketMatch.bracket` | 今のまま残す（`"winners" \| "losers" \| "final"`）。Json の書き換えをしないため |
| `SlotSource.loserOf` | 残す。同上 |
| `SlotBracketFormat` 抽象 | 畳む。メンバーが `"SINGLE_ELIMINATION"` 1 つだけになるため |
| `EditableFormat` | 残す。メンバーが 2 つ残り、網羅チェックが意味を持つため |
| `minEntries` / `maxEntries` | 残す。`Record<EditableFormat, number>` から DE の行だけ削る |
| 不整合ガード（`from-division`） | 残す。DE が無くなっても旧データ・形式書き換えに対して必要 |

## スキーマとマイグレーション

`prisma/schema.prisma`:

```prisma
enum DivisionFormat {
  /// シングルエリミネーション
  SINGLE_ELIMINATION
  /// リーグ（総当たり）
  ROUND_ROBIN
}
```

PostgreSQL は enum 値を直接 `DROP` できないため、型を作り直す。
`prisma migrate dev --create-only` で雛形を作り、先頭に `DELETE` を足す。

マイグレーション名: `20260923HHMMSS_remove_double_elimination`

```sql
DELETE FROM "Division"
 WHERE "format" IN ('DOUBLE_ELIMINATION_GRAND_FINAL', 'DOUBLE_ELIMINATION_THIRD_PLACE');

CREATE TYPE "DivisionFormat_new" AS ENUM ('SINGLE_ELIMINATION', 'ROUND_ROBIN');
ALTER TABLE "Division" ALTER COLUMN "format"
  TYPE "DivisionFormat_new" USING ("format"::text::"DivisionFormat_new");
ALTER TYPE "DivisionFormat" RENAME TO "DivisionFormat_old";
ALTER TYPE "DivisionFormat_new" RENAME TO "DivisionFormat";
DROP TYPE "DivisionFormat_old";
```

`DELETE` を型の入れ替えより**先**に置くこと。DE 行が残ったままだと `USING` のキャストが
その行で失敗し、マイグレーション全体がロールバックする。

`Division.format` に `@default` は無いので、既定値の付け外しは要らない。

既存 DE 部門のエントリー・勝敗記録も一緒に消える。適用対象はローカル開発 DB だけで、
他に DB は無いことを 2026-09-23 に確認済み。ローカルの該当は
`DOUBLE_ELIMINATION_GRAND_FINAL` 2 件で、消えて困るデータではない。

## 生成ロジック

### 削除

`src/features/division/double-elimination/` をディレクトリごと削除する。

* `build.ts`（`buildDoubleElimination` / `isDoubleEliminationShape` / `DoubleEliminationVariant`）
* `build.test.ts`

### `matching-strategy.ts`

DE を扱うための分岐と抽象を削る。

```ts
export const EDITABLE_FORMATS = [
  "SINGLE_ELIMINATION",
  "ROUND_ROBIN",
] as const satisfies readonly DivisionFormat[];

const MAX_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 128,
  ROUND_ROBIN: 16,
};

const MIN_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 2,
  ROUND_ROBIN: 2,
};
```

削除する定義:

* `SlotBracketFormat` / `isSlotBracketFormat`
* `buildSlotBracket` / `matchesSlotBracketShape`
* `VARIANTS` / `buildSlotBracketWithinCap`

`regenerateMatching` / `applyEntryAdded` / `applyEntryReordered` は `EditableFormat`
2 値に対する網羅 `switch` として残し、DE の `case` を落として
`buildFromSlots` / `isSingleEliminationShape` を直接呼ぶ形に戻す。
`buildRoundRobinWithinCap` はそのまま。

`applyEntryAdded` の `SINGLE_ELIMINATION` ケースに付いている「読めない形の組み合わせは
触らず `current` を同じ参照で返す」というコメントと挙動は残す。リーグの星取表を持ったまま
形式を書き換えられた部門は DE の有無に関係なく存在しうるため。

### 呼び出し側

`isSlotBracketFormat` / `buildSlotBracket` / `matchesSlotBracketShape` を使う 3 ファイルを
直接判定に戻す。`format === "SINGLE_ELIMINATION"` でも同じ型の絞り込みが効くため挙動は変わらない。

| ファイル | 変更 |
| --- | --- |
| `src/features/division/swap-slots/repository.ts` | `isSlotBracketFormat(format)` → `format === "SINGLE_ELIMINATION"`、`buildSlotBracket(format, slots)` → `buildFromSlots(slots)`、`matchesSlotBracketShape(format, ...)` → `isSingleEliminationShape(...)` |
| `src/components/division/DivisionSetup.tsx` | 同上 |
| `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx` | ガードを `division.format !== "SINGLE_ELIMINATION"` に |

`minEntries` / `maxEntries` だけを使う 4 ファイル
（`add-entry/repository.ts`、`remove-entry/repository.ts`、`generate-matching/repository.ts`、
`BracketEditorSetup.tsx`）は**無変更**。

## 表示側

| ファイル | 変更 |
| --- | --- |
| `src/features/division/format.ts` | `DIVISION_FORMAT_LABELS` と `USES_PARTICIPANTS` から DE の 2 行を削除 |
| `src/components/division/DivisionDetail.tsx` | `SETUP_LINKS` から DE の 2 エントリーを削除 |
| `src/components/division/DivisionMatchingView.tsx` | `switch` の DE `case` を削除 |
| `src/components/print/PrintDivisionSection.tsx` | 同上 |
| `src/features/bracket/from-division.ts` | `BRACKET_FORMATS` を `["SINGLE_ELIMINATION"]` に |

`DIVISION_FORMATS` は `Object.values(DivisionFormat)` なので、部門の作成・編集フォーム
（`DivisionForm.tsx`）の選択肢は enum が縮むのに追従して 2 つになる。フォーム自体は触らない。

`DivisionMatchingView` / `PrintDivisionSection` の末尾にある `const exhaustive: never` は
残す。形式を足したときに分岐の書き忘れをコンパイルエラーにする仕掛けで、DE とは無関係。

### `from-division.ts` の不整合ガード

`BRACKET_FORMATS` が 1 要素になると `const singleElimination = input.format === "SINGLE_ELIMINATION"`
が恒真になる。変数を削除し、ガードを無条件にする。

```ts
    if (source.bracket !== "winners") {
      return null;
    }
    for (const slot of source.slots) {
      if (slot.kind === "loserOf") {
        return null;
      }
```

このガードは**残す**。DE を作る手段が無くなっても、削除前に作られた Json や、
形式を書き換えられた部門から敗者側の試合が渡ってくることはありうる。
勝ち上がり木として描けないものを「描かない」で弾く役目は変わらない。

## 残すもの

次は型にも実装にも残す。生成する側が無くなるので実質デッドパスになるが、
既存 Json の読み取り互換が保たれ、`matchingConfig` の書き換えマイグレーションが要らなくなる。

* `src/lib/division/types.ts`: `SlotSource` の `{ kind: "loserOf" }`、`BracketSide` の `"losers" | "final"`
* `src/features/bracket/types.ts`: 同じ 2 つ
* `src/lib/division/parse.ts`: `loserOf` のパース、`BRACKET_SIDES`、`bracket` の並び順
* `src/lib/division/label.ts`: `loserOf` の文言、`losers` / `final` の見出し
* `src/lib/division/resolve.ts`: `loserOf` の解決、依存表
* `src/lib/division/validate.ts`: `loserOf` の参照検証
* `src/features/bracket/layout-bracket.ts`: `SIDES` の 3 要素、敗者側の段組み、「敗者側」ラベル

## コメントの手当て

ダブルエリミネーションを説明に使っているコメントが、削除後も残るコードに散っている。
実装を変えずに文言だけ直す。「ダブルエリミのために用意した」ではなく
「`losers` / `final` を持つ Json を読んだときのため」と書き換えるのが基本方針。

| ファイル | 内容 |
| --- | --- |
| `src/lib/division/types.ts` | `BracketSide` の「シングルエリミネーションとリーグは "winners" 固定」を、型に `losers` / `final` が残っている理由の説明に書き換える |
| `src/lib/division/parse.ts` (L203, L211, L217-218) | 並び順が「ブラケットを先に見る」理由の説明から DE への言及を外す |
| `src/lib/division/label.ts` (L68-69, L84) | 勝者側・敗者側・決勝を書き分ける理由の説明を直す |
| `src/lib/division/resolve.ts` (L89-90) | BYE を含む試合に敗者が生まれない扱いの理由から DE への言及を外す |
| `src/features/schedule/result-rows.ts` (L167) | 同上 |
| `src/components/tournament/SectionNode.tsx` (L4) | 「ダブルエリミネーションの見出し」→ `losers` / `final` を持つ組み合わせの見出し |
| `src/features/division/first-round-store.ts` (L20) | 「ダブルエリミは対象外」の但し書きを削除（対象が SE だけになり無意味になる） |
| `src/components/division/BracketEditorSetup.tsx` (L30) | 同上 |
| `src/features/division/matching-strategy.ts` (L51, L60-61, L128, L149, L169-171) | DE の上限・下限・WithinCap を説明した箇所。定義ごと消えるものは一緒に消し、残る `buildRoundRobinWithinCap` と `applyEntryAdded` の説明から DE を外す |

## テスト

DE を参照するテストから該当ケースを削除・更新する。

* `src/features/division/matching-strategy.test.ts` — `isEditableFormat` / `isSlotBracketFormat` /
  `buildSlotBracket` / `matchesSlotBracketShape` のケース。畳んだ関数のテストは削除、
  `regenerateMatching` などは SE / RR の 2 形式に絞る
* `src/features/division/format.test.ts`
* `src/features/bracket/from-division.test.ts`
* `src/features/division/{swap-slots,add-entry,remove-entry,reorder-entry,generate-matching,set-match-name}/repository.test.ts`
* `src/features/division/remove-entry/handler.test.ts`
* `src/features/division/{setup-store,first-round-store}.test.ts`
* `src/components/division/{DivisionMatchingView,DivisionDetail,DivisionList,DivisionBracket}.test.tsx`
* `src/components/print/PrintBracket.test.tsx`
* `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx`
* `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx`
* `src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`

判定の基準は「`DivisionFormat` の DE 値か `buildDoubleElimination` に依存しているか」。
依存しているケースは enum と関数が消えるとコンパイルが通らないので削除する。
例: `DivisionBracket.test.tsx` の「ダブルエリミネーションは試合とセクションラベルを描く」は
`format: "DOUBLE_ELIMINATION_GRAND_FINAL"` と `buildDoubleElimination` を使うので削除する。

`loserOf` / `losers` を **`MatchingConfig` の値として**検証していて DE 値にも
`buildDoubleElimination` にも依存していないテストは、その振る舞いを残す以上そのまま維持する:

* `src/lib/division/{parse,label,validate}.test.ts`
* `src/features/bracket/{layout-bracket,resolve-bracket,to-flow-elements}.test.ts`
* `DivisionBracket.test.tsx` の「敗者復活を含む組み合わせは未対応として案内する」
  （`SINGLE_ELIMINATION` の部門に `losers` の試合を混ぜて描かれないことを見るガードのテスト）
* `from-division.test.ts` の同趣旨のケース

ただしテスト名に「ダブルエリミネーション」と書いてあるものは文言を直す
（`parse.test.ts` L256/L272、`label.test.ts` L125）。検証している振る舞いは変えない。

## 検証

1. `pnpm exec prisma migrate dev` をローカル DB に適用し、`Division` の
   `format` 分布が `SINGLE_ELIMINATION` / `ROUND_ROBIN` だけになることを確認
2. `pnpm exec prisma generate`（`src/generated/prisma/enums.ts` の追従）
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm lint`
6. 手動確認（`BYPASS_AUTH=1`、Cookie `USER_ID=1`）:
   部門作成フォームの選択肢が 2 つになること、既存のシングル部門とリーグ部門の
   詳細・組み合わせ編集・結果入力・印刷が壊れていないこと
