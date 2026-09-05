export type DivisionFormState = {
  error: string | null;
  /**
   * 成功時の補足。削除にともなう組み合わせの再生成などを画面に伝える。
   * 既存 4 スライスは返さないので省略可能にしてある。
   */
  notice?: string;
  /**
   * 重複確認待ち。value は確認対象の入力値。クライアントは value を
   * confirmedNumber として再送し、同じ値のときだけ確定される。
   */
  confirm?: { message: string; value: string };
};

export const INITIAL_DIVISION_FORM_STATE: DivisionFormState = {
  error: null,
};

export type DivisionFormAction = (
  state: DivisionFormState,
  formData: FormData,
) => Promise<DivisionFormState>;
