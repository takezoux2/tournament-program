/**
 * プロフィールのフォームが Server Action から受け取る状態。
 * handler（features）とフォーム（components）の両方が参照するため、
 * どちらからも依存できる features/user 直下に置く。
 *
 * organization の FormState と違って notice を持つのは、プロフィールの操作が
 * 遷移せずその場に留まるため。「保存しました」「確認メールを送信しました」を
 * 出す先がここしかない。
 */
export type ProfileFormState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_PROFILE_FORM_STATE: ProfileFormState = {
  error: null,
  notice: null,
};

/** useActionState に渡す Server Action の形。 */
export type ProfileFormAction = (
  state: ProfileFormState,
  formData: FormData,
) => Promise<ProfileFormState>;
