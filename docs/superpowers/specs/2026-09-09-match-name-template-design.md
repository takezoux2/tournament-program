# 試合名のテンプレート化 設計

作成日: 2026-09-09

## 目的

各試合の表示名を、運営者が自由な文字列で決められるようにする。文字列の中に
`{{OverallSeq}}` / `{{DivisionSeq}}` の 2 つの変数を書け、表示のときに数字へ展開する。
トーナメント（`SINGLE_ELIMINATION`）とリーグ（`ROUND_ROBIN`）で仕様は同じ。

現在は `BracketMatch.matchNumber` という「部門内で一意な文字列の試合番号」があり、
生成と並べ替えのたびに `"1", "2", ...` で振り直される。運営者が手で「決勝」と付けても、
組み合わせを作り直したり並べ替えたりすると消える。番号ではなく名前として扱い、
連番の部分を変数に逃がすことで、この振り直しを不要にする。

## スコープ

含む:

* `BracketMatch.matchNumber` を `matchName` へ改める（自由文字列のテンプレート）
* `{{OverallSeq}}` / `{{DivisionSeq}}` の展開。テンプレート処理は `mustache` に委ねる
* 大会全体の通し番号（`OverallSeq`）の算出と、その算出を 1 箇所に集めること
* 部門内での試合名の一意制約の撤廃
* 試合名を表示する全画面（管理・公開）での展開
* 並べ替え時の試合名の振り直しの廃止

含まない:

* 大会単位・部門単位の一括書式設定。試合ごとの個別入力のみ
* `matchPositionLabel`（「1 回戦 第 1 試合」）。ブラケット上の構造位置を表す別物
* 既存データの移行。旧 `matchNumber` は読み継がない（後述）
* ダブルエリミネーション 2 形式の編集画面（既存どおり未対応）

## 決定事項

| 論点 | 決定 |
|---|---|
| 設定単位 | 試合ごとに個別入力 |
| フィールド | `BracketMatch.matchNumber` → `matchName: string`。UI 文言も「試合名」 |
| 既定値 | `"第{{DivisionSeq}}試合"` |
| 重複チェック | 廃止。空文字のみ拒否 |
| テンプレート処理 | `mustache` を採用し、その既定挙動に従う |
| `{{DivisionSeq}}` | 部門内の実施順。`sequence + 1`（1 始まり） |
| `{{OverallSeq}}` | 大会の進行順のうち試合行だけを 1 から数えた通し番号。区切り行は数えない |
| 解決範囲 | 試合名を出す全画面が大会全体（全部門 + `ScheduleItem`）を読んで解決する |
| 並べ替え | 試合名を書き換えない |
| 旧データ | 移行しない。旧 `matchNumber` は無視し、読み出しで既定テンプレートを入れる |

### `mustache` に委ねる理由と、それによって決まる挙動

テンプレートの構文解析を自前で書くと、空白の許容・未知の変数・エスケープの
それぞれで判断が要り、仕様が increments で歪む。既製の実装に合わせれば
「mustache と同じ」の一文で説明が閉じる。既定挙動から自動的に決まること:

* `{{ OverallSeq }}` のように内側に空白があっても展開する
* 未知の変数（`{{Foo}}`、`{{overallseq}}`）は**空文字**に展開する。エラーにしない
* 変数名は大文字小文字を区別する
* `{{...}}` は値を HTML エスケープするが、渡す値は整数のみなので影響しない。
  変数の外側のリテラル（「第」「試合」など）はエスケープされない

### 既定値を `"第{{DivisionSeq}}試合"` にする理由

生成直後の表示が「第1試合」「第2試合」となり、それ単体で名前として読める。
テンプレートなので並べ替えに自動追従し、`reorder-matches` が試合名を振り直す
必要がなくなる。手で「決勝」と付けた試合は並べ替えても「決勝」のまま残る
（[試合の実施順の並べ替え 設計](2026-09-08-match-order-design.md)が「手で振った試合番号が
失われる」として挙げていた不都合が、この既定値で解消する）。

### 一意制約を撤廃する理由

試合名は表示のためだけの文字列で、`results` も `ScheduleItem` も `BracketMatch.id` で
試合を指す。一意性に依存している参照は無い。加えて既定値がテンプレートなので、
部門内の全試合が同じ文字列 `"第{{DivisionSeq}}試合"` を持つのが正常な状態になり、
「部門内で重複しない」という規則自体が成り立たなくなる。

### 旧 `matchNumber` を読み継がない理由

読み継ぐと、リテラルの `"1"`, `"2"` を持つ既存部門だけが並べ替えに追従しなくなり、
新しく作った部門との間で挙動が分かれる。既定テンプレートに寄せれば全部門が
同じ規則で動く。表示は `"1"` から `"第1試合"` に変わるが、手で付けた名前が
消えるのは組み合わせの作り直しと同じ場面に限られる。

## 中核となるデータ設計

### `BracketMatch`（`src/lib/division/types.ts`）

