import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { DrinkMenuItem, EventBanner, LivelyMessage, ProgramItem } from '../../types/display-state.js';
import type { MatchMode, MatchProvider, MatchTeam, ScoreSource } from '../../types/match.js';

export type PersistedPreMatchConfig = {
  enabled: boolean;
  kickoffAt: string;
  homeFlag: string;
  awayFlag: string;
};

export type PersistedMatchInfo = {
  selectedMatchId: string;
  matchStarted: boolean;
  matchMode: MatchMode;
  scoreSource: ScoreSource;
  source: ScoreSource;
  provider: MatchProvider;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  homeScore: number;
  awayScore: number;
};

type PersistentContent = {
  version: 1;
  drinks: DrinkMenuItem[];
  programItems: ProgramItem[];
  eventBanners: EventBanner[];
  livelyMessages: LivelyMessage[];
  preMatch: PersistedPreMatchConfig;
  match: PersistedMatchInfo;
};

export type DrinkInput = {
  id?: unknown;
  name?: unknown;
  originalPrice?: unknown;
  price?: unknown;
  happyHourPrice?: unknown;
  icon?: unknown;
  active?: unknown;
};

export type ProgramItemInput = {
  id?: unknown;
  icon?: unknown;
  text?: unknown;
  active?: unknown;
  sortOrder?: unknown;
};

export type LivelyMessageInput = {
  id?: unknown;
  text?: unknown;
  active?: unknown;
  sortOrder?: unknown;
};

export type EventBannerInput = {
  id?: unknown;
  text?: unknown;
  active?: unknown;
  sortOrder?: unknown;
};

export type PreMatchConfigInput = Partial<PersistedPreMatchConfig>;

const contentPath = resolve(process.cwd(), 'data', 'pre-match-content.json');
const happyHourDiscountRate = 0.2;

const defaultMatchInfo: PersistedMatchInfo = {
  selectedMatchId: 'france-unknown',
  matchStarted: false,
  matchMode: 'simulation',
  scoreSource: 'simulation',
  source: 'simulation',
  provider: 'manual',
  homeTeam: {
    name: 'France',
    shortName: 'FRA',
  },
  awayTeam: {
    name: 'Unknown',
    shortName: 'ADV',
  },
  homeScore: 0,
  awayScore: 0,
};

const defaultContent: PersistentContent = {
  version: 1,
  drinks: [
    {
      id: 'pinte-blonde',
      name: 'Pinte blonde',
      originalPrice: 7,
      price: 7,
      happyHourPrice: 5.6,
      icon: '🍺',
      currency: 'EUR',
      active: true,
    },
    {
      id: 'pinte-ipa',
      name: 'Pinte IPA',
      originalPrice: 8,
      price: 8,
      happyHourPrice: 6.4,
      icon: '🍻',
      currency: 'EUR',
      active: true,
    },
    {
      id: 'verre-vin',
      name: 'Verre de vin',
      originalPrice: 5,
      price: 5,
      happyHourPrice: 4,
      icon: '🍷',
      currency: 'EUR',
      active: true,
    },
    {
      id: 'cocktail-maison',
      name: 'Cocktail maison',
      originalPrice: 9,
      price: 9,
      happyHourPrice: 7.2,
      icon: '🍹',
      currency: 'EUR',
      active: true,
    },
    {
      id: 'soft',
      name: 'Soft',
      originalPrice: 3.5,
      price: 3.5,
      happyHourPrice: 2.8,
      icon: '🥤',
      currency: 'EUR',
      active: true,
    },
  ],
  programItems: [
    {
      id: 'service-bar',
      icon: '🍽️',
      text: 'Service au bar pendant tout le match',
      active: true,
      sortOrder: 10,
    },
    {
      id: 'happy-hour-buts',
      icon: '⚽',
      text: '10 minutes de Happy Hour a chaque but de la France',
      active: true,
      sortOrder: 20,
    },
    {
      id: 'offres-tv',
      icon: '📺',
      text: "Les offres s'affichent automatiquement sur la TV",
      active: true,
      sortOrder: 30,
    },
  ],
  eventBanners: [
    {
      id: 'happy-hour-bientot',
      text: 'Gardez un oeil sur le score : Happy Hour a chaque but de la France.',
      active: true,
      sortOrder: 10,
    },
    {
      id: 'service-cocotte',
      text: 'La Cocotte vous sert pendant tout le match.',
      active: true,
      sortOrder: 20,
    },
  ],
  livelyMessages: [
    {
      id: 'allez-les-bleus',
      text: 'Allez les Bleus, la Cocotte est avec vous.',
      active: true,
      sortOrder: 10,
    },
    {
      id: 'service-chaud',
      text: 'Un but de la France et le bar passe en Happy Hour.',
      active: true,
      sortOrder: 20,
    },
    {
      id: 'champagne-orange',
      text: 'Ambiance orange, verres prets, match lance.',
      active: true,
      sortOrder: 30,
    },
  ],
  preMatch: {
    enabled: true,
    kickoffAt: '',
    homeFlag: '🇫🇷',
    awayFlag: '🇩🇪',
  },
  match: defaultMatchInfo,
};

