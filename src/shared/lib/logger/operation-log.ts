import { Cause, Effect, FiberRef, LogLevel, Option, Predicate } from "effect";
import { redact } from "./redact";

export type OperationLogOptions = {
  /** zod で検証済みの入力。redact を通して debug に出す。 */
  readonly request?: unknown;
  /** 全行の annotations に付ける識別子。organizationId など。 */
  readonly context?: Record<string, unknown>;
};

/**
 * 型としては宣言されているが、中身は想定外の障害であるエラーを見分ける。
 * Effect.tryPromise の catch が DB 例外を包んだ UnexpectedXxxError が該当し、
 * DB の接続断やマイグレーション不整合がここに来る。想定内の warn に
 * 埋もれると気づけないので error に上げる。
 *
 * 判定は _tag の接頭辞という命名規約に依存している。現在は6ドメインとも
 * UnexpectedXxxError で揃っている。規約から外れた名前が出てきたら、
 * ここをドメインごとの対照表（Record<XxxError["_tag"], LogLevel>）に
 * 切り替えること。errors.ts の divisionErrorTags が同じ形の前例。
 */
const isUnexpectedError = (error: unknown): boolean =>
  Predicate.isRecord(error) &&
  Predicate.hasProperty(error, "_tag") &&
  typeof error._tag === "string" &&
  error._tag.startsWith("Unexpected");

/**
 * debug 行を遅延評価する。Effect.logDebug(msg, redact(x)) と書くと
 * redact は引数なので最小ログレベルの判定より先に必ず走る。本番の
 * LOG_LEVEL=Info では捨てるだけの深いコピーを毎回作ることになり、
 * さらに redact が投げた場合は成功した処理が defect に化ける。
 * 出すと決まってから初めて値を作る。
 */
const logDebugLazy = (
  message: string,
  make: () => unknown,
): Effect.Effect<void> =>
  Effect.flatMap(FiberRef.get(FiberRef.currentMinimumLogLevel), (minimum) =>
    LogLevel.greaterThanEqual(LogLevel.Debug, minimum)
      ? Effect.logDebug(message, make())
      : Effect.void,
  );

/**
 * Effect にログを巻く。渡した Effect の成功値も失敗値も変えない。
 *
 * ここでは Logger を差し替えない。差し替えを中で Effect.provide すると
 * 内側の指定が勝ち、テストから出力先を覗けなくなる。出力先を与えるのは
 * run-operation.ts の役目。
 */
export const withOperationLog = <A, E>(
  operation: string,
  options: OperationLogOptions,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.logInfo(`${operation} 開始`).pipe(
    Effect.zipRight(
      // request を渡さないハンドラ（division.generate-matching など）で
      // "${operation} リクエスト" undefined という空虚な行を出さない。
      options.request === undefined
        ? Effect.void
        : logDebugLazy(`${operation} リクエスト`, () =>
            redact(options.request),
          ),
    ),
    Effect.zipRight(effect),
    Effect.tap((value) =>
      logDebugLazy(`${operation} レスポンス`, () => redact(value)),
    ),
    Effect.tap(() => Effect.logInfo(`${operation} 完了`)),
    Effect.tapErrorCause((cause) =>
      Option.match(Cause.failureOption(cause), {
        // 型として宣言されていない失敗（defect・中断）。
        onNone: () => Effect.logError(`${operation} 想定外のエラー`, cause),
        onSome: (error) =>
          isUnexpectedError(error)
            ? Effect.logError(`${operation} 想定外のエラー`, error)
            : Effect.logWarning(`${operation} 失敗`, error),
      }),
    ),
    // span 内の全行に所要時間（開始からの経過）が入る。一番役立つのは完了行だが、
    // 他の行にも同様に載る。
    Effect.withLogSpan(operation),
    Effect.annotateLogs({ operation, ...options.context }),
  );
