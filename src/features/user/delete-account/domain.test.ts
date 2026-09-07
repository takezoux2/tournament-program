import { describe, expect, it } from "vitest";
import { soleGranterMessage } from "./domain";

describe("soleGranterMessage", () => {
  it("組織名を挙げ、何をすれば進めるかを書く", () => {
    expect(soleGranterMessage([{ name: "テニス部" }])).toBe(
      "テニス部 では、権限を配れるのがあなただけです。他の人に「権限の付与」を渡してから、再度お試しください",
    );
  });

  it("複数の組織は読点で並べる", () => {
    expect(soleGranterMessage([{ name: "テニス部" }, { name: "卓球部" }])).toBe(
      "テニス部、卓球部 では、権限を配れるのがあなただけです。他の人に「権限の付与」を渡してから、再度お試しください",
    );
  });
});
