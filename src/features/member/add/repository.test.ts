import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const create = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    member: { create: (args: unknown) => create(args) },
  },
}));

const { addMemberInDb } = await import("./repository");

describe("addMemberInDb", () => {
  beforeEach(() => {
    create.mockReset();
  });

  it("organizationId 付きでメンバーを作る", async () => {
    create.mockResolvedValue({ id: "m1" });

    const exit = await Effect.runPromiseExit(
      addMemberInDb({
        name: "竹添",
        nameKana: "たけぞえ",
        organizationId: "o1",
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: { organizationId: "o1", name: "竹添", nameKana: "たけぞえ" },
      select: { id: true },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("例外は UnexpectedMemberError に写す", async () => {
    create.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      addMemberInDb({
        name: "竹添",
        nameKana: "たけぞえ",
        organizationId: "o1",
      }),
    );

    expect(failureTag(exit)).toBe("UnexpectedMemberError");
  });
});
