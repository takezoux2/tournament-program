# シングルエリミネーション編集画面 設計

作成日: 2026-09-02

## 目的

`Division` の `entries`（誰が出るか）と `matchingConfig`（組み合わせ）を編集する画面を作る。
現状この 2 つの Json 列には既定値の空データしか入らず、編集する手段が無い。
そのため部門詳細ページのブラケットは常に「組み合わせが未作成です」を表示している。

対象は `SINGLE_ELIMINATION` 形式の部門のみ。

## スコープ

含む:

* エントリーの追加・削除・並べ替え
* エントリー追加時の `Member` / `Participant` の作成
* 組み合わせの自動生成
* 1 回戦スロットの手動入れ替え（ドラッグ＆ドロップ）

含まない:

* `results`（勝敗）の入力。既存の `results` がある部門は編集を拒否する
* `SINGLE_ELIMINATION` 以外の形式
* `Member` / `Participant` 単体の管理画面
* 部門を跨いだエントリーの一括操作

## 決定事項

| 論点 | 決定 |
|---|---|
| 画面構成 | 1 画面にまとめる（`/divisions/[divisionId]/setup`）。既存の `/edit` は name/format 専用のまま |
| 保存の粒度 | 全て即保存。1 操作 = 1 Server Action + `revalidatePath` |
| 組み合わせの作り方 | 自動生成 ＋ 1 回戦スロットの手動入れ替え |
| エントリー追加時 | 一番下の `bye` を埋める。`bye` が無ければブラケットを 1 段拡張する |
| エントリー削除時 | 警告を出したうえで、ブラケットをシード順から再生成する |
| `Member` の扱い | 組織の既存 `Member` から選ぶ。無ければ氏名＋かなを打って新規作成 |
| `results` がある場合 | エントリー・組み合わせを変える操作を全て拒否する |
| 同時編集 | 楽観ロックは入れない。後勝ち |
| D&D の実装 | `@dnd-kit` を追加する |

追加と削除で扱いが非対称なのは意図的である。追加は「席を 1 つ埋める」だけで既存の
対戦カードを壊さずに済むが、削除は穴が空いた状態が残り続けるため、作り直した方が
結果が読みやすい。削除時は再生成した旨を画面に出す。

## 中核となるデータ設計

シングルエリミネーションでは 2 回戦以降のスロットは必ず `winnerOf` になる。
したがってブラケット全体は **1 回戦のスロット割当配列 `SlotSource[]`（長さ 2^k）だけで
完全に決まる**。この配列を唯一の状態とし、`MatchingConfig` はそこから毎回組み立てる。

```
slots = [e1, bye, e4, e5, e2, bye, e3, e6]   ← 唯一の状態
   ↓ buildFromSlots()
MatchingConfig { matches: [...] }             ← 木は毎回組み立て直す
```

3 つの操作が全て配列操作に還元される。

| 操作 | 配列に対して |
|---|---|
| 自動生成 / 削除後の再生成 | 標準シード順で埋め、余りを `bye` にする |
| エントリー追加 | 最後の `bye` を置換。`bye` が無ければ 2 倍展開してから置換 |
| 手動入れ替え | 2 要素を swap |

### 標準シード順

```
seedOrder(size):
  list = [1]
  while list.length < size:
    len = list.length * 2
    list = list.flatMap(x => [x, len + 1 - x])
  return list
```

`size = 8` なら `[1, 8, 4, 5, 2, 7, 3, 6]`。
`size` は `2^ceil(log2(n))`。`positions[p] > n` の位置が `bye` になるため、
`bye` は自動的に上位シードの相手側へ寄る。

### 2 倍展開

`bye` が 1 つも無い状態でエントリーを足すときは、各要素 `c_i` を `[c_i, bye]` へ開く。

```
[a, b, c, d]  →  [a, bye, b, bye, c, bye, d, bye]
```

