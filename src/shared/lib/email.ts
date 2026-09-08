// 複数の feature スライス（signup・login・password-reset など）が使うため、
// 特定のスライスに属させず shared に置く。
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();
