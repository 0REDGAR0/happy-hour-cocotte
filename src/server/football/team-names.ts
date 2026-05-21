import type { MatchTeam } from '../../types/match.js';

const shortTeamNames = new Map<string, string>([
  ['france', 'FRA'],
  ['unknown', 'ADV'],
  ['allemagne', 'ALL'],
  ['germany', 'ALL'],
  ['espagne', 'ESP'],
  ['spain', 'ESP'],
  ['italie', 'ITA'],
  ['italy', 'ITA'],
  ['argentine', 'ARG'],
  ['argentina', 'ARG'],
]);

export function getTeamShortName(name: string, code = ''): string {
  const normalizedKey = name.trim().toLowerCase();
  const mappedName = shortTeamNames.get(normalizedKey);

  if (mappedName) {
    return mappedName;
  }

  const normalizedCode = code.trim().toUpperCase();

  if (/^[A-Z]{2,4}$/.test(normalizedCode)) {
    return normalizedCode.slice(0, 3);
  }

  const letters = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z]/gi);

  return letters?.slice(0, 3).join('').toUpperCase() || 'ADV';
}

export function createTeam(name: string, code = ''): MatchTeam {
  const cleanName = name.trim() || 'Unknown';

  return {
    name: cleanName,
    shortName: getTeamShortName(cleanName, code),
  };
}
