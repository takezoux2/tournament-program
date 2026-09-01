import { z } from "zod";
import { divisionFormatSchema, divisionNameSchema } from "../schema-parts";

export const createDivisionSchema = z.object({
  name: divisionNameSchema,
  format: divisionFormatSchema,
});

export type CreateDivisionInput = z.infer<typeof createDivisionSchema>;
