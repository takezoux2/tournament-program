export type DivisionFormState = {
  error: string | null;
};

export const INITIAL_DIVISION_FORM_STATE: DivisionFormState = {
  error: null,
};

export type DivisionFormAction = (
  state: DivisionFormState,
  formData: FormData,
) => Promise<DivisionFormState>;
