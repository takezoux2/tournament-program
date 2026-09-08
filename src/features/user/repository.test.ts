import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: { account: { findMany: (args: unknown) => findMany(args) } },
}));

const { findLinkedAccounts } = await import("./repository");

describe("findLinkedAccounts", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("userId を where に入れて引く（横断参照を防ぐ絞り込みそのもの）", async () => {
    findMany.mockResolvedValue([]);

    await findLinkedAccounts("u1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: {
        id: true,
        providerId: true,
        password: true,
        createdAt: true,
      },
    });
  });

  it("credential アカウントに password があれば hasPassword を true にする", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        providerId: "credential",
        password: "hashed",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

    const result = await findLinkedAccounts("u1");

    expect(result).toEqual({ hasPassword: true, google: null });
  });

  it("credential 行があっても password が空なら hasPassword は false", async () => {
    // setPassword は credential 行を作ってから password を埋める作りなので、
    // 行の存在だけを見ると「設定済み」と誤判定しうる。
    findMany.mockResolvedValue([
      {
        id: "a1",
        providerId: "credential",
        password: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

    const result = await findLinkedAccounts("u1");

    expect(result.hasPassword).toBe(false);
  });

  it("google の連携は accountId と連携日を返す", async () => {
    findMany.mockResolvedValue([
      {
        id: "a2",
        providerId: "google",
        password: null,
        createdAt: new Date("2026-09-02T00:00:00Z"),
      },
    ]);

    const result = await findLinkedAccounts("u1");

    expect(result).toEqual({
      hasPassword: false,
      google: {
        accountId: "a2",
        linkedAt: new Date("2026-09-02T00:00:00Z"),
      },
    });
  });

  it("パスワードのハッシュ自体は返さない", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        providerId: "credential",
        password: "hashed",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

    const result = await findLinkedAccounts("u1");

    expect(JSON.stringify(result)).not.toContain("hashed");
  });
});
