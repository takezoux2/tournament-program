# 団体戦（TEAM_MATCH）設計

作成日: 2026-09-23

## 背景と目的

今の `Division` は「形式 × 個人のエントリー」で組まれていて、チームとチームが
戦う形式を表せない。`Participant.team` は一覧に添える自由文字列でしかなく、
構造を持たない。

団体戦を入れる。団体戦は **2 チームがそれぞれ同じ人数の選手を並べ、
出場順が同じ者どうしが 1 ペアずつ戦う** 形式で、勝った本数の多いチームが
その団体戦の勝者になる。

## スコープ

含む:

* 大会単位の `Team` テーブルと、チーム管理画面（CRUD・参加者の割り当て・並べ替え）
* `DivisionFormat` への `TEAM_MATCH` の追加
* 団体戦の専用設定画面（2 チームの選択と、チームごとの出場順の並べ替え）
* 組み合わせの組み立て（位置 i どうしを 1 試合にする）
* チームの勝敗集計（勝利数 → 本数差 → 引き分け）
* 個人戦 1 本ごとの引き分け入力（`ROUND_ROBIN` の引き分けもこれで入力できるようになる）
* 部門詳細・公開部門ページ・印刷への団体戦の表示

含まない:

* **代表戦**。勝利数も本数も同じときは「引き分け」と表示して止める（後述の「将来の拡張」）
* 団体戦どうしの勝ち上がり（団体戦のトーナメント・リーグ）。1 部門 = 1 カード
* チームを大会をまたいで使い回す仕組み。`Team` は大会単位
* 選手の途中交代・オーダー変更の履歴

## 既存の未実装 spec との関係

`docs/superpowers/specs/` に、同じ日付で未実装の spec が 2 本ある。
どちらもプランもブランチも無く、コードは未着手である。

| spec | 関係 |
| --- | --- |
| `2026-09-23-division-entry-source-design.md` | **衝突する**。`DivisionEntry` を判別共用体にして `participantId` を省略可能にする。本 spec は同じ型に `teamId?` を足す。両方入れる場合、`teamId` は判別共用体のどの枝にも付きうる横断的な属性として残る（`source` と排他ではない）。先に入った方に後から入る方が合わせる |
| `2026-09-23-remove-double-elimination-design.md` | **軽く触れる**。`EditableFormat` の顔ぶれと `MAX_ENTRIES` / `MIN_ENTRIES` の `Record` の行が変わるだけで、団体戦の設計には影響しない。DE 削除が先に入っていれば `TEAM_MATCH` の行を足すだけで済む |

## 決定事項

| 論点 | 決定 |
| --- | --- |
| 形式の位置づけ | `DivisionFormat` に `TEAM_MATCH` を 1 つ足す。1 部門 = 1 カード（A 中学 vs B 中学） |
| チームの持ち方 | 大会単位の `Team` テーブル。`Participant.teamId` で所属を持つ |
| 既存の `Participant.team`（自由文字列） | マイグレーションで `Team` 行に移し、列は落とす。所属の情報源を 1 つにする |
| 出場順（先鋒→大将） | 部門ごとに決める。`Division.entries` の `seed` がチーム内の出場順 |
| 人数が揃わないとき | 多い側に合わせて試合を作り、足りない側の位置は `bye`（不戦勝） |
| チームの勝敗 | 勝利数 → 同数なら本数の合計 → それでも同数なら引き分け |
| 代表戦 | 今回は置かない |
| 1 本ごとの引き分け | 入力できるようにする。`TEAM_MATCH` と `ROUND_ROBIN` で許可 |
| 設定画面 | `/league` と同じく専用ページ `/divisions/[divisionId]/team` を持つ。`/setup`（D&D エディタ）は対象外 |

## データモデル

### Team

```prisma
/// チーム。大会単位のマスタで、団体戦部門から参照する。
model Team {
  id           String   @id @default(uuid())
  tournamentId String
  name         String
  /// 大会内での表示順。0 始まり。
  order        Int
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tournament   Tournament    @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  participants Participant[]

  @@unique([tournamentId, order])
  @@index([tournamentId])
}
```

`Participant` に次を足す。

```prisma
  teamId String?
  team   Team?  @relation(fields: [teamId], references: [id], onDelete: SetNull)
```

`onDelete: SetNull` にするのは、チームを消したときに参加者まで消えないため。
所属が外れるだけで、参加者は大会に残る。

`@@unique([tournamentId, order])` があるため、並べ替えは
`features/division/reorder/repository.ts` と同じく、いったん `order = -1`
（`PARKING_ORDER`）へ退避してから入れ替える。

### 既存の Participant.team の移行

