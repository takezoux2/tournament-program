import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requirePermission = vi.fn();
const findOrganizationUser = vi.fn();
const listAllPermissions = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("@/features/organization-user/repository", () => ({
  findOrganizationUser: (organizationId: string, userId: string) =>
    findOrganizationUser(organizationId, userId),
  listAllPermissions: () => listAllPermissions(),
}));

vi.mock("@/features/organization-user/grant/handler", () => ({
  grantPermissionsAction: vi.fn(),
}));

const { default: PermissionsPage } = await import("./page");

const pageProps = (slug: string, userId: string) => ({
  params: Promise.resolve({ slug, userId }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "me", name: "竹添" } };
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const target = {
  userId: "u2",
  name: "山田",
  username: "yamada",
  email: "yamada@example.com",
  image: null,
  permissionCodes: ["user.view"],
  joinedAt: new Date("2026-08-01T00:00:00Z"),
};

describe("PermissionsPage", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    findOrganizationUser.mockReset();
    listAllPermissions.mockReset();
    notFound.mockClear();
    requirePermission.mockResolvedValue({
      session,
      organization,
      permissionCodes: [...PERMISSION_CODES],
      ability: defineAbilityFor(PERMISSION_CODES),
    });
    findOrganizationUser.mockResolvedValue(target);
    listAllPermissions.mockResolvedValue([
      { id: 1, code: "user.view", description: "組織ユーザーの閲覧" },
    ]);
  });

  it("user.grant を要求する", async () => {
    await PermissionsPage(pageProps("tennis", "u2"));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "user.grant");
  });

  it("対象ユーザーは URL の slug ではなく organization.id で絞り込む", async () => {
    await PermissionsPage(pageProps("tennis", "u2"));

    expect(findOrganizationUser).toHaveBeenCalledWith("o1", "u2");
  });

  it("対象が所属していなければ notFound を呼ぶ", async () => {
    findOrganizationUser.mockResolvedValue(null);

    await expect(PermissionsPage(pageProps("tennis", "u2"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("権限が無ければ(notFound)対象の取得を行わない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(PermissionsPage(pageProps("tennis", "u2"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(findOrganizationUser).not.toHaveBeenCalled();
  });

  it("対象ユーザーと権限マスタを描画する", async () => {
    const element = await PermissionsPage(pageProps("tennis", "u2"));
    render(element);

    // パンくずにも target.name（山田）が入るため、フォーム側の <p> に絞って探す。
    expect(screen.getByText("山田", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText(/組織ユーザーの閲覧/)).toBeChecked();
  });

  it("自分自身のページでは isSelf として扱う（user.grant を無効化する）", async () => {
    findOrganizationUser.mockResolvedValue({
      ...target,
      userId: "me",
      name: "竹添",
      permissionCodes: ["user.grant"],
    });
    listAllPermissions.mockResolvedValue([
      {
        id: 2,
        code: "user.grant",
        description: "組織ユーザーへの権限付与・剥奪",
      },
    ]);

    const element = await PermissionsPage(pageProps("tennis", "me"));
    render(element);

    expect(
      screen.getByLabelText(/組織ユーザーへの権限付与・剥奪/),
    ).toBeDisabled();
  });
});
