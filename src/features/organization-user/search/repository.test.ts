import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const findFirst = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    user: { findFirst: (args: unknown) => findFirst(args) },
  },
}));

const { searchUserInDb } = await import("./repository");

const found = {
  id: "u1",
  name: "竹添",
  username: "takezo",
  email: "takezo@example.com",
  image: null,
  memberships: [],
};

describe("searchUserInDb", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("username と正規化した email の OR で引く", async () => {
    findFirst.mockResolvedValue(found);

    await Effect.runPromiseExit(
      searchUserInDb({ query: "TAKEZO@Example.com", organizationId: "o1" }),
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { username: "TAKEZO@Example.com" },
            { email: "takezo@example.com" },
          ],
        },
      }),
    );
  });

  it("所属の有無を alreadyMember に畳んで返す", async () => {
    findFirst.mockResolvedValue({ ...found, memberships: [{ userId: "u1" }] });

    const exit = await Effect.runPromiseExit(
      searchUserInDb({ query: "takezo", organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({
        id: "u1",
        name: "竹添",
        username: "takezo",
        email: "takezo@example.com",
        image: null,
        alreadyMember: true,
      });
    }
  });

  it("所属を数えるときも organizationId で絞る", async () => {
    // 絞りを外すと、他組織に所属しているだけで「所属済み」と誤判定する。
    findFirst.mockResolvedValue(found);

    await Effect.runPromiseExit(
      searchUserInDb({ query: "takezo", organizationId: "o1" }),
    );

    const args = findFirst.mock.calls[0][0] as {
      select: { memberships: { where: { organizationId: string } } };
    };
    expect(args.select.memberships.where).toEqual({ organizationId: "o1" });
  });

  it("見つからなければ UserNotFound を返す", async () => {
    findFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(
      searchUserInDb({ query: "takezo", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UserNotFound");
  });

  it("例外は握り潰さず UnexpectedOrganizationUserError の reason に残す", async () => {
    const cause = new Error("network");
    findFirst.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      searchUserInDb({ query: "takezo", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
