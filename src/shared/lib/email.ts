// signup と login の両方で使うため、どちらのスライスにも属さない shared に置く。
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();
