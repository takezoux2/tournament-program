import { Effect, FiberRef, Logger } from "effect";
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
  it("Logger.minimumLogLevel(logLevelFromEnv()) が実際に反映されている", async () => {
    // toBeDefined() は Layer.merge の右半分（minimumLogLevel）が丸ごと
    // 落ちていても通ってしまう。ここでは FiberRef を実際に読み、
    // vitest.config.mts が設定する LOG_LEVEL=Off が反映されていることを
    // 確かめる。反映されていなければ既定値の Info のままになる。
    const minimum = await Effect.runPromise(
      FiberRef.get(FiberRef.currentMinimumLogLevel).pipe(
        Effect.provide(appLoggerLayer),
      ),
    );

    expect(minimum.label).toBe("OFF");
  });
});
