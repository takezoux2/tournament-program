import { beforeEach, describe, expect, it, vi } from "vitest";
import { canByCode } from "@/shared/authz/ability";

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

const { requireOrganization, requirePermission } = await import(
  "./require-organization"
);

const session = { user: { id: "u1", name: "竹添" } };
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

/** findFirst が返す所属行を、権限コードの配列から組み立てる。 */
const membershipWith = (codes: string[]) => ({
  organization,
  permissions: codes.map((code) => ({ permission: { code } })),
});

describe("requireOrganization", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findFirst.mockReset();
    notFound.mockClear();
    requireSession.mockResolvedValue(session);
  });

  it("所属していれば組織と権限コードを返す", async () => {
    findFirst.mockResolvedValue(membershipWith(["user.view", "user.add"]));

    const result = await requireOrganization("tennis");

    expect(result.session).toBe(session);
    expect(result.organization).toEqual(organization);
    expect(result.permissionCodes).toEqual(["user.view", "user.add"]);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("保有する権限だけを許可する ability を返す", async () => {
    findFirst.mockResolvedValue(membershipWith(["user.view"]));

    const { ability } = await requireOrganization("tennis");

    expect(canByCode(ability, "user.view")).toBe(true);
    expect(canByCode(ability, "user.remove")).toBe(false);
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
    findFirst.mockResolvedValue(membershipWith([]));

    await requireOrganization("tennis");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization: { slug: "tennis" }, userId: "u1" },
      }),
    );
  });
});

describe("requirePermission", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findFirst.mockReset();
    notFound.mockClear();
    requireSession.mockResolvedValue(session);
  });

  it("権限を持っていれば requireOrganization と同じ結果を返す", async () => {
    findFirst.mockResolvedValue(membershipWith(["user.view"]));

    const result = await requirePermission("tennis", "user.view");

    expect(result.organization).toEqual(organization);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("権限を持っていなければ notFound を呼ぶ（403 ではなく 404）", async () => {
    findFirst.mockResolvedValue(membershipWith(["user.view"]));

    await expect(requirePermission("tennis", "user.remove")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("所属していなければ権限判定に入る前に notFound を呼ぶ", async () => {
    findFirst.mockResolvedValue(null);

    await expect(requirePermission("tennis", "user.view")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
