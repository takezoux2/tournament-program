/**
 * 組織のフォームが Server Action から受け取る状態。
 * handler（features）とフォーム（components）の両方が参照するため、
 * どちらからも依存できる features 直下に置く。
 */
export type OrganizationFormState = {
  error: string | null;
};

export const INITIAL_ORGANIZATION_FORM_STATE: OrganizationFormState = {
  error: null,
};
