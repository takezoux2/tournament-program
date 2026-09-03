import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserModel } from "@/generated/prisma/models";

const cookieGet = vi.fn<(name: string) => { value: string } | undefined>();
const findUnique = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: cookieGet }),
}));

vi.mock("@/shared/db/prisma", () => ({
  prisma: { user: { findUnique: (args: unknown) => findUnique(args) } },
}));

const { getBypassSession } = await import("./auth-bypass-session");

const user: UserModel = {
  id: "user-1",
  email: "taro@example.com",
  username: "taro",
  name: "山田太郎",
  emailVerified: true,
  image: null,
  createdAt: new Date("2025-12-01T00:00:00.000Z"),
  updatedAt: new Date("2025-12-02T00:00:00.000Z"),
};

const originalBypassAuth = process.env.BYPASS_AUTH;

beforeEach(() => {
  cookieGet.mockReset();
  findUnique.mockReset();
});

afterEach(() => {
  if (originalBypassAuth === undefined) {
    delete process.env.BYPASS_AUTH;
  } else {
    process.env.BYPASS_AUTH = originalBypassAuth;
  }
});

describe("getBypassSession", () => {
  it("BYPASS_AUTH が無効なら Cookie も DB も見ずに null", async () => {
    delete process.env.BYPASS_AUTH;
    cookieGet.mockReturnValue({ value: "user-1" });

    await expect(getBypassSession()).resolves.toBeNull();
    expect(cookieGet).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("有効でも USER_ID Cookie が無ければ null", async () => {
    process.env.BYPASS_AUTH = "1";
    cookieGet.mockReturnValue(undefined);

    await expect(getBypassSession()).resolves.toBeNull();
    expect(cookieGet).toHaveBeenCalledWith("USER_ID");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("Cookie の User.id が DB に無ければ null", async () => {
    process.env.BYPASS_AUTH = "1";
    cookieGet.mockReturnValue({ value: "missing" });
    findUnique.mockResolvedValue(null);

    await expect(getBypassSession()).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "missing" } });
  });

  it("Cookie の User.id が見つかればそのユーザーのセッションを返す", async () => {
    process.env.BYPASS_AUTH = "1";
    cookieGet.mockReturnValue({ value: "user-1" });
    findUnique.mockResolvedValue(user);

    const session = await getBypassSession();

    expect(session?.user.id).toBe("user-1");
    expect(session?.user.name).toBe("山田太郎");
    expect(session?.session.userId).toBe("user-1");
    expect(session?.session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
