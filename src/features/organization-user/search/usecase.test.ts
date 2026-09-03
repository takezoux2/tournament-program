import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UserNotFound } from "../errors";
import type { SearchUserPort } from "./repository";
import { searchUser } from "./usecase";

const found = {
  id: "u1",
  name: "竹添",
  username: "takezo",
  email: "takezo@example.com",
  image: null,
  alreadyMember: false,
};

describe("searchUser", () => {
  it("入力と組織 id を合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed(found),
    ) as unknown as SearchUserPort;

    const exit = await Effect.runPromiseExit(
      searchUser(port, { query: "takezo" }, "o1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      query: "takezo",
      organizationId: "o1",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: SearchUserPort = () =>
      Effect.fail(new UserNotFound({ query: "takezo" }));

    const exit = await Effect.runPromiseExit(
      searchUser(port, { query: "takezo" }, "o1"),
    );

    expect(failureTag(exit)).toBe("UserNotFound");
  });
});
