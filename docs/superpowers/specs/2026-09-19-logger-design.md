# ロガー導入 設計

## 背景

アプリにログの仕組みが無い。`console.error` が `src/features/user/change-email/handler.ts:71` に1箇所あるだけで、
Server Action が動いたことも、失敗したことも、本番では何も残らない。障害調査の足場が無い。

依存には既に `effect` があり、書き込み系の処理はすべて Effect で書かれている。
Effect は `Effect.logInfo` などのログ API と、ログ出力先を差し替える `Logger` Layer を標準で持つ。
新しいログライブラリを足さず、これを使う。

## ゴール

- 処理開始と正常完了を **info** で出す。
- 想定内のエラーを **warn** で出す。
- 想定外のエラーを **error** で出す。
- リクエストとレスポンスの内容を **debug** で出す。

## 対象範囲

Effect を使っている層に限る。

- **対象**: 各 Server Action が `Effect.runPromiseExit` に渡す Effect（書き込み系）。
- **対象外**: zod の parse 失敗、`requireOrganization` / `requirePermission` といった handler の Effect 外の部分。
- **対象外**: 参照系の repository（`src/features/*/repository.ts`）。これらは `Promise` を返しており Effect 層ではない。

今回入れるのは共通モジュールと `division` ドメインの13ハンドラのみ。
実際に出たログを見てから、残り5ドメイン26ハンドラに広げる。

## 共通モジュール

`src/shared/lib/logger/` に置く。`src/shared/lib/mail/` と同じ粒度の共有物。

**実装時に構成を1点変更した。** 当初はログを巻く関数の中で Logger の差し替えと最小レベルを
`Effect.provide` する設計だった。しかしそれだと内側の `Effect.provide` が勝ち、
テスト側が外から `Effect.provide` で差し込んだ Logger（`src/shared/testing/log-entries.ts` の
`collectLogs()`）が上書きされてしまい、テストからログ出力先を差し替えられない。
そこで Layer を与える責務を呼び出し口（`run-operation.ts`）に分離し、
combinator（`operation-log.ts`）は Layer を持たない純粋な関数にした。詳細は後述の
「Logger の差し替え」と「ファイル構成」を参照。

### `log-level.ts`

`LOG_LEVEL` 環境変数を `LogLevel.LogLevel` に変換する。

- 値は `Debug` / `Info` / `Warning` / `Error` などの Effect の LogLevel ラベル。大文字小文字は問わない。
- 未設定なら `NODE_ENV === "production"` で `Info`、それ以外で `Debug`。
- 不正値は既定値に倒す。例外を投げない。ログの設定ミスでアプリが起動しないのは本末転倒であり、
  ログが出ないことは実行中に気づける。

### `redact.ts`

debug に出す前に機微な値を落とす。

```ts
export const redact = (value: unknown): unknown
```

- キー名を小文字化して `password` / `token` / `secret` / `email` のいずれかを含めば、値を `"[redacted]"` に置換する。
  完全一致ではなく部分一致にするのは、`currentPassword` / `newPassword` / `emailVerificationToken` のような
  派生キーを都度追加しなくても落ちるようにするため。
- プレーンオブジェクトと配列は再帰的に辿る。`Date` はそのまま通す（`Object.entries` で分解すると `{}` になる）。
- `null` / プリミティブはそのまま返す。
- 循環参照は辿らない。判定は「今見ているオブジェクトが祖先チェーン（今たどっている経路の途中）に
  すでにいるか」であり、訪問済み全体の集合ではない。祖先を抜けたら訪問済みマークを外すので、
  同じオブジェクトを複数のキーから参照している（循環していない共有参照）場合は、
  2度目もそのまま展開される。`"[circular]"` になるのは、自分自身を辿った経路上に
  自分がもう一度現れたときだけ。

判定はキー名だけで行う。値の中身（メールアドレスらしき文字列）は見ない。
誤検知で無関係な値が消えるほうが、調査時に困る。

### `operation-log.ts`

本体。Effect を受け取り、ログを巻き付けた同じ型の Effect を返す `withOperationLog` を持つ。
Logger の差し替えはしない（後述）ので、ファイル名に `with` を冠さず combinator であることを表す。

```ts
export const withOperationLog = <A, E>(
  operation: string,
  options: { request?: unknown; context?: Record<string, unknown> },
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E>
```

- `operation`: `"division.record-result"` のようにディレクトリ構成そのままの名前。
- `request`: zod で parse 済みの入力。`redact` を通して debug に出す。
- `context`: `organizationId` / `tournamentId` / `divisionId` など、全行に付けたい識別子。

