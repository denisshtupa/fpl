export interface TeamBattlePlayer {
  entryId: number;
  shortName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  entryName: string;
  playerName: string;
  gwPoints: number;
  totalPoints: number;
  rank: number;
}

export interface TeamBattleSummary {
  id: string;
  name: string;
  color: string;
  totalPoints: number;
  gwPoints: number;
  players: TeamBattlePlayer[];
}

export interface ManagerChipInfo {
  key: string;
  label: string;
  event: number;
  used: boolean;
}

export type SquadPlayerStatus = 'played' | 'live' | 'upcoming' | 'dnp';

export interface ManagerSquadPlayer {
  elementId: number;
  name: string;
  club: string;
  clubShort: string;
  role: string;
  position: number;
  isBench: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  minutes: number;
  basePoints: number;
  scoredPoints: number;
  played: boolean;
  matchStatus: 'upcoming' | 'live' | 'finished';
  status: SquadPlayerStatus;
  statusLabel: string;
}

export interface ManagerGwPoint {
  event: number;
  points: number;
  totalPoints: number;
}

export interface ManagerProfile {
  entryId: number;
  shortName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  lineColor: string;
  entryName: string;
  playerName: string;
  teamValue: number;
  bank: number;
  gwPoints: number;
  totalPoints: number;
  benchPoints: number;
  transferCost: number;
  transfers: number;
  activeChip: string | null;
  activeChipLabel: string | null;
  chips: ManagerChipInfo[];
  chipsUsedCount: number;
  squad: ManagerSquadPlayer[];
  startingXiPoints: number;
  playersLeftToPlay: number;
  playersPlayed: number;
  gwHistory: ManagerGwPoint[];
}
