import { Cause, Data, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
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
