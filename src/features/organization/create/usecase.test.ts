import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { SlugTaken } from "../errors";
import type { CreateOrganizationPort } from "./repository";
import { createOrganization } from "./usecase";

describe("createOrganization", () => {
  it("入力とオーナーの id を合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ slug: "tennis" }),
    ) as unknown as CreateOrganizationPort;

    const exit = await Effect.runPromiseExit(
      createOrganization(port, { name: "テニス部", slug: "tennis" }, "u1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      name: "テニス部",
      slug: "tennis",
      ownerUserId: "u1",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: CreateOrganizationPort = () =>
      Effect.fail(new SlugTaken({ slug: "tennis" }));

    const exit = await Effect.runPromiseExit(
      createOrganization(port, { name: "テニス部", slug: "tennis" }, "u1"),
    );

    expect(failureTag(exit)).toBe("SlugTaken");
  });
});
