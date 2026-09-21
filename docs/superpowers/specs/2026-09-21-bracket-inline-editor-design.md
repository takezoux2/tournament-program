# トーナメント編集画面のインライン編集化 設計

日付: 2026-09-21
対象: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup`（SINGLE_ELIMINATION のみ）

## 目的

エントリー・組み合わせ編集画面を「プレビュー」と「試合名一覧」だけにし、
プレビュー上で直接ブラケットを組み立てられるようにする。

- プレビューが編集画面を兼ねる
- 「試合を追加」ボタンで 1 回戦の試合を追加する
- 1 回戦の各スロットに鉛筆アイコンの編集ボタンを置き、モーダルで選手を設定する
- 試合を追加・削除するたびに 2 回戦以降を自動で配線し直す
- 結果が 1 件でも登録されていれば、試合の追加・削除・選手変更はできない

## スコープ

- SINGLE_ELIMINATION のみ。DOUBLE_ELIMINATION_* は現行の `DivisionSetup` を使い続ける
  （setup ページが format で出し分ける）。ROUND_ROBIN は対象外（league ページ）。
- スキーマ変更なし。`Division.matchingConfig` / `entries` の Json をそのまま使う。

## データモデルと配線

1 回戦の試合の並び（`round === 1` の試合を `order` 順）を唯一の情報源にする。
試合 id は既存と同じ `m{round}-{order}`。

### `buildFromFirstRound(pairs: [SlotSource, SlotSource][]): MatchingConfig`

`src/features/division/single-elimination/build.ts` に追加する。

1. N = pairs.length。N === 0 なら空の組み合わせ。N === 1 なら 1 試合だけ（決勝）。
2. 1 回戦: pairs[k] を `m1-k`（round 1, order k）として並べる。
3. 2 回戦の入力位置数 P = nextPowerOfTwo(N)。`seedOrder(P)` で各位置のシード番号を求め、
   シード番号 > N の位置を bye、それ以外の位置に 1 回戦の勝者を**追加順に**詰める。
   seedOrder は k と P+1-k を対にするので、N > P/2 である限り bye どうしの対は生まれない。
   - 例 N=3（P=4）: 2 回戦 `[w0, bye] [w1, w2]`
   - 例 N=5（P=8）: 2 回戦 `[w0, bye] [w1, w2] [w3, bye] [w4, bye]`
4. 3 回戦以降は既存 `buildFromSlots` と同じく `winnerOf m{r-1}-{2o}` / `m{r-1}-{2o+1}`。
5. 全試合の `matchName` は `DEFAULT_MATCH_NAME`（名前の引き継ぎは呼び出し側）。

2 回戦以降に bye スロットが入るが、`src/lib/division/resolve.ts` は bye を相手に持つ
スロットを勝ち上がりとして扱うため、追加対応は不要。`validateMatchingConfig` も bye を許容する。
`isSingleEliminationShape` は「2 回戦以降は全スロット winnerOf」を条件にしているため、
**bye も許容するよう緩める**（league の星取表は 2 回戦以降を持たないので判別は崩れない）。

### 試合名の引き継ぎ

配線し直したあと、旧組み合わせから `matchName` を引き継ぐ
（`carryMatchNames(previous, next, renamedIds?)`）。

- 1 回戦: id で引き継ぐ。追加では id が変わらないので同じ id のまま。削除では後続の order が 1 つ詰まるため、
  `renamedIds`（旧 id → 新 id。削除した試合は null。載っていない id は同じ id のまま）で、
  詰める前の同じ試合の名前を新しい id へ引き継ぐ。
- 2 回戦以降: id ではなく「決勝からの深さ（最大 round − round、0 = 決勝）」と `order` の組で対応付ける。
  1 回戦の試合数が 2 の冪をまたぐと段数が伸び縮みし、同じ試合でも round 番号（＝ id）が変わるため
  （例: 3 試合の決勝 m3-0 は 2 試合に減ると m2-0 になる）。対応する深さが新しい木に無ければその名前は消える。
- 1 回戦の名前が 2 回戦以降へ、またはその逆へ移ることは無い。

### 空きスロット

空きは既存どおり `{ kind: "bye" }`。追加直後の試合は両スロット bye。

## 画面

### setup ページ

- format が SINGLE_ELIMINATION なら新コンポーネント `BracketEditorSetup` を、
  DE なら既存 `DivisionSetup` を描画する。
- `BracketEditorSetup` のセクションは 2 つだけ:
  1. **プレビュー**（編集可能）: 上部に「試合を追加」ボタン、その下に編集可能なブラケット
  2. **試合名**: 既存 `MatchOrderList`（結果登録後も編集可、現行どおり）
- エントリー一覧・D&D 入れ替え・生成ボタン・選手番号フォームは置かない
  （選手番号は参加者ページの `ParticipantList` で編集できる）。

### 例外表示

- 組み合わせが league 形状のまま（shape mismatch）、または生成できる数
  （`minEntries("SINGLE_ELIMINATION")` = 2）以上のエントリーがあるのに組み合わせが空:
  既存の Notice と「組み合わせを生成」ボタン（`GenerateMatchingForm`）を出す。
  生成後は通常の編集ができる。このとき試合名区画の空表示は「まだ組み合わせがありません」。
- エントリーが下限未満（1 件だけ等）で組み合わせが空: 生成は失敗するので、生成ボタンではなく
  通常のエディタ（「試合を追加」とブラケット）を出す。
- 1 回戦のどのスロットにも置かれていないエントリー（旧画面で登録したもの等）は「配置済み」と
  みなさない。その人はメンバー候補に残り、`assign-slot` で選ぶと新しいエントリーを足さずに
  既存のエントリーをそのままスロットに置く。
- 旧来のスロット系アクション（`add-entry` / `remove-entry` / `reorder-entry` / `swap-slots`）は
  SINGLE_ELIMINATION では何もしない（各スライスの「何も起きなかった」応答を返し、書き込まない）。
  これらは木を 2 の冪へ組み直して試合名を消すため。SE の編集は 1 回戦スライスだけで行い、
  逃げ道の `generate-matching` は SE でも従来どおり使える。
- 既知の制約: 試合の削除や 2 の冪をまたぐ組み直しで試合 id が振り直されると、その id を参照している
  `ScheduleItem` の行はずれたままになる（組み合わせの再生成と同じ制約）。
- 既存の、2 の冪までパディングされた組み合わせはそのまま読み込む。bye 対 bye の試合は
  空の試合として表示され、削除できる。

### ロック

どこかの試合に結果が登録されている場合:

- 既存の amber の `<output>` 通知を出す
- 「試合を追加」ボタン、鉛筆ボタンを disabled にする
- サーバー側も `runDivisionSetup` が `DivisionResultsRecordedError` を投げて拒否する

### 鉛筆ボタン

- 1 回戦の試合カードの各スロット（上下 2 つ）に表示。2 回戦以降には出さない。
- アイコンはインライン SVG（アイコンライブラリは入れない）。`aria-label` は `「<試合名 or 試合>の上側の選手を編集」` / `「…の下側の選手を編集」`
  （ブラケット上に並ぶボタンを区別できるよう試合名を含める）。
- `MatchCard` の既存 `nodrag nopan pointer-events-auto` パターンで React Flow 内でクリック可能にする。

### スロット編集モーダル

ネイティブ `<dialog>`（`ConfirmDialog` と同じ方式）。React Flow の外に 1 つだけ置く。
開いたスロット（試合名・上/下・現在の選手）を見出しに出す。

- **既存メンバーから選ぶ**: 組織のメンバーを `<select>`。この部門に既に配置済みのメンバーは除外。
  参加者（Participant）でなければ同時に作成する。
- **新規メンバーを作成**: 名前・かなを入力。Member と Participant を作成して配置
  （既存 add-entry の `mode:"new"` と同じ）。
- **スロットを空にする**: スロットを bye にし、その選手の DivisionEntry を削除する。
- **試合を削除**: その 1 回戦の試合を削除し、両スロットの選手の DivisionEntry を削除して配線し直す。

選手を差し替えた場合、前の選手の DivisionEntry は削除する。Participant・Member は削除しない。
成功したらモーダルを閉じ、失敗したらモーダル内にエラーを表示する。

## サーバー側

`src/features/division/<slice>/{handler.ts, usecase.ts, repository.ts, schema.ts}` の既存パターン。
すべて `runDivisionSetup`（トランザクション・validate・結果ロック）を通し、
SINGLE_ELIMINATION 以外は拒否する。変更後は setup ページを revalidate する。

| slice | 入力 | 振る舞い |
|---|---|---|
| `add-first-round-match` | なし | 両スロット bye の試合を末尾に追加し配線し直す。1 回戦 64 試合が上限 |
| `remove-first-round-match` | `{ matchId }` | 1 回戦の試合を削除、両スロットのエントリーを削除、配線し直す |
| `assign-slot` | `{ matchId, slotIndex, mode: "existing", memberId }` / `{ ..., mode: "new", name, nameKana }` | 選手を配置。前の選手のエントリーは削除 |
| `clear-slot` | `{ matchId, slotIndex }` | スロットを bye にしエントリーを削除 |

- `matchId` は round 1 の試合でなければ拒否。`slotIndex` は 0 か 1。
- 同じメンバーが既に部門内のスロットにいれば `assign-slot` は拒否。エントリーはあるがどのスロットにも
  置かれていなければ、そのエントリーを使い回してスロットに置く（エントリーを重複させない）。
- 新しいエントリーの `seed` は既存最大 + 1。
- 組み合わせが shape mismatch の場合は拒否（生成ボタンで作り直してもらう）。

## クライアント構成

- `DivisionBracket` に `editable?: boolean` を追加。true のとき `EditableBracket`（client）を使う。
- `EditableBracket` は `SlotEditContext`（`onEditSlot(matchId, slotIndex)`、`locked`）を提供し、
  `TournamentFlow` と `SlotEditDialog` を描画する。
- `MatchNode` / `MatchCard` は context がある場合のみ、1 回戦のスロットに鉛筆を出す。
  公開ページや結果画面の表示は変わらない。
- server action は setup ページから props で渡す（既存の `actions` パターン）。

## テスト（Vitest）

- `buildFromFirstRound`: N = 0, 1, 2, 3, 5, 8。bye 対 bye が生まれない、id と追加順が安定、
  `validateMatchingConfig` を通る、resolve で bye 側が勝ち上がる
- `carryMatchNames`: 同 id の名前を引き継ぐ、削除で詰めた場合
- `isSingleEliminationShape`: 2 回戦以降の bye を許容、league 形状は false のまま
- 各 slice の repository: 結果あり拒否、非 SE 拒否、round 1 以外拒否、
  スロットとエントリーの整合（差し替え・空・削除で旧エントリーが消える）、重複メンバー拒否、上限
- UI: `BracketEditorSetup` のロック時 disabled、`SlotEditDialog` の 4 操作、
  `MatchCard` は context なしで鉛筆を出さない、setup ページの format 出し分け
