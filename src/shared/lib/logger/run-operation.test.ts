import { Cause, Data, Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runOperationExit } from "./run-operation";

class SampleError extends Data.TaggedError("SampleError")<{
  readonly id: string;
}> {}

describe("runOperationExit", () => {
  it("成功を Exit.Success として返す", async () => {
    const exit = await runOperationExit(
      "sample.do",
      { request: { id: "x" }, context: { organizationId: "o1" } },
      Effect.succeed({ recorded: true }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ recorded: true });
    }
  });

  it("失敗を Exit.Failure として返し、失敗値を保つ", async () => {
    const exit = await runOperationExit(
      "sample.do",
      {},
      Effect.fail(new SampleError({ id: "x" })),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value._tag).toBe("SampleError");
      }
    }
  });

  it("defect も Exit.Failure として返す。ログを巻いても握り潰さない", async () => {
    const exit = await runOperationExit(
      "sample.do",
      {},
      Effect.die(new Error("boom")),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.isDie(exit.cause)).toBe(true);
    }
  });
});

describe("runOperationExit は appLoggerLayer を通して実際に出力する", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("vitest.config.mts の LOG_LEVEL=Off では何も出力しない", async () => {
    // appLoggerLayer が Layer.merge(出力先, Logger.minimumLogLevel(...)) の
    // 後半を落としていたら、出力先だけが効いて Off でも出てしまう。
    // pretty logger は console.log と console.group/groupEnd を使うので、
    // 両方を見張る。
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const groupSpy = vi.spyOn(console, "group").mockImplementation(() => {});

    await runOperationExit("sample.do", {}, Effect.succeed(undefined));

    expect(logSpy).not.toHaveBeenCalled();
    expect(groupSpy).not.toHaveBeenCalled();
  });

  it("LOG_LEVEL=Debug に上げると実際に出力される", async () => {
    // appLoggerLayer は process.env をモジュール読み込み時に一度だけ読むので、
    // 環境変数を変えた効果を見るには resetModules で読み直させる必要がある。
    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "Debug");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fresh = await import("./run-operation");
    await fresh.runOperationExit("sample.do", {}, Effect.succeed(undefined));

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("sample.do");
  });
});
