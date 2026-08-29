import { Match } from "effect";
import type { TournamentError } from "./errors";

export const tournamentErrorMessage: (error: TournamentError) => string =
  Match.type<TournamentError>().pipe(
    Match.tag(
      "UnexpectedTournamentError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
