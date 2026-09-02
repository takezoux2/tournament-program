import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const create = vi.fn();
const findManyPermission = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organization: { create: (args: unknown) => create(args) },
    permission: { findMany: (args: unknown) => findManyPermission(args) },
  },
}));

const { createOrganizationInDb } = await import("./repository");

/** P2002（unique 制約違反）を模した Prisma のエラーを作る。errors.test.ts と同じ組み立て方。 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
  });

const input = {
  name: "テニス部",
  slug: "tennis",
  ownerUserId: "u1",
};

describe("createOrganizationInDb", () => {
  beforeEach(() => {
    create.mockReset();
    findManyPermission.mockReset();
    findManyPermission.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  });

  it("組織・所属行・全権限を 1 回の nested write でまとめて作る（原子性の回帰テスト）", async () => {
    // create が複数回に分かれる実装へ後退すると、権限だけ入らずに
    // 誰も操作できない組織が残り得る。
    create.mockResolvedValue({ slug: "tennis" });

    const exit = await Effect.runPromiseExit(createOrganizationInDb(input));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "テニス部",
          slug: "tennis",
          users: {
            create: {
              userId: "u1",
              permissions: {
                create: [{ permissionId: 1 }, { permissionId: 2 }],
              },
            },
          },
        },
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ slug: "tennis" });
    }
  });

  it("Permission が 1 件も無ければ権限を付けずに作る（シード漏れでも組織作成は落とさない）", async () => {
    findManyPermission.mockResolvedValue([]);
    create.mockResolvedValue({ slug: "tennis" });

    await Effect.runPromiseExit(createOrganizationInDb(input));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          users: {
            create: { userId: "u1", permissions: { create: [] } },
          },
        }),
      }),
    );
  });

  it("P2002 は SlugTaken に写像し、試みたスラッグを保持する", async () => {
    create.mockRejectedValue(uniqueViolation());

    const exit = await Effect.runPromiseExit(createOrganizationInDb(input));

    expect(failureTag(exit)).toBe("SlugTaken");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ slug: "tennis" });
    }
  });

  it("P2002 以外の例外は握り潰さず UnexpectedOrganizationError の reason に残す", async () => {
    const cause = new Error("network");
    create.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(createOrganizationInDb(input));

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
