export type MatchTeam = {
  name: string;
  shortName: string;
};

export type Match = {
  id: string;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  homeScore: number;
  awayScore: number;
};

export type MatchMode = 'simulation' | 'api-live';

export type ScoreSource = 'simulation' | 'api-live-placeholder';

export type MatchProvider = 'manual' | 'api-football';

export type FollowedMatch = Match & {
  mode: MatchMode;
  scoreSource: ScoreSource;
  source: ScoreSource;
  provider: MatchProvider;
};
