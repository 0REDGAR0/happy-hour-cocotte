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
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number;
  awayScore: number;
  matchTitle: string;
  matchDescription: string;
  kickoffAt: string | null;
};

export type DrinkMenuItem = {
  id: string;
  name: string;
  originalPrice: number;
  price: number;
  happyHourPrice: number;
  icon: string;
  currency: 'EUR';
  active: boolean;
};

export type MenuData = {
  happyHourDiscountRate: number;
  drinks: DrinkMenuItem[];
};

export type SpotifyPlaceholder = {
  status: 'connected' | 'not_configured' | 'error' | 'no_playback';
  title: string;
  artist: string;
  albumArtUrl: string | null;
  isPlaying: boolean;
  progressMs: number | null;
  durationMs: number | null;
  deviceName: string | null;
};

export type ProgramItem = {
  id: string;
  icon: string;
  text: string;
  active: boolean;
  sortOrder: number;
};

export type LivelyMessage = {
  id: string;
  text: string;
  active: boolean;
  sortOrder: number;
};

export type EventBanner = {
  id: string;
  text: string;
  active: boolean;
  sortOrder: number;
};

export type PreMatchState = {
  enabled: boolean;
  kickoffAt: string;
  programMessages: string[];
  programItems: ProgramItem[];
  homeFlag: string;
  awayFlag: string;
};

export type DisplayStateV2 = {
  displayMode: DisplayMode;
  matchStatus: MatchStatus;
  happyHourActive: boolean;
  happyHourDurationSeconds: number;
  remainingSeconds: number;
  happyHourEndsAt: string | null;
  preMatch: PreMatchState;
  matchInfo: DisplayMatchInfo;
  bannerMessage: string;
  fullscreenMessage: string;
  eventBanners: EventBanner[];
  livelyMessages: LivelyMessage[];
  drinks: DrinkMenuItem[];
  menu: MenuData;
  spotify: SpotifyPlaceholder;
};
