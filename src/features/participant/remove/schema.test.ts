import { describe, expect, it } from "vitest";
import { removeParticipantSchema } from "./schema";

describe("removeParticipantSchema", () => {
  it("participantId を要求する", () => {
    expect(
      removeParticipantSchema.safeParse({ participantId: "p1" }).success,
    ).toBe(true);
  });

  it("空の participantId は弾く", () => {
    const result = removeParticipantSchema.safeParse({ participantId: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "削除する参加者を選んでください",
    );
  });
});
