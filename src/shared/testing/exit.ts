import { Exit } from "effect";

/**
 * Exit から失敗値のタグを取り出す。成功していた場合はテストを落とす。
 * Effect を返す関数の分岐を検証するテストで使う。
 */
export const failureTag = <A, E extends { _tag: string }>(
  exit: Exit.Exit<A, E>,
): string => {
  if (Exit.isSuccess(exit)) {
    throw new Error("失敗を期待したが成功した");
  }
  const cause = exit.cause;
  if (cause._tag !== "Fail") {
    throw new Error(`Fail を期待したが ${cause._tag} だった`);
  }
  return cause.error._tag;
};
