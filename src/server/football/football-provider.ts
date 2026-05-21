import type { MatchProvider, MatchTeam } from '../../types/match.js';

export type FranceMatchCandidate = {
  id: string;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  homeScore: number;
  awayScore: number;
  status: string;
  kickoffAt?: string;
  source: MatchProvider;
  provider: MatchProvider;
};

export interface FootballProvider {
  getFranceMatches(): Promise<FranceMatchCandidate[]>;
}