こうすると既存の対戦カード（`a` vs `b`、`c` vs `d`）は 2 回戦としてそのまま残り、
新規追加者は最後の `bye`（末尾）に入って `d` と 1 回戦を戦う。
9 人目が来たら予選 1 試合が生える、という運営上自然な挙動になる。

### 試合 id

`m{round}-{order}`（`m1-0`, `m2-1` など）の決定的な文字列とし、組み立てのたびに振り直す。
`winnerOf` の参照も構造から再構築されるため、参照が壊れる経路が存在しない。

`toSlots()` は 1 回戦の試合を `order` 昇順に並べて `slots` を連結する。
DB に非正規な `matchingConfig`（2 の冪でない、手で書き換えられた等）が入っていた場合、
`toSlots → buildFromSlots` の往復で正規形に矯正される。これは意図した挙動とする。

## ファイル構成

```
src/features/division/
├── single-elimination/          純粋ドメイン。スライスではない（handler/repository を持たない）
│   ├── build.ts                 seedOrder / buildFromSlots / toSlots
│   ├── build.test.ts
│   ├── edit.ts                  generateSlots / placeEntry / swapSlots
│   └── edit.test.ts
├── add-entry/                   schema.ts handler.ts usecase.ts repository.ts (+ .test.ts)
├── remove-entry/
├── reorder-entry/
├── generate-matching/
├── swap-slots/
├── errors.ts                    タグを 3 つ追加
├── messages.ts                  追加タグの文言
└── state.ts                     notice を追加

src/components/division/
├── DivisionSetup.tsx            画面全体（server component）
├── AddEntryForm.tsx             既存 Member を選ぶ / 新規に氏名＋かなを入力（client）
├── EntryList.tsx                エントリー一覧・削除・並べ替え
└── MatchingEditor.tsx           生成ボタン ＋ 1 回戦カードの D&D（client）

src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx
```

`single-elimination/` はスライスではなく、カテゴリ直下に置く共有ドメインである。
5 つのスライスがここへ祖先方向に依存する形になり、スライス間の依存は発生しない。
`schema-parts.ts` や `errors.ts` と同じ位置づけで、`handler.ts` / `repository.ts` を
持たないことで見分けられる。この扱いは `docs/code-design/architecture.md` にも追記する。

画面下部のブラケットプレビューには既存の `DivisionBracket` をそのまま再利用する。

`listMembersInOrganization` は `features/organization/repository.ts` に追加する
（`Member` は組織スコープのため）。ページは division と organization の 2 つの
リポジトリを読む。ページは `app/` にあるのでこの依存は問題ない。

## Server Action の共通形

5 つの Server Action は全て同じ骨格を持つ。

1. `requireOrganization(slug)` を **Server Action の冒頭で独立に呼ぶ**
   （ページ経由でなく直接叩けるため）
2. Zod で入力を検証する
3. `$transaction` の中で:
   * 3 段の所有権を `where` に入れて `Division` を読む
     （`where: { id: divisionId, tournament: { id: tournamentId, organizationId } }`）
   * 見つからなければ `null` を返し、呼び出し側が `notFound()` へ倒す
   * `parseDivisionEntries` / `parseMatchingConfig` / `parseDivisionResults` でパースする
   * `results.matches.length > 0` なら `DivisionResultsRecordedError` を投げる
   * 純粋関数で `entries` / `matchingConfig` を加工する
   * `validateEntries` / `validateMatchingConfig` を通す。エラーがあれば保存しない
   * `updateMany`（所有条件を `where` に残すため）で書き戻す
4. `revalidatePath` で setup ページと詳細ページを再検証する

同時編集の制御は入れない。`$transaction` 内の read-modify-write なので単一操作の
原子性は保たれるが、2 人が同時に開いていれば後の操作が前の操作を上書きする。

## 各スライスの仕様

### add-entry

入力: `slug`, `tournamentId`, `divisionId`, および次のいずれか

* `memberId`（既存 `Member` を選んだ場合）
* `name` + `nameKana`（新規作成の場合。どちらも trim 後 1〜100 文字）

