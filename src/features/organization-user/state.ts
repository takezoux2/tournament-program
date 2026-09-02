/**
 * 組織ユーザーのフォームが Server Action から受け取る状態。
 * handler（features）とフォーム（components）の両方が参照するため、
 * どちらからも依存できる features 直下に置く。
 */
export type OrganizationUserFormState = {
  error: string | null;
};

export const INITIAL_ORGANIZATION_USER_FORM_STATE: OrganizationUserFormState = {
  error: null,
};

export type OrganizationUserFormAction = (
  state: OrganizationUserFormState,
  formData: FormData,
) => Promise<OrganizationUserFormState>;

/** 追加前の確認表示に必要な、検索でヒットしたユーザーの情報。 */
export type FoundUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  image: string | null;
  /** 既にこの組織に所属しているか。追加ボタンの出し分けに使う。 */
  alreadyMember: boolean;
};

/**
 * 検索は「見つかったユーザー」を持ち回る必要があるため、
 * 追加・削除・権限編集とは別の状態にしている。
 */
export type UserSearchState = {
  error: string | null;
  user: FoundUser | null;
};

export const INITIAL_USER_SEARCH_STATE: UserSearchState = {
  error: null,
  user: null,
};

export type UserSearchAction = (
  state: UserSearchState,
  formData: FormData,
) => Promise<UserSearchState>;
