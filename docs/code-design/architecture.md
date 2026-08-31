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

## テナント分離の 2 原則

`features/organization` と `features/tournament` と `features/division` は組織単位の
テナント分離が要る。次の 2 点は次のスライスを書くときに必ず守る。

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