import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { AlreadyMember } from "../errors";
import type { AddUserPort } from "./repository";
import { addUser } from "./usecase";

describe("addUser", () => {
  it("入力と組織 id、追加者の権限コードを合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed(undefined),
    ) as unknown as AddUserPort;

    const exit = await Effect.runPromiseExit(
      addUser(port, { userId: "u1" }, "o1", ["user.view", "user.add"]),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      userId: "u1",
      organizationId: "o1",
      granterCodes: ["user.view", "user.add"],
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: AddUserPort = () =>
      Effect.fail(new AlreadyMember({ userId: "u1" }));

    const exit = await Effect.runPromiseExit(
      addUser(port, { userId: "u1" }, "o1", ["user.add"]),
    );

    expect(failureTag(exit)).toBe("AlreadyMember");
  });
});
