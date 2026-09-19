import { Logger } from "effect";
import { describe, expect, it } from "vitest";
import { appLoggerLayer, loggerOutputLayer } from "./logger-layer";

describe("loggerOutputLayer", () => {
  it("本番は JSON。ログ収集基盤にそのまま流せる形にする", () => {
    expect(loggerOutputLayer("production")).toBe(Logger.json);
  });

  it("開発は pretty。人が読む前提の形にする", () => {
    expect(loggerOutputLayer("development")).toBe(Logger.pretty);
  });

  it("NODE_ENV 未設定は pretty に倒す", () => {
    expect(loggerOutputLayer(undefined)).toBe(Logger.pretty);
  });
});

describe("appLoggerLayer", () => {
  it("出力先と最小レベルをまとめた Layer が組み立てられる", () => {
    expect(appLoggerLayer).toBeDefined();
  });
});
