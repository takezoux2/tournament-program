import { Layer, Logger } from "effect";
import { logLevelFromEnv } from "./log-level";

/**
 * 出力先の選択。本番は JSON（ログ収集基盤にそのまま流せる）、
 * それ以外は pretty（人が読む前提）。NODE_ENV を引数で受けるのは、
 * 判定をテストから確かめられるようにするため。
 */
export const loggerOutputLayer = (
  nodeEnv: string | undefined,
): Layer.Layer<never> => (nodeEnv === "production" ? Logger.json : Logger.pretty);

/**
 * アプリ全体のログ設定。出力先と最小レベルをまとめたもの。
 * 環境変数はモジュール読み込み時に一度だけ読む。
 */
export const appLoggerLayer: Layer.Layer<never> = Layer.merge(
  loggerOutputLayer(process.env.NODE_ENV),
  Logger.minimumLogLevel(logLevelFromEnv()),
);
