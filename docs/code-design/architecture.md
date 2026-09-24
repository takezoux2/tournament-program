アーキテクチャーは、垂直スライスアーキテクチャー（Vertical Slice Architecture）を採用する。機能ごとにコードを分割し、各機能が独立して開発・テストできるようにする。

ディレクトリやファイルは以下のように分割する。
```
src/
├── app/                          # Next.jsのAppディレクトリ
├── components/                   # UIコンポーネント
├── features/                     # 垂直スライス（機能単位）
│   └── user/                     # 機能カテゴリー
│       ├── registration/         # アクション
│       │   ├── schema.ts         # 入力バリデーション（Zod）
│       │   ├── handler.ts        # サーバーアクションからの呼び出し
│       │   ├── usecase.ts        # アプリケーションロジック
│       │   ├── domain.ts         # 純粋なビジネスルール（純粋関数）
│       │   ├── repository.ts     # DB操作のインターフェース & 実装
│       │   ├── usecase.test.ts   # テストコード
│       │   └── domain.test.ts    # テストコード
│       ├── domain.ts             # 機能全体のドメインモデル
│       ├── repository.ts         # 機能全体のリポジトリ
│       └── domain.test.ts        # テストコード
├── shared/                       # 横断的な基盤
│   ├── authz/                    # 権限コードと CASL の Ability
│   ├── db/                       # DB接続・マイグレーション
│   ├── errors/                   # 共通エラー型
│   └── middleware/               # 認証、ロギング等 
│   └── lib/                      # 共通ライブラリ
└── index.ts

```

* ValidatorにはZodを利用する
* effect-tsを利用して、純粋関数型のアプローチで副作用を管理する
* 他の機能への依存が発生しないようにlintで制約をかける
* features以下のディレクトリでは、上位のディレクトリのみ依存関係を許可する。同列、下位のディレクトリへの依存は許可しない。

## 例外: features/auth

`features/auth` の各スライスには `handler.ts` と `repository.ts` を置いていない。

* ルーティングは Next.js の `app/` が所有する（`app/api/auth/[...all]/route.ts` が唯一のエントリポイント）
* 認証テーブルへの DB 操作は Better Auth のアダプタが所有する

このため、スライス側に置くと委譲するだけの空ファイルになる。
`features/auth` には `schema.ts` / `domain.ts` / `usecase.ts` のみを置き、画面のコンポーネントは
`src/components/auth/` に置く（`src/features/` 配下に `.tsx` は置かない）。

## features/bracket と features/tournament の違い

`features/bracket` はブラケット（トーナメント表）の描画に閉じた純粋ロジックを持つ。
参加者・組み合わせ・勝敗の 3 データを突き合わせて座標付きの描画要素にするところまでで、
永続化には関わらない。

`features/tournament` は `Tournament` エンティティの CRUD を持つ。
DB への読み書きが責務であり、描画には関わらない。

粒度も更新頻度も違うため、同じカテゴリに置かない。

大会の公開/非公開は `Tournament.status` で表す（公開 = DRAFT→IN_PROGRESS、
非公開 = 非DRAFT→DRAFT）。遷移前の status を `updateMany` の where に入れて
おくことで、二重送信や古い画面からの操作を弾く。更新 0 件になったとき、
組織に大会自体が無ければ 404、あれば「すでに〜」のエラーを返す。

`features/bracket/from-division.ts` は `lib/division` の永続化型を描画型へ変換する
アダプタ。`features/division` 側に置くと同列スライスへの依存になるため、
`features/bracket` から下位共通層の `lib/division` を参照する向きにしてある。
対応するのは `SINGLE_ELIMINATION` のみで、それ以外は `null` を返す。

## features/division の共有ドメイン

`features/division/single-elimination/` と `features/division/round-robin/` は
スライスではなく、カテゴリ直下に置く共有ドメインである。`handler.ts` と
`repository.ts` を持たないことでスライスと見分けられる。

形式ごとの違いは `matching-strategy.ts` が引き受ける。エントリーを足した／
消した／並べ替えたときに `matchingConfig` をどう作り直すかと、形式ごとの
エントリー上限をここが決め、スライス側は「エントリー配列をどう変えるか」
だけを書く。`switch` は `EditableFormat`（編集画面を持つ形式）に対して
網羅的に書くので、対応形式を足すと分岐の書き忘れがコンパイルエラーになる。

