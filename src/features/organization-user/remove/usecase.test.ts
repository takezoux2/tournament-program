import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedOrganizationUserError } from "../errors";
import type { CountGrantHoldersPort, RemoveUserPort } from "./repository";
import { removeUser } from "./usecase";

const countGrantHolders =
  (result: { targetHolds: boolean; otherHolders: number }) => () =>
    Effect.succeed(result);

describe("removeUser", () => {
  it("入力と組織 id を合わせて port に渡す", async () => {
    const remove = vi.fn(() =>
      Effect.succeed({ removed: 1 }),
    ) as unknown as RemoveUserPort;

    const exit = await Effect.runPromiseExit(
      removeUser(
        {
          countGrantHolders: countGrantHolders({
            targetHolds: false,
            otherHolders: 1,
          }),
          remove,
        },
        { userId: "u1" },
        "o1",
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(remove).toHaveBeenCalledWith({ userId: "u1", organizationId: "o1" });
  });

  it("port の失敗をそのまま伝える", async () => {
    const remove: RemoveUserPort = () =>
      Effect.fail(new UnexpectedOrganizationUserError({ reason: "boom" }));

    const exit = await Effect.runPromiseExit(
      removeUser(
        {
          countGrantHolders: countGrantHolders({
            targetHolds: false,
            otherHolders: 1,
          }),
          remove,
        },
        { userId: "u1" },
        "o1",
      ),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });

  it("対象が最後の user.grant 保持者なら LastGrantHolder で拒否し、削除しない", async () => {
    // 消せてしまうと権限行を書ける人が居なくなり、UI からは復旧できない。
    const remove = vi.fn(() =>
      Effect.succeed({ removed: 1 }),
    ) as unknown as RemoveUserPort;

    const exit = await Effect.runPromiseExit(
      removeUser(
        {
          countGrantHolders: countGrantHolders({
            targetHolds: true,
            otherHolders: 0,
          }),
          remove,
        },
        { userId: "u1" },
        "o1",
      ),
    );

    expect(failureTag(exit)).toBe("LastGrantHolder");
    expect(remove).not.toHaveBeenCalled();
  });

  it("他に user.grant 保持者が居れば削除できる", async () => {
    const remove = vi.fn(() =>
      Effect.succeed({ removed: 1 }),
    ) as unknown as RemoveUserPort;

    const exit = await Effect.runPromiseExit(
      removeUser(
        {
          countGrantHolders: countGrantHolders({
            targetHolds: true,
            otherHolders: 1,
          }),
          remove,
        },
        { userId: "u1" },
        "o1",
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("user.grant を持たない相手には保護が働かない（保持者が 0 人でも消せる）", async () => {
    const remove = vi.fn(() =>
      Effect.succeed({ removed: 1 }),
    ) as unknown as RemoveUserPort;

    const exit = await Effect.runPromiseExit(
      removeUser(
        {
          countGrantHolders: countGrantHolders({
            targetHolds: false,
            otherHolders: 0,
          }),
          remove,
        },
        { userId: "u1" },
        "o1",
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("保持者の問い合わせが失敗したら削除に進まない", async () => {
    const remove = vi.fn(() =>
      Effect.succeed({ removed: 1 }),
    ) as unknown as RemoveUserPort;
    const countGrantHoldersFails: CountGrantHoldersPort = () =>
      Effect.fail(new UnexpectedOrganizationUserError({ reason: "boom" }));

    const exit = await Effect.runPromiseExit(
      removeUser(
        { countGrantHolders: countGrantHoldersFails, remove },
        { userId: "u1" },
        "o1",
      ),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
    expect(remove).not.toHaveBeenCalled();
  });
});