let content: PersistentContent | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cleanId(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanIcon(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  return Array.from(value.trim()).slice(0, 4).join('') || fallback;
}

function cleanPrice(value: unknown, fallback = 0): number {
  const price = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(price) || price < 0) {
    return fallback;
  }

  return Number(price.toFixed(2));
}

function cleanSortOrder(value: unknown, fallback = 0): number {
  const sortOrder = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(sortOrder)) {
    return fallback;
  }

  return Math.trunc(sortOrder);
}

function cleanDateTime(value: unknown): string {
  return cleanText(value, 40).replace(/\s+/g, '');
}

function assertTeam(value: unknown, fallback: MatchTeam): MatchTeam {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const candidate = value as Partial<MatchTeam>;
  const name = cleanText(candidate.name, 64);
  const shortName = cleanText(candidate.shortName, 8).toUpperCase();

  if (!name || !shortName) {
    return fallback;
  }

  return { name, shortName };
}

function normalizeDrink(value: unknown): DrinkMenuItem {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid persisted drink');
  }

  const candidate = value as Partial<DrinkMenuItem>;
  const id = cleanId(candidate.id);
  const name = cleanText(candidate.name, 64);
  const originalPrice = cleanPrice(candidate.originalPrice ?? candidate.price, Number.NaN);
  const happyHourPrice = cleanPrice(candidate.happyHourPrice, Number.NaN);

  if (!id || !name || Number.isNaN(originalPrice) || Number.isNaN(happyHourPrice)) {
    throw new Error('Invalid persisted drink');
  }

  return {
    id,
    name,
    originalPrice,
    price: originalPrice,
    happyHourPrice,
    icon: cleanIcon(candidate.icon, '🍺'),
    currency: 'EUR',
    active: candidate.active !== false,
  };
}

function normalizeProgramItem(value: unknown): ProgramItem {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid persisted program item');
  }

  const candidate = value as Partial<ProgramItem>;
  const id = cleanId(candidate.id);
  const text = cleanText(candidate.text, 140);

  if (!id || !text) {
    throw new Error('Invalid persisted program item');
  }

  return {
    id,
    icon: cleanIcon(candidate.icon, '•'),
    text,
    active: candidate.active !== false,
    sortOrder: cleanSortOrder(candidate.sortOrder, 0),
  };
}

function normalizeLivelyMessage(value: unknown): LivelyMessage {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid persisted lively message');
  }

  const candidate = value as Partial<LivelyMessage>;
  const id = cleanId(candidate.id);
  const text = cleanText(candidate.text, 140);

  if (!id || !text) {
    throw new Error('Invalid persisted lively message');
  }

  return {
    id,
    text,
    active: candidate.active !== false,
    sortOrder: cleanSortOrder(candidate.sortOrder, 0),
  };
}