シングルエリミネーションのブラケットは「1 回戦のスロット割当配列（長さ 2 の冪）」
だけで完全に決まる。2 回戦以降のスロットは必ず `winnerOf` だからである。
この配列を唯一の状態とし、木は `buildFromSlots` で毎回組み立て直す。
試合 id を `m{round}-{order}` の決定的な形にしてあるため、組み立て直しても
`winnerOf` の参照が壊れる経路が存在しない。

`buildFromSlots` は渡された配列の長さが 2 の冪でなくても、次の 2 の冪まで
`{ kind: "bye" }` で埋めてから組み立てる。ただし、いまこの埋め立てを実際に
発火させる経路は無い。`buildFromSlots` の生きた呼び出し元は `matching-strategy.ts` の
`regenerateMatching` だけで、その入力は `generateSlots`（`single-elimination/edit.ts`）の
出力であり、これは空か 2 の冪のどちらかしか返さない。もう 1 つの呼び出し元
`applyEntryAdded` の `SINGLE_ELIMINATION` 分岐も `buildFromSlots` を呼ぶが、この分岐自体が
`add-entry/repository.ts` の早期 return（`current.format === "SINGLE_ELIMINATION"` なら
`applyEntryAdded` を呼ばず素通りする）によって本番からは到達しない。つまりこの埋め立ては、
呼び出し元の無い防御的な正規化として残っているだけである。

リーグ（総当たり）は円卓法で節に割る。試合 id は `r{節}-{節内の位置}` で、
やはり決定的である。エントリーが 1 人増えれば全員の試合が増えるため、
トーナメントの「一番下の bye を埋める」に相当する部分更新が存在しない。
追加・削除・並べ替えのいずれでも対戦表を丸ごと作り直す。奇数人の休みは
試合として保存しない（保存すると `features/schedule` が実在しない試合の行を
出してしまう）。誰が休みかは `round-robin/view.ts` が節ごとの差分から算出する。

リーグの勝敗込み星取表は `features/division/round-robin/standings.ts`
（`toLeagueTableView`）が組み立てる。勝敗の集計と順位付けそのものは
`src/lib/division/standings.ts` に下ろしてある（下ろした理由は後述）。
勝点は勝 3・分 1・負 0 で、勝点 → 勝ち数 → 同点者どうしの直接対決 → 同順位の順に
決める。閲覧ページ（管理画面の部門詳細と公開の部門ページ）は形式で描画を振り分ける
`components/division/DivisionMatchingView.tsx` を通してこれを使う。編集画面の
`LeagueCrossTable` は試合名だけを出す別物で、閲覧用と役割を分けている。

`setup-store.ts` は全スライス共通の read-modify-write を持つ。所有権つきの読み出し、
Json のパース、勝敗が記録済みかの確認、保存前の検証、`updateMany` での書き戻しを
1 つのトランザクションにまとめる。形式の判定もここに置き、編集画面を持たない形式は
「その部門は無い」として `{ found: false }` に倒す。Server Action はページを
経由せず直接叩ける別の入口なので、画面の分岐だけでは守れない。

## features/schedule

大会の「進行順」（試合一覧の並びと区切り行）を持つ。試合の実体は
`Division.matchingConfig`（Json）の中にあり、`ScheduleItem` は
`(divisionId, matchId)` の文字列で指すだけなので、行と実体は必ずずれうる
（組み合わせの再生成、部門の削除、新しい部門の組み合わせ）。

このずれは読み出しの純粋関数 `buildScheduleView` が吸収する。保存された行を
`order` 昇順に並べ、実体の無い行と二重の行を落とし、行を持たない試合を
「部門の order 昇順 → 部門内の `matches` 配列の順（`parseMatchingConfig` が
bracket → round → order に揃えた順）」で末尾へ足す。この並びの規則は
`src/lib/division/overall-order.ts` の `buildOverallSeq` 1 つにまとめてあり、
`buildScheduleView` もそこから並びを得る。読み出しは副作用を持たず、DB の掃除は
次の保存（全行の書き直し）でまとめて片付く。

`schedule-store.ts` は 4 スライス（`reorder` / `insert-divider` /
`update-divider` / `remove-divider`）共通の read-modify-write を持つ。
`setup-store.ts` と同じ役割で、所有権つきの読み出し、マージ、変形、
`deleteMany` + `createMany` による `order` の 0..n-1 振り直しを 1 つの
トランザクションにまとめる。全行を作り直すため `@@unique([tournamentId, order])`
に対する退避操作（`features/division/reorder` の `PARKING_ORDER`）は要らない。

