import "server-only";
import { Effect, type Exit } from "effect";
import { appLoggerLayer } from "./logger-layer";
import { type OperationLogOptions, withOperationLog } from "./operation-log";

/**
 * Server Action から Effect を実行する入口。ログを巻き、アプリのログ設定を
 * 与えてから runPromiseExit する。
 *
 * 戻り値は Effect.runPromiseExit と同じ Exit なので、呼び出し側の
 * Exit.isFailure 分岐と effect-to-form-state はそのまま使える。
 *
 * operation は "division.record-result" のようにディレクトリ構成そのままの
 * 名前を渡す。ログから場所を引けるようにするため、命名を揺らさないこと。
 */
export const runOperationExit = <A, E>(
  operation: string,
  options: OperationLogOptions,
  effect: Effect.Effect<A, E>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    withOperationLog(operation, options, effect).pipe(
      Effect.provide(appLoggerLayer),
    ),
  );
