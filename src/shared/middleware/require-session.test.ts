import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getBypassSession = vi.fn();
const redirect = vi.fn((_path: string) => {
  // next/navigation の redirect は例外を投げて制御を打ち切る。同じ形を模す。
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: (args: unknown) => getSession(args) } },
}));

vi.mock("@/shared/lib/auth-bypass-session", () => ({
  getBypassSession: () => getBypassSession(),
}));

const { requireSession } = await import("./require-session");

describe("requireSession", () => {
  beforeEach(() => {
    getSession.mockReset();
    getBypassSession.mockReset();
    // 既定はバイパス無効相当（getBypassSession が null を返す）。
    getBypassSession.mockResolvedValue(null);
    redirect.mockClear();
  });

  it("セッションがあればそれを返す", async () => {
    const session = { user: { id: "u1", name: "竹添" } };
    getSession.mockResolvedValue(session);
    await expect(requireSession()).resolves.toBe(session);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("セッションが無ければ /login にリダイレクトする", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("バイパスセッションがあれば通常認証を待たずにそれを返す", async () => {
    const bypassed = { session: { userId: "u9" }, user: { id: "u9" } };
    getBypassSession.mockResolvedValue(bypassed);
    // 通常認証が失敗する状況でもバイパスが優先される。
    getSession.mockRejectedValue(new Error("DB down"));

    await expect(requireSession()).resolves.toBe(bypassed);
    expect(getSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("バイパスセッションが無ければ通常認証にフォールバックする", async () => {
    const session = { user: { id: "u1", name: "竹添" } };
    getBypassSession.mockResolvedValue(null);
    getSession.mockResolvedValue(session);

    await expect(requireSession()).resolves.toBe(session);
    expect(getSession).toHaveBeenCalled();
  });

  it("バイパスセッションも通常セッションも無ければ /login にリダイレクトする", async () => {
    getBypassSession.mockResolvedValue(null);
    getSession.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