同じマイグレーションの中で、大会ごとに非空で distinct な `team` の値から
`Team` 行を作り（`order` は名前順の 0 始まり）、`Participant.teamId` を張り、
`team` 列を落とす。

`features/participant/repository.ts` と `features/division/repository.ts` が
返す DTO の `team?: string` は名前を変えない（`row.team` → `row.team?.name`
に読み替えるだけ）。一覧の描画コードは触らない。

### Division.entries

`src/lib/division/types.ts` を次のように拡張する。

```ts
export type DivisionEntry = {
  id: string;
  participantId: string;
  /** TEAM_MATCH では「チーム内の出場順」。0 = 先鋒 */
  seed: number;
  /** TEAM_MATCH でのみ入る。Team.id */
  teamId?: string;
};

export type DivisionEntries = {
  version: 1;
  entries: DivisionEntry[];
  /** TEAM_MATCH でのみ入る。左・右の順に Team.id を 2 つ */
  teams?: [string, string];
};
```

`teams` を `entries` 列の中に置くのは、`setup-store.ts` の read-modify-write
（所有権つきの読み出し → パース → 検証 → `updateMany` での書き戻し）が
そのまま使えるため。列を増やすと全スライスがその列を運ぶ必要が出る。

## 検証

`src/lib/division/validate.ts` の `validateEntries` は `format` を受け取る。

* `TEAM_MATCH` 以外: 今まで通り。`seed` は entries 全体で一意
* `TEAM_MATCH`: `seed` は **(teamId, seed) の組** で一意。加えて
  * `teams` がちょうど 2 件で、相異なること
  * すべての entry の `teamId` が `teams` のどちらかであること
  * `teams` が未設定なら「チームが選ばれていません」

`id` の重複と `participantId` の重複、`participantId` の実在確認は形式に依らず同じ。
同じ参加者が両チームに入ることは `participantId` の重複検査が弾く。

`validateResults` は `winnerEntryId === null`（引き分け）を
`ROUND_ROBIN` と `TEAM_MATCH` の 2 形式で許す。

## 組み合わせの組み立て

`src/features/division/team-match/` を、`round-robin/` と同じ
「スライスではなくカテゴリ直下に置く共有ドメイン」として作る。
`handler.ts` と `repository.ts` を持たないことでスライスと見分けられる。

### build.ts

```ts
export const buildTeamMatch = (entries: DivisionEntries): MatchingConfig
```

* `entries.teams` が無ければ空を返す（呼び出し側はそれを「作れなかった」と読む）
* 左右それぞれのチームの entry を `seed` 昇順に並べる
* どちらかのチームが 0 人なら空を返す。全試合が不戦勝になる組み合わせは
  団体戦として読めないため、「作れなかった」に倒す
* `N = max(左の人数, 右の人数)`
* 位置 `i` の試合:

```ts
{
  id: `t1-${i}`,
  bracket: "winners",
  round: 1,
  order: i,
  matchName: DEFAULT_MATCH_NAME,
  slots: [左[i] ?? { kind: "bye" }, 右[i] ?? { kind: "bye" }],
}
```

試合 id の接頭辞を `t1-` にするのは、`m{round}-{order}`（トーナメント）・
`r1-{order}`（リーグ）と同じ理由で、形式を取り違えたデータが混ざったときに
見分けるため。`1` は「団体戦に節は無い（`round` は常に 1）」ことを表す。

`N` を max で取るので、両側が `bye` になる位置は生じない。
片側が `bye` の試合は `lib/division/resolve.ts` の `decideWinner` が
記録なしで勝者を決めるため、不戦勝の集計を別に書く必要はない。

```ts
export const isTeamMatchShape = (config: MatchingConfig): boolean
```

全スロットが `entry` か `bye` であることを見る（`winnerOf` / `loserOf` を
含まない）。`/edit` は `format` を無条件に書き換えられるため、トーナメントの
木を持ったまま `TEAM_MATCH` になった部門が存在しうる。リーグの
`isRoundRobinShape` と同じ役割で、判定が `bye` を許す点だけが違う。

### matching-strategy.ts

* `EDITABLE_FORMATS` に `"TEAM_MATCH"` を足す
* `MAX_ENTRIES.TEAM_MATCH = 40`（1 チーム 20 人）、`MIN_ENTRIES.TEAM_MATCH = 2`。
  `MIN_ENTRIES` は entries 全体の数しか見ないので、「各チーム 1 人以上」は
  `buildTeamMatch`（片側 0 人なら空）が担保する
* `regenerateMatching` / `applyEntryAdded` / `applyEntryReordered` は
  いずれも `buildTeamMatch` で**まるごと作り直す**。リーグと同じ理由で、
  1 人増えれば以降の全位置がずれるため、部分更新に相当する操作が存在しない
