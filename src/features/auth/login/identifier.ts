import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";
import { normalizeUsername, usernameSchema } from "@/shared/lib/username";

/** ログイン識別子。メールアドレスかユーザー名のどちらか。 */
export type LoginIdentifier =
  | { readonly kind: "email"; readonly email: string }
  | { readonly kind: "username"; readonly username: string };

/** メールアドレスと見なす目印。usernameSchema はこの文字を許さない。 */
const EMAIL_MARKER = "@";

/**
 * 識別子をメールアドレスとユーザー名に振り分ける。純粋関数。
 *
 * 判別を "@" の有無だけに絞れるのは、usernameSchema が "@" を許さないため。
 * 「メール形式として妥当か」で振り分けると、打ち間違えたメールアドレスが
 * ユーザー名として扱われ、形式エラーではなく資格情報の誤りとして返ってしまう。
 *
 * 正規化はどちらも小文字化だが、規則の持ち主が違う（email.ts と username.ts）ので
 * それぞれの関数を通す。
 */
export const classifyLoginIdentifier = (value: string): LoginIdentifier =>
  value.includes(EMAIL_MARKER)
    ? { kind: "email", email: normalizeEmail(value) }
    : { kind: "username", username: normalizeUsername(value) };

const emailIdentifierSchema = z.object({
  kind: z.literal("email"),
  email: z.email("メールアドレスの形式が正しくありません"),
});

const usernameIdentifierSchema = z.object({
  kind: z.literal("username"),
  // signup と同じ規則を通すので、文言も signup と揃う。
  username: usernameSchema,
});

/**
 * 識別子 1 つを LoginIdentifier に写す。
 *
 * 先に振り分けてから種別ごとに検証するので、エラー文言も種別ごとのものが出る
 * （union で受けると「どちらにも当てはまらない」形の分かりにくい文言になる）。
 */
export const loginIdentifierSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(z.string().min(1, "ユーザー名またはメールアドレスを入力してください"))
  .transform(classifyLoginIdentifier)
  .pipe(
    z.discriminatedUnion("kind", [
      emailIdentifierSchema,
      usernameIdentifierSchema,
    ]),
  );
