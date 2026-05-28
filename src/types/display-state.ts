import type { MatchTeam } from './match.js';

export type DisplayMode =
  | 'PRE_MATCH'
  | 'MATCH_LIVE'
  | 'HAPPY_HOUR'
  | 'HALF_TIME'
  | 'FULL_TIME'
  | 'FULLSCREEN_MESSAGE'
  | 'IDLE';

export type MatchStatus =
  | 'NOT_STARTED'
  | 'FIRST_HALF'
  | 'HALF_TIME'
  | 'SECOND_HALF'
  | 'FINISHED';

export type DisplayMatchInfo = {
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  homeScore: number;
  awayScore: number;
  matchTitle: string;
  matchDescription: string;
};

export type DrinkMenuItem = {
  id: string;
  name: string;
  price: number;
  happyHourPrice: number;
  currency: 'EUR';
};

export type MenuData = {
  happyHourDiscountRate: number;
  drinks: DrinkMenuItem[];
};

export type SpotifyPlaceholder = {
  title: string;
  artist: string;
  albumArtUrl: string | null;
  isPlaying: boolean;
};

export type DisplayStateV2 = {
  displayMode: DisplayMode;
  matchStatus: MatchStatus;
  happyHourActive: boolean;
  remainingSeconds: number;
  matchInfo: DisplayMatchInfo;
  bannerMessage: string;
  fullscreenMessage: string;
  drinks: DrinkMenuItem[];
  menu: MenuData;
  spotify: SpotifyPlaceholder;
};