* 上限超過なら空を返す（`buildRoundRobinWithinCap` と同じ形）
* `isSlotBracketFormat` は `TEAM_MATCH` に対して false のまま。
  これにより D&D エディタ（`/setup`）と `swap-slots` は自動的に対象外になる

## 勝敗の集計

`src/features/division/team-match/standings.ts` に純粋関数として置く
（`round-robin/standings.ts` と同じ位置づけ）。

```ts
export type TeamMatchRow = {
  matchId: string;
  /** 0 = 先鋒。build の order と同じ */
  position: number;
  /** スロット順。BYE は null */
  entryIds: [string | null, string | null];
  /** 未記録は null。BYE の自動勝ちを含む */
  winnerEntryId: string | null;
  /** 記録があって winnerEntryId が null なら引き分け */
  drawn: boolean;
  /** resultConfig.score が有効なときだけ。スロット順 */
  points: [number | null, number | null];
};

export type TeamMatchOutcome =
  | { kind: "undecided" }
  | { kind: "win"; side: 0 | 1; by: "wins" | "points" }
  | { kind: "draw" };

export type TeamMatchStandings = {
  rows: TeamMatchRow[];
  wins: [number, number];
  draws: number;
  /** score が無効なら [null, null] */
  points: [number | null, number | null];
  outcome: TeamMatchOutcome;
};
```

手順:

1. `resolveMatchSlots(config, results)` で各試合のスロットと勝者を得る。
   BYE の自動勝ちはここに含まれる
2. 未記録の試合（BYE でもなく記録も無い）が 1 つでもあれば `undecided`
3. 勝利数を数える。多い側が `{ kind: "win", by: "wins" }`
4. 同数なら本数を比べる。`resultConfig.score.enabled` が false なら
   この段は飛ばす。`aggregateScore` で 1 試合ぶん 1 人ぶんを出し、
   チームごとに全試合を合計する。多い側が `{ kind: "win", by: "points" }`
5. それでも同じなら `{ kind: "draw" }`

`aggregation` が `"average"` の部門でも同じ経路を通す。平均の合計は
本数として不自然だが、`resultConfig` は「表示と入力のフィルタ」でしかない
という既存の思想に合わせ、勝敗判定のために集計方法を上書きはしない。

片側しかスコアが入っていない試合は、入っている側だけが合計に乗る
（`aggregateScore` が未入力を 0 として扱わないのと同じ理由）。

## 引き分けの入力

現状 `record-result/schema.ts` の `winnerEntryId` は文字列で、空文字が
「記録を取り消す」を表す。引き分けを送る手段が無いため、
`MatchResultRecord.winnerEntryId = null`（引き分け）はどこからも書かれていない。

* スキーマに番兵 `"draw"` を足す。空文字 = 取消は据え置き
* usecase は `"draw"` を `winnerEntryId: null` として保存する
* `validateResults` は `null` を `ROUND_ROBIN` / `TEAM_MATCH` で許す
* `components/result/MatchResultRow.tsx` に「引分」ボタンを足す。
  出すのは引き分けを許す形式のときだけで、形式は行のデータに載せて運ぶ

副作用として、リーグの星取表・順位表の「分 / △」列が、これまで一度も
埋まらなかったのが動くようになる。

## 画面

| 画面 | 対応 |
| --- | --- |
| `/orgs/[slug]/tournaments/[tournamentId]/teams` | **新規**。チームの一覧・追加・改名・削除・並べ替えと、参加者の割り当て／解除 |
| `/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/team` | **新規**。`/league` と同じ立て付け。2 チームを選び、チームごとに出場順を並べ替え、組み合わせを生成する |
| `/.../divisions/[divisionId]/setup` | 変更なし。`isSlotBracketFormat` が false なので `TEAM_MATCH` は `notFound()` に落ちる |
| 部門詳細・公開部門ページ | `components/division/DivisionMatchingView.tsx` の switch に `TeamMatchTable` を足す |
| 印刷 `components/print/PrintDivisionSection.tsx` | `TEAM_MATCH` の節を足す |
| 進行順・結果入力 | **変更なし**。1 本が 1 `BracketMatch` なので既存の経路にそのまま乗る |

### features/team のスライス

`create` / `rename` / `delete` / `reorder` / `assign-participant`。
いずれも `requireOrganization` と `requirePermission` を Server Action の
冒頭で独立に呼び、所有権は `where: { id, tournament: { id: tournamentId,
organizationId } }` のリレーションフィルタで担保する（`features/division` と同じ 3 段）。
`create` だけは `where` を持てないため、同じトランザクションで大会の所属を
確かめてから作る。

