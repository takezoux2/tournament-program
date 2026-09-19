import { Cause, Data, Effect, Exit, Layer, Logger, LogLevel } from "effect";
import { describe, expect, it } from "vitest";
import { collectLogs, operationLogs } from "@/shared/testing/log-entries";
import { type OperationLogOptions, withOperationLog } from "./operation-log";
import { REDACTED } from "./redact";

/**
 * collectLogs() は最小レベルを Trace まで下げて全部拾う。ここでは逆に
 * 最小レベルを固定した状態でログを溜めたいので、同じ形を最小限だけ作る。
 */
const collectLogsAtLevel = (
  minimum: LogLevel.LogLevel,
): { messages: (readonly unknown[])[]; layer: Layer.Layer<never> } => {
  const messages: (readonly unknown[])[] = [];
  const logger = Logger.make<unknown, void>(({ message }) => {
    messages.push(Array.isArray(message) ? message : [message]);
  });
  return {
    messages,
    layer: Layer.merge(
      Logger.replace(Logger.defaultLogger, logger),
      Logger.minimumLogLevel(minimum),
    ),
  };
};

class SampleNotFoundError extends Data.TaggedError("SampleNotFoundError")<{
  readonly id: string;
}> {}

class UnexpectedSampleError extends Data.TaggedError("UnexpectedSampleError")<{
  readonly reason: unknown;
}> {}

const run = async <A, E>(
  effect: Effect.Effect<A, E>,
  options: OperationLogOptions = {},
) => {
  const { entries, layer } = collectLogs();
  const exit = await Effect.runPromiseExit(
    withOperationLog("sample.do", options, effect).pipe(Effect.provide(layer)),
  );
  return { exit, logs: operationLogs(entries) };
};

describe("withOperationLog", () => {
  it("成功時は info 開始 → debug リクエスト → debug レスポンス → info 完了 の順に出す", async () => {
    const { logs } = await run(Effect.succeed({ recorded: true }), {
      request: { matchId: "m1" },
    });

    expect(logs.map((entry) => [entry.level, entry.message[0]])).toEqual([
      ["INFO", "sample.do 開始"],
      ["DEBUG", "sample.do リクエスト"],
      ["DEBUG", "sample.do レスポンス"],
      ["INFO", "sample.do 完了"],
    ]);
  });

  it("リクエストとレスポンスの中身を debug に載せる", async () => {
    const { logs } = await run(Effect.succeed({ recorded: true }), {
      request: { matchId: "m1" },
    });

    expect(logs[1].message[1]).toEqual({ matchId: "m1" });
    expect(logs[2].message[1]).toEqual({ recorded: true });
  });

  it("リクエストの機微なキーは伏せる", async () => {
    const { logs } = await run(Effect.succeed(null), {
      request: { name: "山田", password: "hunter2" },
    });

    expect(logs[1].message[1]).toEqual({ name: "山田", password: REDACTED });
  });

  it("request が undefined ならリクエスト行を出さない", async () => {
    const { logs } = await run(Effect.succeed({ recorded: true }));

    expect(logs.map((entry) => entry.message[0])).not.toContain(
      "sample.do リクエスト",
    );
  });

  it("最小レベルを Info に上げると debug 行が消え、redact も呼ばれない", async () => {
    // redact は Object.entries でオブジェクトを分解するので、直接読めば
    // 呼ばれたかどうかが分かる。debug 行が出ないことだけを見るテストは
    // 旧・即時評価の実装でも通ってしまい、遅延化の証明にならない。
    let requestRead = false;
    const request = {
      get probe(): string {
        requestRead = true;
        return "value";
      },
    };
    let responseRead = false;
    const response = {
      get probe(): string {
        responseRead = true;
        return "value";
      },
    };

    const { messages, layer } = collectLogsAtLevel(LogLevel.Info);
    const exit = await Effect.runPromiseExit(
      withOperationLog("sample.do", { request }, Effect.succeed(response)).pipe(
        Effect.provide(layer),
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    const operationMessages = messages.filter(
      (message) =>
        typeof message[0] === "string" && message[0].startsWith("sample.do"),
    );
    expect(operationMessages.map((message) => message[0])).toEqual([
      "sample.do 開始",
      "sample.do 完了",
    ]);
    expect(requestRead).toBe(false);
    expect(responseRead).toBe(false);
  });

  it("operation と context を全行の annotations に付ける", async () => {
    const { logs } = await run(Effect.succeed(null), {
      context: { organizationId: "o1", divisionId: "d1" },
    });

    for (const entry of logs) {
      expect(entry.annotations).toMatchObject({
        operation: "sample.do",
        organizationId: "o1",
        divisionId: "d1",
      });
    }
  });

  it("成功値をそのまま返す", async () => {
    const { exit } = await run(Effect.succeed({ recorded: true }));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ recorded: true });
    }
  });

  it("型として宣言されたエラーは想定内として warn に出す", async () => {
    const { logs } = await run(
      Effect.fail(new SampleNotFoundError({ id: "x" })),
    );

    const failure = logs.at(-1);
    expect(failure?.level).toBe("WARN");
    expect(failure?.message[0]).toBe("sample.do 失敗");
    expect(failure?.message[1]).toMatchObject({ _tag: "SampleNotFoundError" });
  });

  it("Unexpected で始まるエラーは型付きでも error に上げる", async () => {
    const { logs } = await run(
      Effect.fail(new UnexpectedSampleError({ reason: new Error("db down") })),
    );

    const failure = logs.at(-1);
    expect(failure?.level).toBe("ERROR");
    expect(failure?.message[0]).toBe("sample.do 想定外のエラー");
  });

  it("defect は error に出し、cause を残す", async () => {
    const { logs } = await run(Effect.die(new Error("boom")));

    const failure = logs.at(-1);
    expect(failure?.level).toBe("ERROR");
    expect(failure?.message[0]).toBe("sample.do 想定外のエラー");
    // effect は Cause を message ではなく cause 欄へ移す。
    expect(Cause.isDie(failure?.cause ?? Cause.empty)).toBe(true);
  });

  it("失敗時は完了ログを出さない", async () => {
    const { logs } = await run(
      Effect.fail(new SampleNotFoundError({ id: "x" })),
    );

    expect(logs.map((entry) => entry.message[0])).not.toContain(
      "sample.do 完了",
    );
  });

  it("失敗値を握り潰さずそのまま返す", async () => {
    const { exit } = await run(
      Effect.fail(new SampleNotFoundError({ id: "x" })),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.failureOption(exit.cause)._tag).toBe("Some");
    }
  });
});
