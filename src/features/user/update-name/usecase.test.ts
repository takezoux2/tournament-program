import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { UpdateNamePort } from "./usecase";
import { updateName } from "./usecase";

const headers = new Headers();

describe("updateName", () => {
  it("name だけを body に入れ、headers をそのまま渡す", async () => {
    const port = vi.fn().mockResolvedValue({ status: true });

    const exit = await Effect.runPromiseExit(
      updateName(port, { name: "竹添太郎" }, headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ body: { name: "竹添太郎" }, headers });
  });

  it("port が投げた APIError を AuthError に写して伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SESSION_NOT_FRESH" } });
    const port: UpdateNamePort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      updateName(port, { name: "竹添太郎" }, headers),
    );

    expect(failureTag(exit)).toBe("SessionNotFresh");
  });
});
