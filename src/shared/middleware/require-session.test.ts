import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
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

const { requireSession } = await import("./require-session");

describe("requireSession", () => {
  beforeEach(() => {
    getSession.mockReset();
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
});
