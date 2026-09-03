/**
 * 自分自身からは外せない権限。
 *
 * `user.grant` を外すと、以後 誰も権限行を書き戻せなくなる。
 * `user.view` を外すと、権限編集画面のパンくず・キャンセル・保存後の
 * リダイレクト先である `/orgs/[slug]/users` が 404 になり、
 * URL を打ち直す以外に戻る手段が無くなる。
 */
export const SELF_LOCKED_CODES = ["user.view", "user.grant"] as const;

/** 画面と Server Action で同じ文言を出すため、ここに 1 つだけ持つ。 */
export const SELF_LOCKED_MESSAGE =
  "自分自身からは「ユーザーの閲覧」と「権限の付与・剥奪」の権限を外せません";

/**
 * 自分の編集で、今 持っている自己ロック対象のうち外そうとしているものを返す。
 * 元々持っていないコードは対象外にする（外しようがないし、
 * 持っていない権限を持てと言われても保存できない）。
 */
export const strippedSelfLockedCodes = (
  heldCodes: readonly string[],
  submittedCodes: readonly string[],
): string[] =>
  SELF_LOCKED_CODES.filter(
    (code) => heldCodes.includes(code) && !submittedCodes.includes(code),
  );
