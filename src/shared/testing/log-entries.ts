import { type Cause, HashMap, Layer, Logger, LogLevel } from "effect";

export type LogEntry = {
  readonly level: string;
  readonly message: readonly unknown[];
  readonly annotations: Record<string, unknown>;
  readonly cause: Cause.Cause<unknown>;
};

/**
 * ログを配列に溜める Layer を作る。最小レベルを Trace まで下げて
 * 全部拾う。Effect を返す関数のログを検証するテストで使う。
 */
export const collectLogs = (): {
  entries: LogEntry[];
  layer: Layer.Layer<never>;
} => {
  const entries: LogEntry[] = [];
  const logger = Logger.make<unknown, void>(
    ({ logLevel, message, annotations, cause }) => {
      entries.push({
        level: logLevel.label,
        // effect は単数でも配列で渡してくるが、ランタイム自身が出す行は
        // 文字列のことがあるので両方受ける。
        message: Array.isArray(message) ? message : [message],
        annotations: Object.fromEntries(HashMap.entries(annotations)),
        cause,
      });
    },
  );
  return {
    entries,
    layer: Layer.merge(
      Logger.replace(Logger.defaultLogger, logger),
      Logger.minimumLogLevel(LogLevel.Trace),
    ),
  };
};

/**
 * effect のランタイムが失敗時に自前で出す
 * "Fiber terminated with an unhandled error" を落とす。
 * annotations に operation が付いている行だけが withOperationLog の出力。
 */
export const operationLogs = (
  entries: readonly LogEntry[],
): readonly LogEntry[] =>
  entries.filter((entry) => entry.annotations.operation !== undefined);
