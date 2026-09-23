# 部門エントリーの新種別（他部門の結果を参照する枠）設計

## 背景と目的

`Division.entries` の 1 件は今、必ず実在の `Participant` を指す。そのため
「予選リーグ A の 1 位」「予選トーナメント決勝の勝者」のように、**まだ誰か
決まっていない枠**を決勝トーナメントの山に置けない。運営は予選が終わるまで
決勝の組み合わせを作れず、終わってから手で入力し直している。

この変更で、エントリーに次の 2 種類を足す。

- 同じ大会の別部門の、ある試合の**勝者**または**敗者**
- 同じ大会の別部門（リーグ）の **N 位**

## スコープ

**入れるもの**

- シングルエリミネーション部門の 1 回戦スロット編集（`assign-slot` 経路）から、
  新種別のエントリーを置けるようにする
- 参照先の結果から実選手を解決し、画面・公開ページ・印刷・進行順に表示する
- 未解決の枠を含む試合では結果入力を伏せる

**入れないもの（今回は対象外）**

- `add-entry` 経路（リーグ・ダブルエリミネーションのエントリー一覧）への追加
- 別の大会の部門の参照
- リーグの同順位を手で決着させる仕組み

## 決定事項

| 論点 | 決定 |
|---|---|
| 参照できる範囲 | 同じ大会の、自部門以外の部門 |
| 実選手になるタイミング | 表示のたびに参照先から引き直す（解決結果は保存しない） |
| リーグで同順位のとき | 未確定のままにし、画面に警告を出す |
| 循環参照 | 保存は止めない。検知したら警告を出す |
| 未解決の枠を含む試合の結果入力 | 入力欄を出さず案内文に差し替える |

## データモデル

`src/lib/division/types.ts` の `DivisionEntry` を判別共用体にする。

```ts
/** エントリーが何に由来するか。未設定 = 従来どおり参加者を直接指す。 */
export type EntrySource =
  | { kind: "matchWinner"; divisionId: string; matchId: string }
  | { kind: "matchLoser"; divisionId: string; matchId: string }
  | { kind: "leagueRank"; divisionId: string; rank: number };

export type DivisionEntry = {
  id: string;
  seed: number;
  /** 省略時は participantId が必ずある（既存データ） */
  source?: EntrySource;
  /** source があるときは省略できる */
  participantId?: string;
};
```

`DivisionEntry.id` は不変で、`matchingConfig` のスロット参照も
`results.winnerEntryId` も今までどおりこの id を指す。**既存データは `source`
を持たないので、移行もバックフィルも要らない。**

`src/lib/division/parse.ts` に `source` の検証を足す。`divisionId` / `matchId`
は非空文字列、`rank` は 1 以上の整数。`source` も `participantId` も無い要素は
不正として弾く。

## 解決ロジック（本体）

新しい純関数モジュール `src/lib/division/entry-source.ts` を置く。DB は触らず、
渡された値だけで決まる純関数にする。

`lib` に置くのは、設定画面（`features/division`）と結果入力（`features/schedule`）の
両方が使うため。`docs/code-design/architecture.md` は features 同列の依存を禁じて
いるので、両方から見える下位共通層へ下ろす（`lib/division/resolve.ts` と同じ向き）。
これに伴い、順位付けの純粋部分（`rankStandings` / `readMatches`）も
`src/lib/division/standings.ts` へ移し、星取表（`toLeagueTableView`）は
`features/division/round-robin/` に残す。

入力は「同じ大会の全部門のスナップショット」（`divisionId` → `format` /
`entries` / `matchingConfig` / `results`）と、対象部門の id。
出力は `Map<entryId, ResolvedEntry>`。

```ts
export type ResolvedEntry =
  | { state: "resolved"; participantId: string; label: string }
  /** 参照先の結果がまだ出ていない */
  | { state: "pending"; label: string }
  /** 同順位で N 位が絞れない／循環している */
  | { state: "ambiguous"; label: string; reason: "tie" | "cycle" }
  /** 参照先の部門・試合が消えている */
  | { state: "broken"; label: string };
```

- `matchWinner` / `matchLoser` は参照先部門の `resolveMatchSlots` を使う。
  BYE による不戦勝もこれで自動的に効く。BYE を含む試合には敗者が生まれないため、
  その試合を `matchLoser` で参照している枠は `broken` にする。
- `leagueRank` は `src/lib/division/standings.ts` の順位（勝点 → 勝ち数 → 直接対決）を
  使う。同じ `rank` が複数いれば `{ state: "ambiguous", reason: "tie" }`。順位付けは
  同順位のとき番号を飛ばす（1, 1, 3）ので、**飛ばされた順位（この例の 2 位）も
  `ambiguous` にする**。`broken` はエントリー数より大きい順位のときだけ。