`features/schedule` は同列の `features/division` に依存できないため、
試合の表示文言（「山田 vs 第 3 試合の勝者」）は `src/lib/division/label.ts` に
下ろして共有する。`features/bracket` が `lib/division` を参照するのと同じ向きである。

並べ替えは楽観ロックの列を持たない。送られたキーの集合が現在のマージ結果と
一致するかどうかの確認（`reorderRows`）がその役目を果たす。
この確認が守るのは並べ替えの経路だけで、区切りの挿入・更新・削除の 3 経路は
同時編集を検出しない。2 つの編集が入れ違いになると、後から保存した側が先の変更を
エラーも出さずに取りこぼす。大会の運営者は 1 人という前提のもとで、これを許容する。

`<input type="datetime-local">` の表示（`toDateTimeLocalValue`）とパース
（`optionalDateTimeLocalSchema`）は `src/lib/datetime/local.ts` に置き、
`features/tournament` の開始日時と `features/schedule` の区切りの開始予定時刻で共有する。
これも同列のカテゴリ同士では依存できないための下ろし方で、`lib/division` と同じ向きである。
表示側は必ずサーバで文字列にしてから画面へ運ぶ。クライアントで組み立てると
ブラウザの時刻帯で書き、サーバの時刻帯で `new Date` することになり、時差ぶんずれる。

## 試合名と通し番号

試合番号は大会の進行順の通し番号 `{{OverallSeq}}` だけである。部門の中の実施順は
持たない（`BracketMatch` に `sequence` は無く、部門内で試合を並べ替える操作も無い）。
通し番号は保存せず、`buildOverallSeq` が進行順から毎回算出する。区切り行は数えない。
進行順を並べ替えたり区切りを挿したりすると、表示される番号は自動で振り直される。

`BracketMatch.matchName` は mustache のテンプレートで、既定値は
`"第{{OverallSeq}}試合"`（`lib/division/match-name.ts` の `DEFAULT_MATCH_NAME`）。
部門内で重複してよい。展開は `renderMatchName` / `resolveMatchNames` に集めてあり、
知らない変数は mustache の既定どおり空文字になる。`{{OverallSeq}}` は大会全体を
見ないと決まらないので、試合名を出す画面は大会全体を読んで展開済みの文字列を
受け取る。部門の画面（編集・詳細・公開）は `features/division/repository.ts` の
`listOverallOrderSources`、進行順と結果入力は `features/schedule` の読み出しが
自分の材料から作る。スロットの文言（「第 3 試合の勝者」）も展開済みの名前から作る
（`createSlotLabeler` は展開済みの名前の表を受け取る）。

構造上の位置 `matchPositionLabel` は試合番号と紛れないよう、トーナメントで
`N回戦 (M)`（M はラウンド内の上からの位置）、リーグでは空文字にする。表示側は
`formatDivisionPosition` を通し、空文字なら区切りごと描かない。

## features/division/record-result

`features/division/record-result` は、5 つの編集スライスと違って `setup-store.ts` を
**意図的に使わない**。`setup-store.ts` の読み出しは「`results` が 1 件でもあれば
部門の編集を拒否する」作りだが、このスライスが書き換えたいのはまさに `results` 列
そのものだから、この読み出しには乗れない。先例は `set-match-name` と同じ形の
専用トランザクション（所有権つきの読み出し・パース・検証・`updateMany` での
書き戻しをスライス自身の `repository.ts` に持つ）である。

このスライスはさらに、`Division.revision` による楽観ロックを持つ唯一の書き込み経路
でもある。読み出し時の `revision` をそのまま `updateMany` の `where` に入れ、
0 件を「他の操作が先に書いた」競合として扱う（`DivisionRevisionConflictError`）。
結果入力は会場で同時に複数人が同じ試合を操作しうるため、他のスライスの
「送ったキー集合が一致するか」（`features/division/reorder` 系）や「検出しない」
（`features/schedule` の区切り編集）とは異なる強さの排他制御を選んでいる。

## features/schedule/result-rows.ts

`features/schedule/result-rows.ts` は `domain.ts` と同じく、スライスではなく
カテゴリ直下に置く共有モジュールである。`buildScheduleView` の出力（進行順の行）に、
「いま誰がスロットに立っているか」と記録状態（`ready` / `recorded` / `waiting` / `bye`）
を足す読み出しの純粋関数を持つ。

