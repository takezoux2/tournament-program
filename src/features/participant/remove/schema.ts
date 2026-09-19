import { z } from "zod";

export const removeParticipantSchema = z.object({
  participantId: z.string().min(1, "削除する参加者を選んでください"),
});

export type RemoveParticipantInput = z.infer<typeof removeParticipantSchema>;
