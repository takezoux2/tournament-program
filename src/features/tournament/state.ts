export type TournamentFormState = {
  error: string | null;
};

export const INITIAL_TOURNAMENT_FORM_STATE: TournamentFormState = {
  error: null,
};

export type TournamentFormAction = (
  state: TournamentFormState,
  formData: FormData,
) => Promise<TournamentFormState>;
