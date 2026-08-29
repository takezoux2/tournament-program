import { afterEach, describe, expect, it } from "vitest";
import type { UserModel } from "@/generated/prisma/models";
import {
  BYPASS_USER_ID_COOKIE,
  buildBypassSession,
  isAuthBypassEnabled,
} from "./auth-bypass";

const originalBypassAuth = process.env.BYPASS_AUTH;

afterEach(() => {
  if (originalBypassAuth === undefined) {
    delete process.env.BYPASS_AUTH;
  } else {
    process.env.BYPASS_AUTH = originalBypassAuth;
  }
});

describe("BYPASS_USER_ID_COOKIE", () => {
  it("Cookie 名は USER_ID", () => {
    expect(BYPASS_USER_ID_COOKIE).toBe("USER_ID");
  });
});

describe("isAuthBypassEnabled", () => {
  it('BYPASS_AUTH が "1" のときだけ有効', () => {
    process.env.BYPASS_AUTH = "1";
    expect(isAuthBypassEnabled()).toBe(true);
  });

  it("未設定なら無効", () => {
    delete process.env.BYPASS_AUTH;
    expect(isAuthBypassEnabled()).toBe(false);
  });

  it('"1" 以外では有効にしない（"true" や "0" で誤って開かないため）', () => {
    for (const value of ["0", "true", "", "01"]) {
      process.env.BYPASS_AUTH = value;
      expect(isAuthBypassEnabled()).toBe(false);
    }
  });
});

describe("buildBypassSession", () => {
  const user: UserModel = {
    id: "user-1",
    email: "taro@example.com",
    name: "山田太郎",
    emailVerified: true,
    image: null,
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
    updatedAt: new Date("2025-12-02T00:00:00.000Z"),
  };
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("User 行と現在時刻から auth.api.getSession() 互換の形を組み立てる", () => {
    const built = buildBypassSession(user, now);

    expect(built.user).toEqual({
      id: "user-1",
      email: "taro@example.com",
      name: "山田太郎",
      emailVerified: true,
      image: null,
      createdAt: new Date("2025-12-01T00:00:00.000Z"),
      updatedAt: new Date("2025-12-02T00:00:00.000Z"),
    });
    expect(built.session).toEqual({
      id: "bypass-user-1",
      token: "bypass-user-1",
      userId: "user-1",
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    });
  });

  it("有効期限は渡した時刻の 24 時間後（内部で new Date() を呼ばない）", () => {
    const other = new Date("2030-06-15T09:30:00.000Z");
    expect(buildBypassSession(user, other).session.expiresAt).toEqual(
      new Date("2030-06-16T09:30:00.000Z"),
    );
  });
});
