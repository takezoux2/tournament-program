export type ScheduleFormState = {
  error: string | null;
};

export const INITIAL_SCHEDULE_FORM_STATE: ScheduleFormState = {
  error: null,
};

export type ScheduleFormAction = (
  state: ScheduleFormState,
  formData: FormData,
) => Promise<ScheduleFormState>;