処理（トランザクション内）:

1. `Member` を解決する。`memberId` があれば `organizationId` 付きで存在確認し、
   無ければ `notFound()` へ倒す。新規なら `Member` を作成する
2. その大会の `Participant` を `(tournamentId, memberId)` で探し、無ければ作成する。
   `Participant.seed` は `null` のままにする
   （`@@unique([tournamentId, seed])` があるため自動採番すると衝突する。
   Postgres は NULL の重複を許すので `null` なら安全。部門内のシード順は
   `DivisionEntry.seed` が持つので `Participant.seed` は不要）
3. 同じ `participantId` が既に `entries` にあればエラーにする（二重エントリー禁止）
4. `entries` に `{ id: uuid, participantId, seed: max(seed) + 1 }` を足す
   （`seed` は 0 始まり。0 件なら 0）
5. `matchingConfig` が空でなければ `placeEntry(slots, entryId)` を適用する
6. エントリー数の上限は 128。超える追加は拒否する

### remove-entry

入力: `slug`, `tournamentId`, `divisionId`, `entryId`

`entries` から該当要素を除き、`seed` を 0 から振り直す。
`matchingConfig` が空でなければ、残ったエントリーのシード順から**丸ごと再生成する**。
手動で入れ替えた配置はここで失われるため、削除ボタンの近くにその旨を常時表示し、
実行後は `notice` に「組み合わせを再生成しました」を返して画面に出す。

削除後のエントリーが 2 人未満になった場合は `matchingConfig` を空にする。

`Participant` と `Member` は削除しない。他の部門で使われうるため。

### reorder-entry

入力: `slug`, `tournamentId`, `divisionId`, `entryId`, `direction`（`up` / `down`）

`entries` を `seed` 昇順に並べ、隣と入れ替えて `seed` を 0 から振り直す。
端で押された場合は何もせず正常終了する（既存の division reorder と同じ扱い）。

`matchingConfig` は変更しない。スロットは `entryId` を直接持つため、`seed` の変更で
壊れることはない。並べ替えを組み合わせへ反映したい場合は「生成」を押す、という関係にする。

### generate-matching

入力: `slug`, `tournamentId`, `divisionId`

`entries` を `seed` 昇順に並べ、`generateSlots` → `buildFromSlots` で
`matchingConfig` を作り直す。既存の組み合わせは手動入れ替えも含めて上書きされる。

エントリーが 2 人未満なら `DivisionNotEnoughEntriesError` で拒否する。

### swap-slots

入力: `slug`, `tournamentId`, `divisionId`, `slotIndexA`, `slotIndexB`

`toSlots` した配列の 2 要素を入れ替えて `buildFromSlots` で組み立て直す。
添字が範囲外なら入力エラーにする。同じ添字なら何もせず正常終了する。

`bye` のスロットも入れ替え対象になるので、「空きへ移す」も同じ操作で表現できる。

## エラー

`errors.ts` に 3 つのタグを追加する。`messages.ts` は `Match.exhaustive` を使っているため、
タグを足して文言を書き忘れるとコンパイルエラーになる。

| タグ | 文言 |
|---|---|
| `DivisionResultsRecordedError` | 勝敗が記録されているため、エントリーと組み合わせは変更できません |
| `DivisionNotEnoughEntriesError` | 組み合わせを作るにはエントリーが 2 人以上必要です |
| `DivisionDataError` | 部門のデータが壊れています。管理者に連絡してください |
| `DivisionEntryLimitError` | エントリーは128人までです |
| `DivisionDuplicateEntryError` | その参加者はすでにエントリーしています |
| `DivisionMemberNotFoundError` | 選択したメンバーが見つかりません |

`toDivisionError` は `DivisionJsonError` を受け取ったら `DivisionDataError` へ写像する。
現状は Prisma の `P2002` しか見ていないため、そこに分岐を足す。

