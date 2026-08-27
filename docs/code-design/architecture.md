アーキテクチャーは、垂直スライスアーキテクチャー（Vertical Slice Architecture）を採用する。機能ごとにコードを分割し、各機能が独立して開発・テストできるようにする。

ディレクトリやファイルは以下のように分割する。
```
src/
├── features/                     # 垂直スライス（機能単位）
│   └── user/                     # 機能カテゴリー
│       ├── registration/         # アクション
│       │   ├── schema.ts         # 入力バリデーション（Zod）
│       │   ├── handler.ts        # HTTPエンドポイント・ルーティング
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