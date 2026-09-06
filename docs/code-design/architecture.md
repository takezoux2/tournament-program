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

`features/bracket/from-division.ts` は `lib/division` の永続化型を描画型へ変換する
アダプタ。`features/division` 側に置くと同列スライスへの依存になるため、
`features/bracket` から下位共通層の `lib/division` を参照する向きにしてある。
対応するのは `SINGLE_ELIMINATION` のみで、それ以外は `null` を返す。

## features/division の共有ドメイン

`features/division/single-elimination/` はスライスではなく、カテゴリ直下に置く
共有ドメインである。`handler.ts` と `repository.ts` を持たないことで
スライスと見分けられる。5 つの編集スライス（`add-entry` / `remove-entry` /
`reorder-entry` / `generate-matching` / `swap-slots`）のうち、組み合わせ
（`matchingConfig`）を書き換える 4 つ（`add-entry` / `remove-entry` /
`generate-matching` / `swap-slots`）がここへ祖先方向に依存する。`reorder-entry`
はシード順（`entries`）だけを書き換え `matchingConfig` には触らないため、
single-elimination には依存しない。5 スライスとも依存先は `../setup-store`
や `../errors` のような上位のモジュールに限られ、スライス同士の依存
（例えば `add-entry` が `remove-entry` を import する経路）は存在しない。

シングルエリミネーションのブラケットは「1 回戦のスロット割当配列（長さ 2 の冪）」
だけで完全に決まる。2 回戦以降のスロットは必ず `winnerOf` だからである。
この配列を唯一の状態とし、木は `buildFromSlots` で毎回組み立て直す。
試合 id を `m{round}-{order}` の決定的な形にしてあるため、組み立て直しても
`winnerOf` の参照が壊れる経路が存在しない。

`buildFromSlots` は渡された配列の長さが 2 の冪でなくても、次の 2 の冪まで
`{ kind: "bye" }` で埋めてから組み立てる。`generateSlots` の出力や `placeEntry` が
返す配列はすでに 2 の冪だが、埋め立てが働く経路は実在する。`swap-slots` は保存済みの
`matchingConfig` を `toSlots` で取り出して `buildFromSlots` に渡し直すため、DB の値が
2 の冪でない（1 回戦の試合数が 2 の冪でない）場合、この往復で正規形に矯正される。
つまりこの埋め立ては死んだコードではなく、外から入った歪な値を直す経路そのものである。

`setup-store.ts` は 5 スライス共通の read-modify-write を持つ。所有権つきの読み出し、
Json のパース、勝敗が記録済みかの確認、保存前の検証、`updateMany` での書き戻しを
1 つのトランザクションにまとめる。スライス側の `repository.ts` は
「配列をどう変えるか」だけを書けばよくなる。

## features/schedule

大会の「進行順」（試合一覧の並びと区切り行）を持つ。試合の実体は
`Division.matchingConfig`（Json）の中にあり、`ScheduleItem` は
`(divisionId, matchId)` の文字列で指すだけなので、行と実体は必ずずれうる
（組み合わせの再生成、部門の削除、新しい部門の組み合わせ）。

このずれは読み出しの純粋関数 `buildScheduleView` が吸収する。保存された行を
`order` 昇順に並べ、実体の無い行を落とし、行を持たない試合を
「部門の order 昇順 → round 昇順 → order 昇順」で末尾へ足す。読み出しは
副作用を持たず、DB の掃除は次の保存（全行の書き直し）でまとめて片付く。

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

## features/division/record-result

`features/division/record-result` は、5 つの編集スライスと違って `setup-store.ts` を
**意図的に使わない**。`setup-store.ts` の読み出しは「`results` が 1 件でもあれば
部門の編集を拒否する」作りだが、このスライスが書き換えたいのはまさに `results` 列
そのものだから、この読み出しには乗れない。先例は `set-match-number` と同じ形の
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

編集スライス（`add-entry` / `remove-entry` / `reorder-entry` / `generate-matching` /
`swap-slots`）も同じ原則に従う。所有権は `setup-store.ts` の `load` / `save` が
`where` に入れて担保する。`add-entry` だけは `Member` と `Participant` を作るため
`create` を使うが、`Member` は `organizationId` を直接持ち、`Participant` は
所有権を確かめた `tournamentId` の下に作るので、境界は保たれる。

`reorder-entry` と `swap-slots` の 0 件応答は `features/division/reorder` と同じ扱いで、
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