出るログ:

| タイミング | レベル | メッセージ |
| --- | --- | --- |
| 処理開始 | info | `${operation} 開始` |
| リクエスト | debug | `${operation} リクエスト` ＋ redact 済みの `request` |
| レスポンス | debug | `${operation} レスポンス` ＋ redact 済みの成功値 |
| 正常完了 | info | `${operation} 完了` |
| 想定内エラー | warn | `${operation} 失敗` ＋ エラー値 |
| 想定外エラー | error | `${operation} 想定外のエラー` ＋ Cause |

- `operation` と `context` は `Effect.annotateLogs` で全行に付く。1リクエスト分のログを後から串刺しできる。
- `Effect.withLogSpan(operation)` を掛ける。span 内の全行に所要時間（開始からの経過）が入る。
  一番役立つのは完了行だが、他の行にも同様に載る。
- 遅延評価: `redact(options.request)` / `redact(value)` は、実際にその debug 行を出すと
  決まってから初めて評価する（`FiberRef.currentMinimumLogLevel` を見てから呼ぶ）。
  引数として先に評価してしまうと、本番の `LOG_LEVEL=Info` では捨てるだけの深いコピーを
  毎回作ることになり、さらに `redact` が例外を投げた場合、レスポンス側は
  `Effect.tap` の中で評価しているぶん defect（成功した処理が失敗扱いになる）に化ける。
- **`context` と失敗値（`${operation} 失敗` / `${operation} 想定外のエラー` の第2引数）は
  `redact` を通さない。** `context` は識別子（`organizationId` など）だけを持つ前提だから
  問題ないが、これは次の5ドメイン・26ハンドラにも適用される規約であり、
  自由記述の値を `context` に混ぜないこと。例えば `src/features/organization-user/search/schema.ts`
  の `query` はユーザー名だけでなくメールアドレスがそのまま入ることが多いフィールドだが、
  キー名が `query` である限り `redact` の機微キー判定（`password` / `token` / `secret` / `email`
  の部分一致）には掛からない。自由記述はすべて `request` 側に置く。
- 「完了」は **Effect が正常終了したこと** を指し、Server Action そのものの終了ではない。
  `${operation} 完了` は handler の `revalidatePath()` / `redirect()` より前、Effect の中で出る。
  そのため `revalidatePath()` や `redirect()` 自体が失敗しても、完了ログは出ているのに
  エラーログは無いという状態になり得る。
- Effect に入る前（zod の `safeParse` 失敗、`requireOrganization` / `requirePermission` の
  却下、`division.delete` の `confirmName` 不一致など）は、そもそもこの仕組みの対象外なので
  ログは一切出ない。これは対象範囲どおりの仕様であり見落としではないが、
  オンコール対応者には「ログが無い＝失敗していない」ではないことを一度は伝えておく。

### 想定内 / 想定外の判定

`Effect.tapErrorCause` で Cause を受け、次の順に振り分ける。

1. `Cause.failureOption` が `None` — defect（`Cause.Die`）または interrupt。
   型として宣言されていない失敗なので **error**。
2. `None` ではなく、失敗値の `_tag` が `"Unexpected"` で始まる — **error**。
   `UnexpectedDivisionError` は `Effect.tryPromise` の `catch` が DB 例外を包んだもので、
   型としては宣言されているが中身は想定外の障害。DB 接続断やマイグレーション不整合がここに来る。
   warn に埋もれると気づけないので error に上げる。
3. それ以外の型付きエラー — **warn**。`DivisionMatchNotFoundError` のような、
   起き得ることを見越して型に書いてあるエラー。

`_tag` の接頭辞という命名規約への依存は承知の上で選ぶ。ドメインごとに網羅表を持つ案もあったが、
6ドメイン・約30クラスに表を足すのは今回の目的に対して重い。
規約に合わない名前が将来出たら、そのときドメイン別の対照表に切り替える。

### Logger の差し替え

```ts
const loggerLayer = Layer.merge(
  process.env.NODE_ENV === "production" ? Logger.json : Logger.pretty,
  Logger.minimumLogLevel(logLevelFromEnv()),
);
```