- `leagueRank` は参照先リーグの**全試合に記録が入るまで `pending`** にする。途中の
  順位で確定させると、残りの試合で順位がひっくり返ったときに決勝の組み合わせが
  黙って変わるため。
- 参照先のエントリーがさらに別部門を参照している場合は再帰する。
  **訪問済み集合で必ず止め**、循環を見つけたら
  `{ state: "ambiguous", reason: "cycle" }` にする。読み出しで例外は投げない。
- 参照先の部門・試合・順位が見つからなければ `broken`。

### 仮名（label）の文言

文言はこのモジュールだけが作り、画面・公開・印刷で同じ文字列を出す。

- `leagueRank` … `予選リーグA 1位`
- `matchWinner` … `予選トーナメント 第5試合の勝者`（展開済みの試合名があるとき）
  / `予選トーナメント 2回戦(1)の勝者`（無いとき。`matchPositionLabel` を使う）
- `matchLoser` … 同じ形で「の敗者」
- 参照先が消えている … `（参照先が見つかりません）`

## 読み込みと表示の配線

1 部門を描く画面は今、自分の部門しか読んでいない。参照先を引くため、次の経路で
同じ大会の全部門の JSON を 1 回読む（`listDivisionDetailsInTournament` が既にある）。

- `divisions/[divisionId]/page.tsx`（部門詳細）
- `divisions/[divisionId]/setup/page.tsx`
- 公開ページ（`t/[tournamentId]/...`）
- 印刷ページ（`t/[tournamentId]/print`）— 既に全部門を読んでいる

表示側は既存の関数に引数を 1 つ足すだけに抑える。

- `createSlotLabeler(matchNames, entries, participants, resolved)` … 解決結果の表を
  受け取り、`resolved` に `label` があればそれを、なければ従来どおり参加者名を出す。
- `from-division.ts` … 入力に `entryLabels`（entryId → 表示名）を足す。参加者から
  名前を引けないエントリーはこの表から引く。ブラケット描画と印刷は
  `prepareBracket` のオプション 1 つで仮名が出る。
- `EntryList` … 参照エントリーの行は仮名と参照先（`予選リーグA`）を出し、
  選手番号フォームは出さない。

## 運営の操作

`SlotEditDialog` のモードを 4 つにする。

| モード | 入力 |
|---|---|
| 既存のメンバーから選ぶ | 現状のまま |
| 新しく登録する | 現状のまま |
| 他部門の試合の結果 | 部門 → 試合 → 勝者 / 敗者 |
| 他部門のリーグ順位 | リーグ部門 → 順位 N |

- 部門の選択肢は同じ大会の自部門以外。リーグ順位は `ROUND_ROBIN` の部門だけ。
- 試合の選択肢は参照先部門の全試合（展開済みの試合名で表示）。
- `rank` の上限は参照先部門のエントリー数。

サーバー側は `add-entry/schema.ts` の `addEntrySchema` に 2 つの枝を足す
（`mode: "matchResult"` / `mode: "leagueRank"`）。`assign-slot` の
repository は、この 2 つでは Member / Participant を作らず、`source` を持つ
エントリーを作ってスロットに置く。`add-entry` 経路は今回この枝を受け付けない
（スコープ外のため handler で弾く）。

`clearSlot` と「試合を削除」は現状のまま効く。スロットから外れた参照エントリーは
従来のエントリーと同じく再利用される。

## 警告

setup 画面に 1 行の注意書きとして出す。保存やデータは止めない。

- 同順位で絞れない … `予選リーグA 1位 は同順位のため決まりません`（枠ごとに 1 行）
- 循環参照がある … `参照が循環しているため、選手が決まりません`（何件あっても 1 行）
- 参照先が見つからない … `参照先が見つからない枠があります`（何件あっても 1 行）
- 解決の結果、同じ人が 2 枠に入る … `山田太郎 が 2 つの枠に入っています`

## 結果入力

未解決（`pending` / `ambiguous` / `broken`）の枠を含む試合は、勝者ボタンと
スコア欄を出さず `予選リーグA 1位 の結果待ちです` の 1 行に差し替える。
既にある記録は消さない・書き換えない（`resultConfig` の enabled と同じ思想）。

## テスト

- `entry-source.ts`（`src/features/division/entry-source.test.ts`） … 未確定 / 同順位 / 参照先削除 / 循環 / BYE 経由の勝者・敗者 /
  多段（A→B→C）の解決
- `parse.ts` … `source` の検証、`source` も `participantId` も無い要素を弾く
- `assign-slot` … スキーマの 2 枝、Member を作らないこと、スロットに置かれること
- `SlotEditDialog` … 自部門が選択肢に出ないこと、リーグ順位はリーグ部門だけ
- 結果入力行 … 未解決の枠で入力欄が出ず案内文になること
- ブラケット / 印刷 … 仮名が描かれること
