import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const create = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organization: { create: (args: unknown) => create(args) },
  },
}));

const { createOrganizationInDb } = await import("./repository");

/** P2002（unique 制約違反）を模した Prisma のエラーを作る。errors.test.ts と同じ組み立て方。 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
  });

describe("createOrganizationInDb", () => {
  beforeEach(() => {
    create.mockReset();
  });

  it("組織と OWNER 所属行を 1 回の nested write でまとめて作る（原子性の回帰テスト）", async () => {
    // create が 2 回呼ばれる実装（組織作成→所属作成を別クエリに分ける）に
    // 後退すると、片方だけ成功して誰にも見えない組織が残り得る。
    create.mockResolvedValue({ slug: "tennis" });

    const exit = await Effect.runPromiseExit(
      createOrganizationInDb({
        name: "テニス部",
        slug: "tennis",
        ownerUserId: "u1",
      }),
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "テニス部",
          slug: "tennis",
          users: { create: { userId: "u1", role: "OWNER" } },
        },
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ slug: "tennis" });
    }
  });

  it("P2002 は SlugTaken に写像し、試みたスラッグを保持する", async () => {
    create.mockRejectedValue(uniqueViolation());

    const exit = await Effect.runPromiseExit(
      createOrganizationInDb({
        name: "テニス部",
        slug: "tennis",
        ownerUserId: "u1",
      }),
    );

    expect(failureTag(exit)).toBe("SlugTaken");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ slug: "tennis" });
    }
  });

  it("P2002 以外の例外は握り潰さず UnexpectedOrganizationError の reason に残す", async () => {
    const cause = new Error("network");
    create.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      createOrganizationInDb({
        name: "テニス部",
        slug: "tennis",
        ownerUserId: "u1",
      }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
