/**
 * 参加者のフォームが Server Action から受け取る状態。
 * handler（features）とフォーム（components）の両方が参照するため、
 * どちらからも依存できる features 直下に置く。
 */
export type ParticipantFormState = {
  error: string | null;
  /**
   * 選手番号の重複確認待ち。value は確認対象の入力値。クライアントは value を
   * confirmedNumber として再送し、同じ値のときだけ確定される。
   */
  confirm?: { message: string; value: string };
};

export const INITIAL_PARTICIPANT_FORM_STATE: ParticipantFormState = {
  error: null,
};

export type ParticipantFormAction = (
  state: ParticipantFormState,
  formData: FormData,
) => Promise<ParticipantFormState>;
