# リーグ戦の結果表（星取表＋順位表） 設計

作成日: 2026-09-13

## 目的

`DivisionFormat.ROUND_ROBIN` の部門について、勝敗込みの星取表と順位表を
部門詳細ページ（管理画面）と公開ページの両方に出す。

現状、両ページは `DivisionBracket` を呼び、リーグの部門では
「「リーグ（総当たり）」のブラケット表示はまだ対応していません」を出すだけ。
編集画面（`/league`）には試合番号だけの星取表 `LeagueCrossTable` があるが、
勝敗は反映されない。勝敗は結果入力画面（`/results`）からリーグの試合にも
記録でき、引き分け（`winnerEntryId: null`）も保存できる。

## スコープ

含む:

* 勝敗込み星取表（各マスに ○ / ● / △ と試合番号）
* 順位表（勝・分・敗・勝点・順位）。星取表と 1 つの table にまとめる
* 部門詳細ページ（`/orgs/.../divisions/[divisionId]`）と
  公開ページ（`/t/[tournamentId]/divisions/[divisionId]`）での表示
* 形式で描画を振り分ける小さなディスパッチャ

含まない:

* 編集画面（`/league`）の `LeagueCrossTable` は試合番号のみのまま
* 順位規則の設定 UI。規則はコードに固定する
* スコア（`MatchResultRecord.score`）の表示。書く画面が無い
* ダブルエリミネーション 2 形式

## 決定事項

| 論点 | 決定 |
|---|---|
| 勝点 | 勝 3・分 1・負 0 |
| 順位の決め方 | 勝点 → 勝ち数 → 同点者どうしの直接対決の勝点 → 同順位 |
| 同順位の番号 | 飛ばす（1, 1, 3） |
| 未実施の試合 | 集計に含めない。マスには試合番号だけ淡色で出す |
| 壊れた記録 | 勝者 id がどちらのスロットにも居ない記録は未実施として読む |
| 行・列の並び | どちらも順位順。表は左右対称のまま |
| 既存の編集画面 | 触らない。閲覧用と編集用で役割を分ける |

### 直接対決の適用範囲

勝点と勝ち数が同じ集団（2 人以上）について、その集団内の試合だけで勝点を
数え直し、多い順に並べる。それでも並ぶ場合は同順位とし、それ以上の規則
（得失点差など）は持たない。集団が 3 人以上で巴戦になっていれば全員同順位になる。

## ファイル構成

```
src/features/division/round-robin/
├── standings.ts                  toLeagueTableView（純粋ドメイン、新設）
└── standings.test.ts

src/components/division/
├── LeagueResultTable.tsx         星取表＋順位表（server component、新設）
├── LeagueResultTable.test.tsx
├── DivisionMatchingView.tsx      形式で振り分ける（server component、新設）
├── DivisionMatchingView.test.tsx
└── DivisionBracket.tsx           変更なし（SINGLE_ELIMINATION 専用のまま）

src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx
src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx
```

## 純粋ドメイン: `standings.ts`

```ts
export type LeagueOutcome = "win" | "loss" | "draw";

export type LeagueTableCell =
  | { kind: "self" }
  | { kind: "match"; matchNumber: string; outcome: LeagueOutcome | null }
  | { kind: "none" };

export type LeagueTableRow = {
  entryId: string;
  label: string;
  rank: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  cells: LeagueTableCell[];
};

export type LeagueTableView = {
  headers: { entryId: string; label: string }[];
  rows: LeagueTableRow[];
};

export const toLeagueTableView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  results: DivisionResults,
  participants: { id: string; name: string }[],
): LeagueTableView;
```

* `headers` と各 `rows[].cells` は同じ並び・同じ長さ（`toCrossTableView` と同じ契約）
* 並びは順位順。同順位の中はシード昇順
* 勝敗の読み方: `results.matches` を `matchId` で引く。記録が無ければ `outcome: null`。
  `winnerEntryId` が `null` なら両者 `draw`。勝者が試合のどちらかのスロットに
  立っていれば勝者 `win`・相手 `loss`。どちらにも居なければ `null`（未実施扱い）
* `entry` 以外のスロットを持つ試合は無視する。形の検査は呼び出し側
  （`isRoundRobinShape`）が担い、この関数は落ちないことだけ守る
* 名前を引けないエントリーは「（不明な参加者）」（`lib/division/label.ts` と同じ文言）

## コンポーネント

### `LeagueResultTable`

`LeagueTableView` を受け取って table を描く。列は左から
順位 / 名前 / 各対戦マス（順位順） / 勝 / 分 / 敗 / 勝点。

* マス: ○ ● △ を本文サイズで、その下に「第N試合」を小さく添える。
  未実施は「第N試合」だけを淡色で出す。自分は「—」
* ○ ● △ には `aria-label`（勝ち / 負け / 引き分け）を付ける
* 人数が増えると横に広がるため `overflow-x: auto` の箱に入れる
* `headers` が空なら「まだエントリーがありません」

### `DivisionMatchingView`

両ページが呼ぶ入口。props は `DivisionBracket` と同じ
（`division`, `participants`, `heightClassName?`）。

| format | 描画 |
|---|---|
| `SINGLE_ELIMINATION` | `DivisionBracket` にそのまま渡す |
| `ROUND_ROBIN` | Json をパース → 空なら「組み合わせが未作成です」→ `isRoundRobinShape` でなければ「この対戦表はリーグの形ではありません」→ `LeagueResultTable` |
| その他 | 現行の「「{形式名}」のブラケット表示はまだ対応していません」 |

Json のパース失敗は `DivisionBracket` と同じく区画で受け止め、
「部門のデータを読み込めませんでした」を出してページは落とさない。

`DivisionBracket` は変更しない。SINGLE_ELIMINATION 以外の判定はそこに残るが
ディスパッチャ経由では到達しない。

## ページ

* 部門詳細と公開ページの `DivisionBracket` 呼び出しを `DivisionMatchingView` に置き換える
* 参加者一覧を引く条件を「SINGLE_ELIMINATION のとき」から
  「SINGLE_ELIMINATION または ROUND_ROBIN のとき」に広げる
* 公開ページの `heightClassName` はそのまま渡す（ブラケットのときだけ使われる）。
  リーグの表は内容の高さに従う
* 見出し文言（「組み合わせ」）は変えない

## テスト

* `standings.test.ts` — 4 人で全試合済み / 一部未実施 / 引き分け /
  同勝点で直接対決が効く / 巴戦で同順位（1, 1, 1, 4）/ 壊れた記録を無視 /
  名前を引けないエントリー / エントリー 0 件
* `LeagueResultTable.test.tsx` — 列見出し、○●△ の aria-label、
  未実施マスの表示、空のとき
* `DivisionMatchingView.test.tsx` — 3 形式の振り分け、未作成、形違い、パース失敗
* 部門詳細ページと公開ページの `page.test.tsx` — ROUND_ROBIN でも参加者一覧を引くこと

## 実装の進め方

`AGENTS.md` の指示に従い、worktree を切ってサブエージェントで実装する。
