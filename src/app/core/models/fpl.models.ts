export interface FplElementType {
  id: number;
  singular_name_short: string;
}

export interface FplTeam {
  id: number;
  name: string;
  short_name: string;
}

export interface FplElement {
  id: number;
  web_name: string;
  team: number;
  element_type: number;
  event_points: number;
  total_points: number;
}

export interface FplBootstrapStatic {
  events: FplEvent[];
  elements: FplElement[];
  teams: FplTeam[];
  element_types: FplElementType[];
}

export interface FplEntry {
  id: number;
  name: string;
  player_first_name: string;
  player_last_name: string;
  last_deadline_value: number;
  last_deadline_bank: number;
  summary_event_points: number;
  summary_overall_points: number;
}

export interface FplEntryHistoryChip {
  name: string;
  event: number;
  time: string;
}

export interface FplEntryHistoryCurrent {
  event: number;
  points: number;
  total_points: number;
  value: number;
  bank: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench: number;
}

export interface FplEntryHistoryResponse {
  current: FplEntryHistoryCurrent[];
  chips: FplEntryHistoryChip[];
}

export interface FplTransfer {
  element_in: number;
  element_in_cost: number;
  element_out: number;
  element_out_cost: number;
  entry: number;
  event: number;
  time: string;
}

export interface FplPick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface FplEntryPicksResponse {
  active_chip: string | null;
  entry_history: FplEntryHistoryCurrent;
  picks: FplPick[];
}

export interface FplLiveElementStats {
  total_points: number;
  minutes: number;
}

export interface FplLiveElement {
  id: number;
  stats: FplLiveElementStats;
}

export interface FplEventLiveResponse {
  elements: FplLiveElement[];
}

export interface FplFixture {
  id: number;
  event: number;
  team_h: number;
  team_a: number;
  started: boolean;
  finished: boolean;
  finished_provisional: boolean;
  minutes: number;
  kickoff_time: string | null;
}

export type FixtureMatchStatus = 'upcoming' | 'live' | 'finished';

export interface TeamFixtureInfo {
  status: FixtureMatchStatus;
  opponentShort: string;
  isHome: boolean;
}

export interface FplLeague {
  id: number;
  name: string;
  created: string;
  closed: boolean;
  admin_entry: number;
  scoring: string;
  has_cup: boolean;
}

export interface FplStandingEntry {
  rank: number;
  last_rank: number;
  rank_sort: number;
  total: number;
  entry: number;
  entry_name: string;
  player_name: string;
  event_total: number;
  club_badge_src: string | null;
}

export interface FplStandingsPage {
  has_next: boolean;
  page: number;
  results: FplStandingEntry[];
}

export interface FplLeagueStandingsResponse {
  league: FplLeague;
  standings: FplStandingsPage;
  last_updated_data: string;
}

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
}

export interface FplH2hStandingEntry {
  id: number;
  entry: number;
  entry_name: string;
  player_name: string;
  rank: number;
  last_rank: number;
  rank_sort: number;
  total: number;
  matches_played: number;
  matches_won: number;
  matches_drawn: number;
  matches_lost: number;
  points_for: number;
}

export interface FplH2hMatch {
  id: number;
  event: number;
  entry_1_entry: number;
  entry_1_name: string;
  entry_1_player_name: string;
  entry_1_points: number;
  entry_1_win: number;
  entry_1_draw: number;
  entry_1_loss: number;
  entry_1_total: number;
  entry_2_entry: number | null;
  entry_2_name: string | null;
  entry_2_player_name: string | null;
  entry_2_points: number | null;
  entry_2_win: number;
  entry_2_draw: number;
  entry_2_loss: number;
  entry_2_total: number;
  is_bye: boolean;
}

export interface FplH2hMatchesPage {
  has_next: boolean;
  page: number;
  results: FplH2hMatch[];
}

export interface FplH2hLeague {
  id: number;
  name: string;
  start_event: number;
  scoring: string;
}

export interface FplH2hStandingsResponse {
  league: FplH2hLeague;
  standings: {
    has_next: boolean;
    page: number;
    results: FplH2hStandingEntry[];
  };
  last_updated_data: string | null;
}

export const FPL_CHIP_LABELS: Record<string, string> = {
  wildcard: 'Wildcard',
  bboost: 'Bench Boost',
  '3xc': 'Triple Captain',
  freehit: 'Free Hit',
};

export const FPL_CHIP_SHORT: Record<string, string> = {
  wildcard: 'WC',
  bboost: 'BB',
  '3xc': 'TC',
  freehit: 'FH',
};

export const ALL_FPL_CHIPS = ['wildcard', 'bboost', '3xc', 'freehit'] as const;
