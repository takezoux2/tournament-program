import { Data } from "effect";

export class UnexpectedTournamentError extends Data.TaggedError(
  "UnexpectedTournamentError",
)<{
  readonly reason: unknown;
}> {}

/**
 * 大会には unique 制約による衝突がないため、固有のドメインエラーを持たない。
 * 種類が増えたらここに足し、messages.ts の Match.exhaustive がコンパイル時に
 * 文言の追加を要求する。
 */
export type TournamentError = UnexpectedTournamentError;

export const toTournamentError = (reason: unknown): TournamentError =>
  new UnexpectedTournamentError({ reason });
