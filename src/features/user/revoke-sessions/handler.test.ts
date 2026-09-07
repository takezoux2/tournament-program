import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const revokeOtherSessions = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: {
    api: {
      revokeOtherSessions: (input: unknown) => revokeOtherSessions(input),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { revokeOtherSessionsAction } = await import("./handler");

describe("revokeOtherSessionsAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    revokeOtherSessions.mockReset();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    revokeOtherSessions.mockResolvedValue({ status: true });
  });

  it("未ログインなら requireSession の時点で打ち切られ、破棄に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      revokeOtherSessionsAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revokeOtherSessions).not.toHaveBeenCalled();
  });

  it("headers だけを渡す（対象はセッションが決める）", async () => {
    await revokeOtherSessionsAction(INITIAL_PROFILE_FORM_STATE, new FormData());

    expect(revokeOtherSessions).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
  });

  it("成功したら、今の端末は残ることが分かる notice を返す", async () => {
    const result = await revokeOtherSessionsAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result).toEqual({
      error: null,
      notice: "この端末以外のログインを解除しました",
    });
  });

  it("失敗は文言に写して返す", async () => {
    revokeOtherSessions.mockRejectedValue(new Error("network"));

    const result = await revokeOtherSessionsAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
