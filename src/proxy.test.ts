// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionCookie = vi.fn();

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: (request: unknown) => getSessionCookie(request),
}));

const { proxy } = await import("./proxy");

const originalBypassAuth = process.env.BYPASS_AUTH;

const requestFor = (path: string, cookies: Record<string, string> = {}) => {
  const request = new NextRequest(`http://localhost:3000${path}`);
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
};

beforeEach(() => {
  getSessionCookie.mockReset();
  getSessionCookie.mockReturnValue(null);
});

afterEach(() => {
  if (originalBypassAuth === undefined) {
    delete process.env.BYPASS_AUTH;
  } else {
    process.env.BYPASS_AUTH = originalBypassAuth;
  }
});

describe("proxy", () => {
  it("セッション Cookie があれば通す", () => {
    delete process.env.BYPASS_AUTH;
    getSessionCookie.mockReturnValue("token");

    const response = proxy(requestFor("/"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("セッション Cookie が無ければ /login へリダイレクトする", () => {
    delete process.env.BYPASS_AUTH;

    const response = proxy(requestFor("/tournaments?page=2"));
    const location = new URL(response.headers.get("location") as string);

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/tournaments?page=2");
  });

  it("バイパス無効なら USER_ID Cookie だけでは通さない", () => {
    delete process.env.BYPASS_AUTH;

    const response = proxy(requestFor("/", { USER_ID: "user-1" }));
    const location = new URL(response.headers.get("location") as string);

    expect(location.pathname).toBe("/login");
  });

  it("バイパス有効かつ USER_ID Cookie があれば通す", () => {
    process.env.BYPASS_AUTH = "1";

    const response = proxy(requestFor("/", { USER_ID: "user-1" }));

    expect(response.headers.get("location")).toBeNull();
  });

  it("バイパス有効でも USER_ID Cookie が無ければ /login へリダイレクトする", () => {
    process.env.BYPASS_AUTH = "1";

    const response = proxy(requestFor("/"));
    const location = new URL(response.headers.get("location") as string);

    expect(location.pathname).toBe("/login");
  });
});