function normalizeEventBanner(value: unknown): EventBanner {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid persisted event banner');
  }

  const candidate = value as Partial<EventBanner>;
  const id = cleanId(candidate.id);
  const text = cleanText(candidate.text, 160);

  if (!id || !text) {
    throw new Error('Invalid persisted event banner');
  }

  return {
    id,
    text,
    active: candidate.active !== false,
    sortOrder: cleanSortOrder(candidate.sortOrder, 0),
  };
}

function normalizePreMatch(value: unknown): PersistedPreMatchConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid persisted pre-match config');
  }

  const candidate = value as Partial<PersistedPreMatchConfig>;

  return {
    enabled: candidate.enabled !== false,
    kickoffAt: cleanDateTime(candidate.kickoffAt),
    homeFlag: cleanIcon(candidate.homeFlag, '🇫🇷'),
    awayFlag: cleanIcon(candidate.awayFlag, '🇩🇪'),
  };
}

function normalizeMatch(value: unknown): PersistedMatchInfo {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid persisted match info');
  }

  const candidate = value as Partial<PersistedMatchInfo>;
  const matchMode: MatchMode = candidate.matchMode === 'api-live' ? 'api-live' : 'simulation';
  const scoreSource: ScoreSource = candidate.scoreSource === 'api-live-placeholder' ? 'api-live-placeholder' : 'simulation';
  const provider: MatchProvider = candidate.provider === 'api-football' ? 'api-football' : 'manual';

  return {
    selectedMatchId: cleanText(candidate.selectedMatchId, 80) || defaultMatchInfo.selectedMatchId,
    matchStarted: Boolean(candidate.matchStarted),
    matchMode,
    scoreSource,
    source: candidate.source === 'api-live-placeholder' ? 'api-live-placeholder' : scoreSource,
    provider,
    homeTeam: assertTeam(candidate.homeTeam, defaultMatchInfo.homeTeam),
    awayTeam: assertTeam(candidate.awayTeam, defaultMatchInfo.awayTeam),
    homeScore: cleanSortOrder(candidate.homeScore, 0),
    awayScore: cleanSortOrder(candidate.awayScore, 0),
  };
}

function normalizeContent(value: unknown): PersistentContent {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid persistent content');
  }

  const candidate = value as Partial<PersistentContent>;

  if (!Array.isArray(candidate.drinks) || !Array.isArray(candidate.programItems)) {
    throw new Error('Persistent content is missing drinks or program items');
  }

  return {
    version: 1,
    drinks: candidate.drinks.map(normalizeDrink),
    programItems: candidate.programItems.map(normalizeProgramItem),
    eventBanners: Array.isArray(candidate.eventBanners)
      ? candidate.eventBanners.map(normalizeEventBanner)
      : clone(defaultContent.eventBanners),
    livelyMessages: Array.isArray(candidate.livelyMessages)
      ? candidate.livelyMessages.map(normalizeLivelyMessage)
      : clone(defaultContent.livelyMessages),
    preMatch: normalizePreMatch(candidate.preMatch),
    match: normalizeMatch(candidate.match),
  };
}

