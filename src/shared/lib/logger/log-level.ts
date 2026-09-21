import { LogLevel } from "effect";

/**
 * LOG_LEVEL に書ける名前の対照表。effect の LogLevel は _tag（Warning）と
 * label（WARN）の2つの名前を持つので、両方を受ける。どちらで書くか
 * 迷わせない方が設定ミスが減る。自前で水準を列挙せず allLevels から
 * 作るのは、effect 側に水準が増えたとき黙って取りこぼさないため。
 */
const levelsByName = new Map<string, LogLevel.LogLevel>(
  LogLevel.allLevels.flatMap((level) => [
    [level._tag.toLowerCase(), level] as const,
    [level.label.toLowerCase(), level] as const,
  ]),
);

/** LOG_LEVEL 未設定時の既定。本番は Info、それ以外は Debug。 */
const defaultLogLevel = (nodeEnv: string | undefined): LogLevel.LogLevel =>
  nodeEnv === "production" ? LogLevel.Info : LogLevel.Debug;

/**
 * LOG_LEVEL を LogLevel に変換する。未設定でも不正値でも既定値に倒し、
 * 例外を投げない。ログの設定ミスでアプリが起動しないのは本末転倒であり、
 * 一方でログが出ないことは動かせばすぐ気づける。
 */
export const parseLogLevel = (
  raw: string | undefined,
  nodeEnv: string | undefined,
): LogLevel.LogLevel =>
  levelsByName.get(raw?.trim().toLowerCase() ?? "") ?? defaultLogLevel(nodeEnv);

/** 実行時の環境変数から解決した LogLevel。 */
export const logLevelFromEnv = (): LogLevel.LogLevel =>
  parseLogLevel(process.env.LOG_LEVEL, process.env.NODE_ENV);
