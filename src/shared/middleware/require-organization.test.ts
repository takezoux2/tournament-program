import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const findFirst = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。同じ形を模す。
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { findFirst: (args: unknown) => findFirst(args) },
  },
}));

vi.mock("./require-session", () => ({
  requireSession: () => requireSession(),
}));

const { requireOrganization } = await import("./require-organization");

const session = { user: { id: "u1", name: "竹添" } };
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

describe("requireOrganization", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findFirst.mockReset();
    notFound.mockClear();
    requireSession.mockResolvedValue(session);
  });

  it("所属していれば組織とロールを返す", async () => {
    findFirst.mockResolvedValue({ role: "OWNER", organization });

    await expect(requireOrganization("tennis")).resolves.toEqual({
      session,
      organization,
      role: "OWNER",
    });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("所属していなければ notFound を呼ぶ", async () => {
    findFirst.mockResolvedValue(null);

    await expect(requireOrganization("tennis")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("ログインしていなければ requireSession の時点で打ち切られ、DB を引かない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(requireOrganization("tennis")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("slug と userId の両方を where に含めて引く", async () => {
    // 横断アクセス防止の回帰テスト。slug だけで引くと他人の組織が見える。
    findFirst.mockResolvedValue({ role: "MEMBER", organization });

    await requireOrganization("tennis");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization: { slug: "tennis" }, userId: "u1" },
      }),
    );
  });
});