async function saveContent(): Promise<void> {
  if (!content) {
    throw new Error('Persistent content is not loaded');
  }

  await writeFile(contentPath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function requireContent(): PersistentContent {
  if (!content) {
    throw new Error('Persistent content is not loaded');
  }

  return content;
}

function createUniqueId(baseValue: string, values: Array<{ id: string }>, fallbackPrefix: string): string {
  const baseId = cleanId(baseValue) || `${fallbackPrefix}-${Date.now()}`;
  let id = baseId;
  let index = 2;

  while (values.some((value) => value.id === id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }

  return id;
}

export async function initializePersistentContent(): Promise<void> {
  await mkdir(dirname(contentPath), { recursive: true });

  try {
    const raw = await readFile(contentPath, 'utf8');
    const parsedContent = JSON.parse(raw);
    content = normalizeContent(parsedContent);

    if (
      !parsedContent
      || typeof parsedContent !== 'object'
      || !Array.isArray(parsedContent.livelyMessages)
      || !Array.isArray(parsedContent.eventBanners)
    ) {
      await saveContent();
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      content = clone(defaultContent);
      await saveContent();
      return;
    }

    throw error;
  }
}

export function listDrinks(): DrinkMenuItem[] {
  return clone(requireContent().drinks);
}

export function listActiveDrinks(): DrinkMenuItem[] {
  return clone(requireContent().drinks.filter((drink) => drink.active));
}

export async function createDrink(input: DrinkInput): Promise<DrinkMenuItem> {
  const current = requireContent();
  const name = cleanText(input.name, 64);

  if (!name) {
    throw new Error('Missing drink name');
  }

  const originalPrice = cleanPrice(input.originalPrice ?? input.price);
  const drink: DrinkMenuItem = {
    id: input.id && !current.drinks.some((drink) => drink.id === cleanId(input.id))
      ? cleanId(input.id)
      : createUniqueId(name, current.drinks, 'boisson'),
    name,
    originalPrice,
    price: originalPrice,
    happyHourPrice: cleanPrice(input.happyHourPrice, Number((originalPrice * (1 - happyHourDiscountRate)).toFixed(2))),
    icon: cleanIcon(input.icon, '🍺'),
    currency: 'EUR',
    active: input.active === undefined ? true : Boolean(input.active),
  };

  current.drinks = [...current.drinks, drink];
  await saveContent();
  return clone(drink);
}

export async function updateDrink(id: string, input: DrinkInput): Promise<DrinkMenuItem> {
  const current = requireContent();
  const cleanDrinkId = cleanId(id);
  const existingDrink = current.drinks.find((drink) => drink.id === cleanDrinkId);

  if (!existingDrink) {
    throw new Error('Unknown drink');
  }

  const originalPrice = input.originalPrice === undefined && input.price === undefined
    ? existingDrink.originalPrice
    : cleanPrice(input.originalPrice ?? input.price, existingDrink.originalPrice);
  const name = input.name === undefined ? existingDrink.name : cleanText(input.name, 64);

  if (!name) {
    throw new Error('Missing drink name');
  }

  const updatedDrink: DrinkMenuItem = {
    ...existingDrink,
    name,
    originalPrice,
    price: originalPrice,
    happyHourPrice: input.happyHourPrice === undefined
      ? existingDrink.happyHourPrice
      : cleanPrice(input.happyHourPrice, existingDrink.happyHourPrice),
    icon: input.icon === undefined ? existingDrink.icon : cleanIcon(input.icon, existingDrink.icon),
    active: input.active === undefined ? existingDrink.active : Boolean(input.active),
  };

  current.drinks = current.drinks.map((drink) => drink.id === cleanDrinkId ? updatedDrink : drink);
  await saveContent();
  return clone(updatedDrink);
}

export async function deleteDrink(id: string): Promise<void> {
  const current = requireContent();
  const cleanDrinkId = cleanId(id);
  const nextDrinks = current.drinks.filter((drink) => drink.id !== cleanDrinkId);

  if (nextDrinks.length === current.drinks.length) {
    throw new Error('Unknown drink');
  }

  current.drinks = nextDrinks;
  await saveContent();
}

export function listProgramItems(): ProgramItem[] {
  return clone([...requireContent().programItems].sort((a, b) => a.sortOrder - b.sortOrder));
}

export function listActiveProgramItems(): ProgramItem[] {
  return listProgramItems().filter((item) => item.active);
}

export async function createProgramItem(input: ProgramItemInput): Promise<ProgramItem> {
  const current = requireContent();
  const text = cleanText(input.text, 140);

  if (!text) {
    throw new Error('Missing program text');
  }

  const lastSortOrder = current.programItems.reduce((max, item) => Math.max(max, item.sortOrder), 0);
  const item: ProgramItem = {
    id: input.id && !current.programItems.some((programItem) => programItem.id === cleanId(input.id))
      ? cleanId(input.id)
      : createUniqueId(text, current.programItems, 'programme'),
    icon: cleanIcon(input.icon, '•'),
    text,
    active: input.active === undefined ? true : Boolean(input.active),
    sortOrder: input.sortOrder === undefined ? lastSortOrder + 10 : cleanSortOrder(input.sortOrder, lastSortOrder + 10),
  };

  current.programItems = [...current.programItems, item];
  await saveContent();
  return clone(item);
}

export async function updateProgramItem(id: string, input: ProgramItemInput): Promise<ProgramItem> {
  const current = requireContent();
  const cleanProgramId = cleanId(id);
  const existingItem = current.programItems.find((item) => item.id === cleanProgramId);

  if (!existingItem) {
    throw new Error('Unknown program item');
  }

  const text = input.text === undefined ? existingItem.text : cleanText(input.text, 140);

  if (!text) {
    throw new Error('Missing program text');
  }

  const updatedItem: ProgramItem = {
    ...existingItem,
    icon: input.icon === undefined ? existingItem.icon : cleanIcon(input.icon, existingItem.icon),
    text,
    active: input.active === undefined ? existingItem.active : Boolean(input.active),
    sortOrder: input.sortOrder === undefined ? existingItem.sortOrder : cleanSortOrder(input.sortOrder, existingItem.sortOrder),
  };

  current.programItems = current.programItems.map((item) => item.id === cleanProgramId ? updatedItem : item);
  await saveContent();
  return clone(updatedItem);
}

export async function deleteProgramItem(id: string): Promise<void> {
  const current = requireContent();
  const cleanProgramId = cleanId(id);
  const nextProgramItems = current.programItems.filter((item) => item.id !== cleanProgramId);

  if (nextProgramItems.length === current.programItems.length) {
    throw new Error('Unknown program item');
  }

  current.programItems = nextProgramItems;
  await saveContent();
}

export function listEventBanners(): EventBanner[] {
  return clone([...requireContent().eventBanners].sort((a, b) => a.sortOrder - b.sortOrder));
}

export function listActiveEventBanners(): EventBanner[] {
  return listEventBanners().filter((banner) => banner.active);
}

export async function createEventBanner(input: EventBannerInput): Promise<EventBanner> {
  const current = requireContent();
  const text = cleanText(input.text, 160);

  if (!text) {
    throw new Error('Missing event banner text');
  }

  const lastSortOrder = current.eventBanners.reduce((max, banner) => Math.max(max, banner.sortOrder), 0);
  const banner: EventBanner = {
    id: input.id && !current.eventBanners.some((eventBanner) => eventBanner.id === cleanId(input.id))
      ? cleanId(input.id)
      : createUniqueId(text, current.eventBanners, 'banniere'),
    text,
    active: input.active === undefined ? true : Boolean(input.active),
    sortOrder: input.sortOrder === undefined ? lastSortOrder + 10 : cleanSortOrder(input.sortOrder, lastSortOrder + 10),
  };

  current.eventBanners = [...current.eventBanners, banner];
  await saveContent();
  return clone(banner);
}

export async function updateEventBanner(id: string, input: EventBannerInput): Promise<EventBanner> {
  const current = requireContent();
  const cleanBannerId = cleanId(id);
  const existingBanner = current.eventBanners.find((banner) => banner.id === cleanBannerId);

  if (!existingBanner) {
    throw new Error('Unknown event banner');
  }

  const text = input.text === undefined ? existingBanner.text : cleanText(input.text, 160);

  if (!text) {
    throw new Error('Missing event banner text');
  }

  const updatedBanner: EventBanner = {
    ...existingBanner,
    text,
    active: input.active === undefined ? existingBanner.active : Boolean(input.active),
    sortOrder: input.sortOrder === undefined ? existingBanner.sortOrder : cleanSortOrder(input.sortOrder, existingBanner.sortOrder),
  };

  current.eventBanners = current.eventBanners.map((banner) => banner.id === cleanBannerId ? updatedBanner : banner);
  await saveContent();
  return clone(updatedBanner);
}

export async function deleteEventBanner(id: string): Promise<void> {
  const current = requireContent();
  const cleanBannerId = cleanId(id);
  const nextBanners = current.eventBanners.filter((banner) => banner.id !== cleanBannerId);

  if (nextBanners.length === current.eventBanners.length) {
    throw new Error('Unknown event banner');
  }

  current.eventBanners = nextBanners;
  await saveContent();
}

export function listLivelyMessages(): LivelyMessage[] {
  return clone([...requireContent().livelyMessages].sort((a, b) => a.sortOrder - b.sortOrder));
}

export function listActiveLivelyMessages(): LivelyMessage[] {
  return listLivelyMessages().filter((message) => message.active);
}

export async function createLivelyMessage(input: LivelyMessageInput): Promise<LivelyMessage> {
  const current = requireContent();
  const text = cleanText(input.text, 140);

  if (!text) {
    throw new Error('Missing lively message text');
  }

  const lastSortOrder = current.livelyMessages.reduce((max, message) => Math.max(max, message.sortOrder), 0);
  const message: LivelyMessage = {
    id: input.id && !current.livelyMessages.some((livelyMessage) => livelyMessage.id === cleanId(input.id))
      ? cleanId(input.id)
      : createUniqueId(text, current.livelyMessages, 'message'),
    text,
    active: input.active === undefined ? true : Boolean(input.active),
    sortOrder: input.sortOrder === undefined ? lastSortOrder + 10 : cleanSortOrder(input.sortOrder, lastSortOrder + 10),
  };

  current.livelyMessages = [...current.livelyMessages, message];
  await saveContent();
  return clone(message);
}

export async function updateLivelyMessage(id: string, input: LivelyMessageInput): Promise<LivelyMessage> {
  const current = requireContent();
  const cleanMessageId = cleanId(id);
  const existingMessage = current.livelyMessages.find((message) => message.id === cleanMessageId);

  if (!existingMessage) {
    throw new Error('Unknown lively message');
  }

  const text = input.text === undefined ? existingMessage.text : cleanText(input.text, 140);

  if (!text) {
    throw new Error('Missing lively message text');
  }

  const updatedMessage: LivelyMessage = {
    ...existingMessage,
    text,
    active: input.active === undefined ? existingMessage.active : Boolean(input.active),
    sortOrder: input.sortOrder === undefined ? existingMessage.sortOrder : cleanSortOrder(input.sortOrder, existingMessage.sortOrder),
  };

  current.livelyMessages = current.livelyMessages.map((message) => message.id === cleanMessageId ? updatedMessage : message);
  await saveContent();
  return clone(updatedMessage);
}

export async function deleteLivelyMessage(id: string): Promise<void> {
  const current = requireContent();
  const cleanMessageId = cleanId(id);
  const nextMessages = current.livelyMessages.filter((message) => message.id !== cleanMessageId);

  if (nextMessages.length === current.livelyMessages.length) {
    throw new Error('Unknown lively message');
  }

  current.livelyMessages = nextMessages;
  await saveContent();
}

export function getPreMatchConfig(): PersistedPreMatchConfig {
  return clone(requireContent().preMatch);
}

export async function updatePreMatchConfig(input: PreMatchConfigInput): Promise<PersistedPreMatchConfig> {
  const current = requireContent();
  current.preMatch = {
    enabled: input.enabled === undefined ? current.preMatch.enabled : Boolean(input.enabled),
    kickoffAt: input.kickoffAt === undefined ? current.preMatch.kickoffAt : cleanDateTime(input.kickoffAt),
    homeFlag: input.homeFlag === undefined ? current.preMatch.homeFlag : cleanIcon(input.homeFlag, current.preMatch.homeFlag),
    awayFlag: input.awayFlag === undefined ? current.preMatch.awayFlag : cleanIcon(input.awayFlag, current.preMatch.awayFlag),
  };
  await saveContent();
  return clone(current.preMatch);
}

export function getPersistedMatchInfo(): PersistedMatchInfo {
  return clone(requireContent().match);
}

export async function updatePersistedMatchInfo(input: PersistedMatchInfo): Promise<PersistedMatchInfo> {
  const current = requireContent();
  current.match = normalizeMatch(input);
  await saveContent();
  return clone(current.match);
}