`validateEntries` / `validateMatchingConfig` が返す `ValidationErrors` は、
保存直前の防御線として使う。ここが空でなければ `DivisionDataError` にする
（純粋関数が正しければ到達しない。到達したらバグである）。

## 画面へ通知を返す

`DivisionFormState` は今 `error` しか持たない。削除時の「再生成しました」を出すため
`notice?: string` を足す。省略可能にすることで、既存 4 スライスのハンドラとテストは
無修正のまま通る。`INITIAL_DIVISION_FORM_STATE` と `divisionErrorFormState` も変更しない。

## UI

`/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup`

`SINGLE_ELIMINATION` 以外の部門でこの URL を開いた場合は、既存の `DivisionBracket` と
同じ調子で「この形式はまだ対応していません」の案内を出す（404 にはしない）。

`results` が既にある部門では、全てのフォームを無効化して理由を表示する。

画面は上から順に:

1. **エントリー**（`EntryList` + `AddEntryForm`）
   一覧は `seed` 昇順。各行に氏名・かな・↑↓ の並べ替えボタン・削除ボタン。
   並べ替えは既存の `DivisionReorderButtons` と同じ形にして、操作の一貫性を保つ。
   削除ボタンの近くに「削除すると組み合わせは再生成されます」を表示する。
   追加フォームは「既存の Member から選ぶ」select と「新しく登録する」入力欄を
   ラジオで切り替える。
2. **組み合わせ**（`MatchingEditor`）
   「組み合わせを生成」ボタンと、1 回戦の対戦カード一覧。
   カード内の各スロットが `@dnd-kit` のドラッグ可能要素で、別のスロットへ
   ドロップすると入れ替わる。`bye` スロットもドロップ先になる。
   `MatchingEditor` は `onSwap(indexA, indexB)` を props で受け取る形にし、
   D&D の配線とサーバ呼び出しを分離する。
3. **プレビュー**（既存 `DivisionBracket`）
   保存済みの `matchingConfig` から描いた全体のブラケット。

部門詳細ページに「エントリー・組み合わせを編集」リンクを足す。

## テスト

* `single-elimination/build.test.ts`
  `seedOrder` の展開、`buildFromSlots` の round 構造と `winnerOf` 参照、
  `toSlots` との往復、非正規な入力の正規化
* `single-elimination/edit.test.ts`
  `generateSlots` を n = 2, 3, 5, 8, 9 で。`placeEntry` の `bye` あり / 無し（2 倍展開）、
  `swapSlots`
* 各スライスの `usecase.test.ts` — 差し替えたポートで
* 各スライスの `repository.test.ts` — `$transaction` をモックし、`where` に
  `organizationId` が入っていることを確認する
* 各スライスの `handler.test.ts` — 既存スライスと同じ形
* コンポーネントのテスト — `AddEntryForm` のラジオ切り替え、`EntryList` の
  端での並べ替えボタンの無効化、`MatchingEditor` が `onSwap` を正しい添字で呼ぶこと
* ページのテスト — 形式が違う場合の案内、`results` がある場合の無効化

`@dnd-kit` の実際のドラッグ操作は jsdom では再現しにくいため、D&D の配線そのものは
テストしない。入れ替えのロジックは純粋関数として `edit.ts` に、サーバ呼び出しは
`onSwap` の向こう側にあり、どちらも D&D を通さずテストできる。

## 依存の追加

`@dnd-kit/core` を `pnpm add` する。

`@dnd-kit/sortable` は入れない。ここで要るのは「並べ替え」ではなく
「2 つのスロットの交換」で、`sortable` の並べ替えモデルとは挙動が違うため。

## 積み残し

* 同時編集は後勝ちになる。運用で問題が出たら `revision` 相当の列を足して楽観ロックする
* `results` の入力画面。これができたら「勝敗があれば拒否」は
  「組み合わせを直したら勝敗もやり直し」に緩めてよい
* `Member` / `Participant` の管理画面。今回は追加のみで、編集・削除の手段が無い