勝者の伝播（`winnerOf` / `loserOf` の解決）と、そこから辿る下流試合の集合は
下位共通層の `src/lib/division/resolve.ts` に置く。`features/schedule` と
`features/division`（`record-result`）の両方がここを参照する。同列のカテゴリ同士では
依存できないため、`lib/division/label.ts` と同じ向きの下ろし方である。

エントリーの参照（`Division.entries` の `source`。「予選リーグA 1位」のような
仮名を出し、参照先の結果が出るたびに実選手まで解決し直す仕組み）の本体は
`src/lib/division/entry-source.ts` に置く。設定画面（`features/division`、
スロット編集の選択肢作りと警告表示）と結果入力（`features/schedule`、解決前は
入力欄を伏せる）の両方がここを参照するため、`lib/division/resolve.ts` と同じ
向きで下位共通層に下ろしてある。

リーグの勝敗集計と順位付け（勝点の計算、同順位の判定）の純粋部分は
`src/lib/division/standings.ts` に置く。星取表を組み立てる
`round-robin/standings.ts` と、エントリーの参照が「リーグの N 位」を解決するのに
使う `entry-source.ts` の両方が同じ順位付けを必要とし、後者は
`features/schedule` からも呼ばれて同列のカテゴリ同士の依存を避けられないため、
ここも `lib/division/resolve.ts` と同じ向きの下ろし方である。

## テナント分離の 2 原則

`features/organization` と `features/organization-user` と `features/tournament` と
`features/division` は組織単位のテナント分離が要る。
次の 2 点は次のスライスを書くときに必ず守る。

* 認可境界（`requireOrganization`）はページの冒頭だけでなく、**Server Action の冒頭でも独立に呼ぶ**。
  Server Action はページを経由せず直接叩ける、別のエントリポイントだから。
* 所有権のチェックはクエリの `where` に入れる。取得してから条件で弾く形にはしない。
  これが `update` / `delete` ではなく `updateMany` / `deleteMany` を使う理由で、Prisma の単数形は
  一意な `where` しか受け付けず `organizationId` を残せない。複数形なら件数が返るため、
  0 件は「この組織にその対象が無い」と読める。存在を漏らさないよう `notFound()` にする。
  例外は `features/division/reorder`：0 件は「端まで来ている」場合もあり得て、その場合はエラーではない。
  かつ「その部門が無い」場合と応答が区別できないため、両方とも `{ swapped: false }` のまま
  `{ error: null }` を返す（何も漏らさない点は変わらない）。

`features/division` は組織 → 大会 → 部門の 3 段になるが、原則は変わらない。
リレーションフィルタを使って `where: { id: divisionId, tournament: { id: tournamentId,
organizationId } }` と書き、3 段の所有権を 1 クエリで担保する。
`create` だけは `where` を持てないため、同じトランザクションの中で大会の所属を
別途確かめてから作る。

編集スライス（`add-entry` / `remove-entry` / `reorder-entry` / `generate-matching`）も
同じ原則に従う。所有権は `setup-store.ts` の `load` / `save` が
`where` に入れて担保する。`add-entry` だけは `Member` と `Participant` を作るため
`create` を使うが、`Member` は `organizationId` を直接持ち、`Participant` は
所有権を確かめた `tournamentId` の下に作るので、境界は保たれる。

`reorder-entry` の 0 件応答は `features/division/reorder` と同じ扱いで、
「端まで来ている」と「その対象が無い」を区別せず、どちらも成功として返す。

## 認可モデル

権限は `"<subject>.<action>"` 形式のコード（`user.view`、`tournament.create` など）で表す。
一覧は `src/shared/authz/ability.ts` の `PERMISSION_CODES` が持ち、DB の `Permission.code` と
1:1 で対応させる。保有コードから CASL の Ability を組み、可否はコードのまま問い合わせる。

* `requirePermission(slug, code)` は**ページの冒頭と、Server Action の冒頭で独立に呼ぶ**。
  Server Action はページを経由せず直接叩ける別のエントリポイントなので、
  ページで確認済みでも素通しにはできない。画面側でボタンを隠すのは体感のためで、
  境界にはならない。
* 権限が無い場合は 403 ではなく `notFound()`（404）にする。非所属を 404 にするのと同じ理由で、
  「権限が無い」と「そもそも存在しない」を区別させないため。
