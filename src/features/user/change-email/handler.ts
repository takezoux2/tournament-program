"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { buildEmailChangeNoticeEmail } from "@/shared/lib/auth-email-change-email";
import { getMailer, resolveMailFrom } from "@/shared/lib/mail";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { changeEmailSchema } from "./schema";
import { changeEmail } from "./usecase";

/**
 * 新アドレスが既に他の人のものでも Better Auth は成功を返す
 * （アカウント列挙対策）。そのため、この文言は成否の区別に使えない。
 * 登録画面が requireEmailVerification のもとで取っているのと同じ扱い。
 */
const SENT_NOTICE =
  "確認メールを送信しました。新しいアドレスのリンクを開くと変更が完了します";

export const changeEmailAction = async (
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  const session = await requireSession();

  const parsed = changeEmailSchema.safeParse({
    newEmail: String(formData.get("newEmail") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, notice: null };
  }

  // Better Auth は同じアドレスへの変更をコード無しの 400 で拒む。
  // 写像すると「処理に失敗しました」になってしまうので手前で畳む。
  if (parsed.data.newEmail === session.user.email) {
    return {
      error: "現在と違うメールアドレスを入力してください",
      notice: null,
    };
  }

  const exit = await Effect.runPromiseExit(
    changeEmail(
      (input) => auth.api.changeEmail(input),
      parsed.data,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // 変更前のアドレスへ通知する。セッションを奪われた場合に本人が気づける
  // ようにするためで、確認メール（新アドレス宛）は Better Auth が送っている。
  //
  // 送信の失敗で操作全体を失敗にはしない。確認メールは既に出ており、
  // ここで「失敗しました」と出すと、実際には進んでいる操作を再試行させる。
  try {
    await getMailer().send(
      buildEmailChangeNoticeEmail({
        from: resolveMailFrom(process.env),
        to: { email: session.user.email, name: session.user.name },
        newEmail: parsed.data.newEmail,
      }),
    );
  } catch (reason) {
    console.error(
      "メールアドレス変更の通知メールを送信できませんでした",
      reason,
    );
  }

  return { error: null, notice: SENT_NOTICE };
};
