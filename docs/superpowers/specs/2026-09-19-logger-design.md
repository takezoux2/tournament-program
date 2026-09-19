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
- 循環参照は辿らない。同じオブジェクトを2度目に見たら `"[circular]"` を返す。

判定はキー名だけで行う。値の中身（メールアドレスらしき文字列）は見ない。
誤検知で無関係な値が消えるほうが、調査時に困る。

### `with-operation-log.ts`

本体。Effect を受け取り、ログを巻き付けた同じ型の Effect を返す。

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
- `Effect.withLogSpan(operation)` を掛ける。完了行に所要時間が入る。
- Logger の差し替えと最小レベルはこのヘルパーの中で `Effect.provide` する。呼び出し側は Layer を知らなくてよい。

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

`.env.example` に `LOG_LEVEL` を追記する。

## 呼び出し側

`src/features/division/*/handler.ts` の13ファイル。
`Effect.runPromiseExit` はそのまま残し、渡す Effect を包む。既存の `Exit.isFailure` 分岐と
`divisionErrorFormState` は変更しない。

```diff
 const exit = await Effect.runPromiseExit(
-  recordResultForDivision(recordResultInDb, ids, parsed.data),
+  withOperationLog(
+    "division.record-result",
+    {
+      request: parsed.data,
+      context: { organizationId: organization.id, tournamentId, divisionId },
+    },
+    recordResultForDivision(recordResultInDb, ids, parsed.data),
+  ),
 );
```

`operation` 名の一覧:

`division.add-entry` / `division.create` / `division.delete` / `division.generate-matching` /
`division.record-result` / `division.remove-entry` / `division.reorder-entry` / `division.reorder` /
`division.set-match-name` / `division.set-player-number` / `division.swap-slots` /
`division.update-result-detail` / `division.update`

## テスト

既存のスタイル（vitest、`Effect.runPromiseExit`、`src/shared/testing/exit.ts`）に合わせる。

- `log-level.test.ts` — 環境変数のパース、未設定時の既定値、不正値のフォールバック。
- `redact.test.ts` — 機微キーの置換、ネスト・配列、`Date` の素通し、循環参照。
- `with-operation-log.test.ts` — `Logger.replace` でテスト用ロガーを差し込み、
  成功時に info/debug が期待順で出ること、型付きエラーで warn、`Unexpected` 接頭辞と defect で error が出ること、
  annotations に `operation` と `context` が乗ること。
  ログを巻いても Effect の成功値・失敗値が変わらないことも確認する。

handler のテストは変更しない。ログは戻り値に影響しないため。

## 非目標

- 参照系（ページの読み取り）のログ。
- リクエスト ID / トレース ID の採番と伝播。Effect の fiber と `annotateLogs` で足りる範囲を超える。
- 外部のログ収集基盤への送信設定。