```ts
export type BracketMatch = {
  /** 部門内で一意 */
  id: string;
  bracket: BracketSide;
  /** 1 = 1 回戦。ROUND_ROBIN は常に 1 */
  round: number;
  /** ラウンド内の上からの位置。0 始まり */
  order: number;
  /** 部門内での実施順。0 始まりの連番。並べ替えで変わる */
  sequence: number;
  /**
   * 表示用の試合名のテンプレート。{{OverallSeq}} / {{DivisionSeq}} を使える。
   * 部門内で重複してよい（既定値は全試合で同じ文字列になる）
   */
  matchName: string;
  slots: [SlotSource, SlotSource];
};
```

### 通し番号の算出（`src/lib/division/overall-order.ts`・新設）

`OverallSeq` の並び順は、`buildScheduleView`（`features/schedule/domain.ts`）が既に
持っているマージ規則そのもの ——「保存済みの `ScheduleItem` 順に並べ、実体の無い行と
重複行は落とし、行を持たない試合を部門 `order` → 部門内 `sequence` の順で末尾に足す」。

同じ規則を 2 箇所に書くとずれるため、順序決定だけを純粋関数として下位共通層へ降ろす。

```ts
/** キーは `${divisionId}:${matchId}`。値は 1 始まりの通し番号 */
export const buildOverallSeq = (
  divisions: { id: string; order: number; matchIds: string[] }[],
  savedItems: { divisionId: string; matchId: string }[],
): Map<string, number>;
```

`lib/` に置くのは、`features/division` と `features/schedule` の両方から要るため。
`features` は同列どうし依存できない（`lib/division/label.ts` と同じ理由）。
`savedItems` は `ScheduleItem` の `MATCH` 行だけを `order` 昇順で渡す。区切り行は
呼び出し側で落とすので、この関数は区切りを知らない。

`features/schedule/domain.ts` の `buildMatchRows` / `buildScheduleView` も、行の並びを
この関数の結果から作るように変える。アルゴリズムは 1 本だけになる。

### 名前の展開（`src/lib/division/match-name.ts`・新設）

```ts
export const DEFAULT_MATCH_NAME = "第{{DivisionSeq}}試合";

/** mustache で展開する。壊れたテンプレートは例外を握って template をそのまま返す */
export const renderMatchName = (
  template: string,
  vars: { OverallSeq: number; DivisionSeq: number },
): string;

/** 部門の全試合を解決して matchId → 表示名の Map にする */
export const resolveMatchNames = (
  config: MatchingConfig,
  divisionId: string,
  overallSeq: Map<string, number>,
): Map<string, string>;
```

`renderMatchName` が例外を握るのは、保存時の構文検査をすり抜けた文字列（別経路で
書かれた JSON など）で一覧全体が落ちるのを防ぐため。読み出しは常に何かを返す。

`overallSeq` に該当のキーが無い試合（部門が大会に無い、など通常起きない場合）は
`OverallSeq` に `0` を渡す。

### 読み出し（`src/lib/division/parse.ts`）

* `matchName` が文字列として入っていればそのまま使う
* 無ければ `DEFAULT_MATCH_NAME` を入れる。旧 `matchNumber` の値は見ない
* `sequence` の補完（既存）は変えない

### 検証（`src/lib/division/validate.ts`）

* `matchName` が重複していないこと ——**削除する**
* `matchName` が空でないこと —— 残す
* `sequence` が `0..n-1` の連番であること —— 変えない

### スロットの文言（`src/lib/division/label.ts`）

`createSlotLabeler` が `第${matchNumber}試合の勝者` と組み立てている。既定値が
`"第{{DivisionSeq}}試合"` になると「第第1試合試合の勝者」になるため、外側の
「第」「試合」を外して `${試合名}の勝者` / `${試合名}の敗者` にする。既定値なら
表示は従来どおり「第1試合の勝者」になる。

第 1 引数を `MatchingConfig` から解決済みの `Map<matchId, string>` に変える
（この関数は展開に必要な `OverallSeq` を持たないため、呼び出し側が解決して渡す）。

### 並べ替え（`src/features/division/reorder-matches/domain.ts`）

`sequence` の振り直しだけを行い、`matchName` は写すだけにする。
「並べ替えが変えるものは `sequence` と `matchNumber`」という従来の規則から
`matchName` を外す。

### 生成（`single-elimination/build.ts`・`round-robin/build.ts`）

連番の代入をやめ、全試合に `DEFAULT_MATCH_NAME` を入れる。

## リポジトリ

`features/division/repository.ts` に材料を読む関数を 1 つ足す。

```ts
export const listOverallOrderSources = (tournamentId: string): Promise<{
  divisions: { id: string; order: number; matchingConfig: unknown }[];
  /** ScheduleItem の MATCH 行のみ。order 昇順 */
  items: { divisionId: string; matchId: string }[];
}>;
```

所有権は呼び出し側のページが既に確立している（管理側は `requireOrganization` と
部門の 3 段 `where`、公開側は `findPublicTournament`）ため、この関数は
`tournamentId` だけを受ける。

`features/schedule` の `loadScheduleView` は既に全部門と全行を読んでいるので、
追加のクエリは要らない。`buildOverallSeq` を内部で使うだけ。

## スライスの改名