- 開発は `Logger.pretty`（色付き・人が読む前提）。
- 本番は `Logger.json`（ログ収集基盤にそのまま流せる）。
- `Logger.json` / `Logger.pretty` / `Logger.minimumLogLevel` はいずれも effect 3.22 の標準 Layer。
- **この Layer を与えるのは `withOperationLog`（`operation-log.ts`）自身ではなく、
  呼び出し口の `runOperationExit`（`run-operation.ts`）である。** 当初案どおり
  `withOperationLog` の中で `Effect.provide` すると、テストが外側から
  `Effect.provide(collectLogs().layer)` のようにテスト用 Logger を差し込んでも、
  内側の `provide` の方が勝ってしまい（`Effect.provide` は近い方が優先される）、
  テストから出力先を観測できなくなる。`operation-log.ts` は Layer を持たない
  純粋な combinator にとどめ、`run-operation.ts` が `appLoggerLayer` を
  一番外側で `Effect.provide` する。

`.env.example` に `LOG_LEVEL` を追記する。

## 呼び出し側

`src/features/division/*/handler.ts` の13ファイル。
既存の `Exit.isFailure` 分岐と `divisionErrorFormState` は変更しない。
`Effect.runPromiseExit(...)` の呼び出しそのものを、ログと Layer 付与をまとめた
`runOperationExit(operation, options, effect)` に置き換える。

```diff
-  const exit = await Effect.runPromiseExit(
-    recordResultForDivision(
-      recordResultInDb,
-      { organizationId: organization.id, tournamentId, divisionId },
-      parsed.data,
-    ),
-  );
+  const exit = await runOperationExit(
+    "division.record-result",
+    {
+      request: parsed.data,
+      context: {
+        userId: session.user.id,
+        organizationId: organization.id,
+        tournamentId,
+        divisionId,
+      },
+    },
+    recordResultForDivision(
+      recordResultInDb,
+      { organizationId: organization.id, tournamentId, divisionId },
+      parsed.data,
+    ),
+  );
```

（実例: `src/features/division/record-result/handler.ts`）

`operation` 名の一覧:

`division.add-entry` / `division.create` / `division.delete` / `division.generate-matching` /
`division.record-result` / `division.remove-entry` / `division.reorder-entry` / `division.reorder` /
`division.set-match-name` / `division.set-player-number` / `division.swap-slots` /
`division.update-result-detail` / `division.update`

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `src/shared/lib/logger/log-level.ts` | `LOG_LEVEL` 環境変数 → `LogLevel` の変換 |
| `src/shared/lib/logger/redact.ts` | debug に出す値から機微なキーを落とす |
| `src/shared/lib/logger/logger-layer.ts` | 出力先（pretty / json）と最小レベルをまとめた Layer（`appLoggerLayer`） |
| `src/shared/lib/logger/operation-log.ts` | ログを巻く combinator（`withOperationLog`）。Layer は持たない |
| `src/shared/lib/logger/run-operation.ts` | handler から呼ぶ入口（`runOperationExit`）。combinator ＋ Layer ＋ `runPromiseExit` |
| `src/shared/testing/log-entries.ts` | テストでログを配列に溜める Layer（`collectLogs()`） |
| `src/features/division/*/handler.ts` | 13ファイル。`Effect.runPromiseExit` → `runOperationExit` |

## テスト

既存のスタイル（vitest、`Effect.runPromiseExit`、`src/shared/testing/exit.ts`）に合わせる。

- `log-level.test.ts` — 環境変数のパース、未設定時の既定値、不正値のフォールバック。
- `redact.test.ts` — 機微キーの置換、ネスト・配列、`Date` の素通し、循環参照（祖先チェーンでのみ検出）。
- `operation-log.test.ts` — `src/shared/testing/log-entries.ts` の `collectLogs()` でテスト用ロガーを
  差し込み、成功時に info/debug が期待順で出ること、型付きエラーで warn、`Unexpected` 接頭辞と
  defect で error が出ること、annotations に `operation` と `context` が乗ること、
  `redact` が最小ログレベル判定より後に遅延評価されること（最小レベルを Info に上げると
  debug 行が消え、かつ `redact` 自体が呼ばれないこと）を確認する。
  ログを巻いても Effect の成功値・失敗値が変わらないことも確認する。
- `logger-layer.test.ts` — `loggerOutputLayer` の出力先切り替えと、`appLoggerLayer` が
  実際に `LOG_LEVEL` から最小レベルを組み立てていること（`FiberRef.currentMinimumLogLevel` を
  読んで確認する）。
- `run-operation.test.ts` — `runOperationExit` の `Exit` が変わらないことに加え、
  `appLoggerLayer` を通して実際に（`console` へ）出力されること・されないことを
  環境変数越しに確認する。

handler のテストは変更しない。ログは戻り値に影響しないため。

## 非目標

- 参照系（ページの読み取り）のログ。
- リクエスト ID / トレース ID の採番と伝播。Effect の fiber と `annotateLogs` で足りる範囲を超える。
- 外部のログ収集基盤への送信設定。