`reorder` の 0 件応答は `features/division/reorder` と同じ扱いで、
「端まで来ている」と「その対象が無い」を区別せず、どちらも
`{ swapped: false }` のまま `{ error: null }` を返す。

### TeamMatchTable

左右 2 チームの名前と総合スコア（`2 - 1`）を見出しに出し、位置ごとに
1 行を並べる。行には試合名（`{{OverallSeq}}` 展開済み）、両者の名前、
勝敗の印（○ / − / △）、本数（有効なときだけ）を出す。
`outcome` が決まっていれば見出しの下に「勝者 A 中学（本数差）」を出す。

`prepare-league-table.ts` と同じく、Json のパースと形の検査を受け止める
`prepare-team-match-table.ts` を `components/division/` に置き、
形が合わなければ `Notice` に倒す。

### 形式ディスパッチの漏れ検出

次の 5 か所は `Record<DivisionFormat, _>` か網羅的 `switch` なので、
enum に `TEAM_MATCH` を足した時点で書き忘れがコンパイルエラーになる。
これを漏れ検出の主な手段にする。

* `features/division/format.ts` の `DIVISION_FORMAT_LABELS` / `USES_PARTICIPANTS`
* `features/division/matching-strategy.ts` の `MAX_ENTRIES` / `MIN_ENTRIES` / `regenerateMatching` / `applyEntryAdded` / `applyEntryReordered`
* `components/division/DivisionMatchingView.tsx`
* `components/division/prepare-bracket.ts`
* `features/bracket/from-division.ts`

`components/public/PublicScheduleList.tsx` と
`app/.../divisions/[divisionId]/league/page.tsx` は形式を文字列で比較して
いるので、コンパイルエラーにはならない。手で確認する。

ラベルは `DIVISION_FORMAT_LABELS.TEAM_MATCH = "団体戦"`。

## テスト方針

既存に倣い TDD で進める。各スライスに `handler.test.ts` / `repository.test.ts`、
純粋ロジックに `build.test.ts` / `standings.test.ts` / `validate.test.ts` の追記。

`standings.test.ts` の要点:

| ケース | 期待 |
| --- | --- |
| 未記録の試合が残っている | `{ kind: "undecided" }` |
| 2 勝 1 敗 | `{ kind: "win", side, by: "wins" }` |
| 1 勝 1 敗 1 分、本数 3 対 2 | `{ kind: "win", side, by: "points" }` |
| 1 勝 1 敗 1 分、本数も同じ | `{ kind: "draw" }` |
| 勝ち数同数・`score.enabled` が false | `{ kind: "draw" }`（本数の段を飛ばす） |
| 片側が 2 人・もう片側が 3 人 | 3 試合できて、3 本目は BYE の側の不戦勝 |
| 片側だけスコア入力済み | その側だけが合計に乗る |

`build.test.ts` の要点:

* `teams` が無ければ空
* 3 人対 3 人で 3 試合、位置どうしが組まれている
* 3 人対 2 人で 3 試合、3 本目の片側が `bye`
* `seed` が飛び飛び（0, 2, 5）でも昇順の位置に詰めて組まれる
* `isTeamMatchShape` が `winnerOf` を含む木に false を返す

## 実装の段取り

3 段に分け、各段でテストを通してからコミットする。

1. **Team の基盤** — `Team` テーブル、`Participant.team` の移行マイグレーション、
   `features/team` の 5 スライス、チーム管理画面。この段では団体戦はまだ無い
2. **TEAM_MATCH 形式** — enum への追加、`DivisionEntry.teamId` と
   `DivisionEntries.teams`、`validateEntries` の形式対応、`team-match/build.ts`、
   `matching-strategy.ts`、専用設定画面 `/divisions/[divisionId]/team`
3. **集計と表示** — `team-match/standings.ts`、引き分け入力、`TeamMatchTable`、
   部門詳細・公開ページ・印刷への組み込み

## 将来の拡張

**代表戦**。勝利数も本数も同じときに、両チームから 1 人ずつ選んで 1 試合行い、
その勝者を団体戦の勝者とする。`standings.ts` が `{ kind: "draw" }` を返す
ところが差し込み口になる。`SlotSource` に「チームの代表（未定）」を表す枝を
足して組み合わせに常設するか、同数になってから試合を足すかは、そのときに決める。

**団体戦の勝ち上がり**。団体戦どうしのトーナメント・リーグ。
`2026-09-23-division-entry-source-design.md` の「他部門の結果を参照する枠」が
入っていれば、団体戦部門を並べて次の部門から参照する形で近いことはできる。