`features/division/set-match-number/` → `features/division/set-match-name/`
（`schema.ts` / `repository.ts` / `usecase.ts` / `handler.ts` とそれぞれのテスト）。

* フォームの項目名 `matchNumber` → `matchName`
* `features/division/match-number-view.ts` → `match-name-view.ts`、
  `MatchNumberRowView` → `MatchNameRowView`、`matchNumber` → `matchName`
* `features/division/errors.ts` の `DivisionMatchNumberConflictError` を削除。
  `messages.ts` の対応する文言も削除

## 画面

試合名を出す画面はすべて、大会全体を読んで展開済みの文字列を渡す。

| 画面 | 部品 |
|---|---|
| 部門セットアップ（トーナメント） | `MatchNumberList` → `MatchNameList`、`MatchNumberRow` → `MatchNameRow` |
| リーグ | `LeagueMatchList`、`LeagueCrossTable` |
| ブラケット描画（管理・公開） | `from-division.ts` → `resolve-bracket.ts` → `MatchCard` |
| 大会の進行順 | `ScheduleList` / `ScheduleMatchRow` |
| 結果入力 | `MatchResultList` / `MatchResultRow` |
| 公開の進行順 | `PublicScheduleList` |

`features/bracket/types.ts` の `Match` / `ResolvedMatch` の `matchNumber` も
`matchName` に改め、`from-division.ts` には展開済みの名前を渡す。

### 編集行（`MatchNameRow`）

1 行に次を並べる。

* テンプレート文字列の入力欄（`matchName`）と保存ボタン
* 展開後のプレビュー（その試合の実際の表示名）
* 構造上の位置（`matchPositionLabel`）と対戦カード（`matchCardLabel`）—— 既存どおり

リーグの `matchPositionLabel` は `第{sequence + 1}試合` で、既定の試合名と同じ
文字列になる。編集行では「位置」と「プレビュー」が同じ表示になるが、試合名を
書き換えれば分かれるため、位置の表示はそのまま残す（構造上の位置と表示名は
別物という区別を崩さない）。

一覧の説明文に、使える変数と意味を書く。

* `{{OverallSeq}}` —— 大会全体で何番目の試合か
* `{{DivisionSeq}}` —— この部門で何番目の試合か

既存の説明文にある「作り直すと試合番号と実施順は既定に戻る」は
「作り直すと試合名と実施順は既定に戻る」に改める（並べ替えでは戻らなくなったため、
並べ替えを原因として挙げている記述があれば外す）。

## エラーと表示

| 状況 | 扱い |
|---|---|
| trim 後に空文字 | 「試合名を入力してください」 |
| `Mustache.parse` が失敗（`{{#a}}` の閉じ忘れなど） | 「試合名の書き方が正しくありません」。保存しない |
| 100 文字超 | 「試合名は100文字以内で入力してください」。展開後ではなくテンプレート文字列の長さで測る |
| 未知の変数 `{{Foo}}` | mustache の既定どおり空文字に展開。エラーにしない |
| 描画時に `Mustache.render` が例外 | テンプレート文字列をそのまま表示する。画面は落とさない |
| 試合名の重複 | 検査しない |
| 対象の部門・試合が無い | `notFound()`（既存スライスと同じ） |
| 保存直前の検証に失敗 | `DivisionDataError`。既存の文言変換に乗せる |

## 依存の追加

`mustache` と `@types/mustache` を `pnpm add` で入れる。

## テスト

* `lib/division/match-name.test.ts`: 既定値の展開、両変数、未知の変数が空文字、
  `{{ OverallSeq }}` の空白の許容、大文字小文字の区別、壊れたテンプレートで
  例外を投げずテンプレートをそのまま返すこと
* `lib/division/overall-order.test.ts`: 保存済みの順を尊重すること、区切りを
  数えないこと、行を持たない試合が部門 `order` → `sequence` で末尾に付くこと、
  未知の id と重複行を落とすこと、1 始まりであること
* `lib/division/parse.test.ts`: `matchName` の欠落時に既定テンプレートが入ること、
  旧 `matchNumber` の値を拾わないこと
* `lib/division/validate.test.ts`: 重複がエラーにならないこと、空文字が
  エラーになること
* `lib/division/label.test.ts`: 「◯◯の勝者」「◯◯の敗者」の形になること
* `features/schedule/domain.test.ts`: `buildOverallSeq` 経由でも行の並びが
  従来と一致すること
* `features/division/reorder-matches/domain.test.ts`: `matchName` を書き換えないこと
* `single-elimination/build.test.ts` / `round-robin/build.test.ts`:
  全試合に既定テンプレートが入ること
* `set-match-name/`: `schema` / `repository` / `handler`（正常系、空文字、
  構文エラー、文字数超過、所有権、`revalidate` の呼び出し）
* コンポーネント: 各一覧の試合名の表示とプレビュー、`MatchCard` の試合名

既存テストで `BracketMatch` を組み立てている箇所は `matchNumber` → `matchName` の
改名で型エラーになる。機械的な置換だが件数が多い（`matchNumber` を含むファイルは
約 67）ので、実装の作業量に見込んでおく。
