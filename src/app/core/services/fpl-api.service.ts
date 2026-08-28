import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, shareReplay } from 'rxjs';

import { environment } from '../../../environments/environment';

import { TEAM_BATTLE_ENTRY_IDS, TEAM_BATTLE_TEAMS } from '../config/team-battle.config';
import {
  ALL_FPL_CHIPS,
  FPL_CHIP_LABELS,
  FixtureMatchStatus,
  FplBootstrapStatic,
  FplEntry,
  FplEntryHistoryResponse,
  FplEntryPicksResponse,
  FplEvent,
  FplEventLiveResponse,
  FplFixture,
  FplLeagueStandingsResponse,
  FplStandingEntry,
} from '../models/fpl.models';
import {
  ManagerChipInfo,
  ManagerProfile,
  ManagerSquadPlayer,
  SquadPlayerStatus,
} from '../models/team-battle.models';

interface BootstrapLookup {
  elements: Map<number, FplBootstrapStatic['elements'][number]>;
  teams: Map<number, FplBootstrapStatic['teams'][number]>;
  elementTypes: Map<number, string>;
}

@Injectable({ providedIn: 'root' })
export class FplApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.fplApiBaseUrl;
  private bootstrapCache$?: Observable<FplBootstrapStatic>;

  getLeagueStandings(leagueId = environment.leagueId, page = 1): Observable<FplLeagueStandingsResponse> {
    const params = new HttpParams().set('page_standings', page);

    return this.http.get<FplLeagueStandingsResponse>(
      `${this.baseUrl}/leagues-classic/${leagueId}/standings/`,
      { params },
    );
  }

  getCurrentEvent(): Observable<FplEvent | undefined> {
    return this.getBootstrapStatic().pipe(map((data) => data.events.find((event) => event.is_current)));
  }

  getBootstrapStatic(): Observable<FplBootstrapStatic> {
    if (!this.bootstrapCache$) {
      this.bootstrapCache$ = this.http
        .get<FplBootstrapStatic>(`${this.baseUrl}/bootstrap-static/`)
        .pipe(shareReplay(1));
    }

    return this.bootstrapCache$;
  }

  getEntry(entryId: number): Observable<FplEntry> {
    return this.http.get<FplEntry>(`${this.baseUrl}/entry/${entryId}/`);
  }

  getEntryHistory(entryId: number): Observable<FplEntryHistoryResponse> {
    return this.http.get<FplEntryHistoryResponse>(`${this.baseUrl}/entry/${entryId}/history/`);
  }

  getEntryPicks(entryId: number, eventId: number): Observable<FplEntryPicksResponse> {
    return this.http.get<FplEntryPicksResponse>(`${this.baseUrl}/entry/${entryId}/event/${eventId}/picks/`);
  }

  getEventLive(eventId: number): Observable<FplEventLiveResponse> {
    return this.http.get<FplEventLiveResponse>(`${this.baseUrl}/event/${eventId}/live/`);
  }

  getFixtures(eventId: number): Observable<FplFixture[]> {
    const params = new HttpParams().set('event', eventId);

    return this.http.get<FplFixture[]>(`${this.baseUrl}/fixtures/`, { params });
  }

  getManagerProfiles(eventId: number): Observable<ManagerProfile[]> {
    return forkJoin({
      bootstrap: this.getBootstrapStatic(),
      live: this.getEventLive(eventId),
      fixtures: this.getFixtures(eventId),
      entries: forkJoin(TEAM_BATTLE_ENTRY_IDS.map((entryId) => this.getEntry(entryId))),
      histories: forkJoin(TEAM_BATTLE_ENTRY_IDS.map((entryId) => this.getEntryHistory(entryId))),
      picks: forkJoin(TEAM_BATTLE_ENTRY_IDS.map((entryId) => this.getEntryPicks(entryId, eventId))),
    }).pipe(
      map(({ bootstrap, live, fixtures, entries, histories, picks }) => {
        const lookup = this.buildBootstrapLookup(bootstrap);
        const livePoints = new Map(live.elements.map((element) => [element.id, element.stats]));
        const fixtureByTeam = this.buildFixtureLookup(fixtures);

        return TEAM_BATTLE_ENTRY_IDS.map((entryId, index) =>
          this.buildManagerProfile(
            entryId,
            entries[index],
            histories[index],
            picks[index],
            lookup,
            livePoints,
            fixtureByTeam,
          ),
        );
      }),
    );
  }

  getRankChange(entry: FplStandingEntry): number | null {
    if (entry.last_rank === 0) {
      return null;
    }

    return entry.last_rank - entry.rank;
  }

  private buildBootstrapLookup(bootstrap: FplBootstrapStatic): BootstrapLookup {
    return {
      elements: new Map(bootstrap.elements.map((element) => [element.id, element])),
      teams: new Map(bootstrap.teams.map((team) => [team.id, team])),
      elementTypes: new Map(
        bootstrap.element_types.map((type) => [type.id, this.mapRoleLabel(type.singular_name_short)]),
      ),
    };
  }

  private mapRoleLabel(shortName: string): string {
    const normalized = shortName.toUpperCase();

    switch (normalized) {
      case 'GKP':
      case 'GK':
        return 'GK';
      case 'DEF':
      case 'DF':
        return 'DF';
      case 'MID':
      case 'MD':
        return 'MD';
      case 'FWD':
      case 'ST':
        return 'ST';
      default:
        return shortName;
    }
  }

  private buildFixtureLookup(fixtures: FplFixture[]): Map<number, FixtureMatchStatus> {
    const fixtureByTeam = new Map<number, FixtureMatchStatus>();

    for (const fixture of fixtures) {
      const status = this.resolveMatchStatus(fixture);
      fixtureByTeam.set(fixture.team_h, status);
      fixtureByTeam.set(fixture.team_a, status);
    }

    return fixtureByTeam;
  }

  private resolveMatchStatus(fixture: FplFixture): FixtureMatchStatus {
    if (fixture.finished || fixture.finished_provisional) {
      return 'finished';
    }

    if (fixture.started) {
      return 'live';
    }

    return 'upcoming';
  }

  private resolveSquadPlayerStatus(minutes: number, matchStatus: FixtureMatchStatus): SquadPlayerStatus {
    if (matchStatus === 'live') {
      return 'live';
    }

    if (minutes > 0) {
      return 'played';
    }

    if (matchStatus === 'finished') {
      return 'dnp';
    }

    return 'upcoming';
  }

  private statusLabel(status: SquadPlayerStatus): string {
    switch (status) {
      case 'played':
        return 'Played';
      case 'live':
        return 'Live';
      case 'upcoming':
        return 'Not started';
      case 'dnp':
        return '0 mins';
    }
  }

  private buildManagerProfile(
    entryId: number,
    entry: FplEntry,
    history: FplEntryHistoryResponse,
    picksResponse: FplEntryPicksResponse,
    lookup: BootstrapLookup,
    livePoints: Map<number, FplEventLiveResponse['elements'][number]['stats']>,
    fixtureByTeam: Map<number, FixtureMatchStatus>,
  ): ManagerProfile {
    const member = TEAM_BATTLE_TEAMS.flatMap((team) =>
      team.members.map((player) => ({ ...player, team })),
    ).find((player) => player.entryId === entryId);

    const team = member?.team;
    const activeChip = picksResponse.active_chip;
    const squad = picksResponse.picks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((pick) => this.buildSquadPlayer(pick, lookup, livePoints, fixtureByTeam, activeChip));

    const chips = this.buildChipInfo(history.chips);
    const relevantSquad = activeChip === 'bboost' ? squad : squad.filter((player) => !player.isBench);
    const playersLeftToPlay = relevantSquad.filter(
      (player) => player.status === 'upcoming' || player.status === 'live',
    ).length;
    const playersPlayed = relevantSquad.filter(
      (player) => player.status === 'played' || player.status === 'dnp',
    ).length;

    const transferCost = picksResponse.entry_history.event_transfers_cost;
    const officialGwPoints = picksResponse.entry_history.points;
    const officialTotalPoints = picksResponse.entry_history.total_points;
    const liveRawPoints = relevantSquad.reduce((sum, player) => sum + player.scoredPoints, 0);
    const liveGwPoints = liveRawPoints - transferCost;
    const liveTotalPoints = officialTotalPoints - officialGwPoints + liveGwPoints;
    const startingXiPoints = squad
      .filter((player) => !player.isBench)
      .reduce((sum, player) => sum + player.scoredPoints, 0);
    const benchPoints = squad
      .filter((player) => player.isBench)
      .reduce((sum, player) => sum + player.basePoints, 0);

    const gwHistory = history.current
      .slice()
      .sort((a, b) => a.event - b.event)
      .map((gw) => ({
        event: gw.event,
        points: gw.points,
        totalPoints: gw.total_points,
      }));

    if (gwHistory.length) {
      const current = gwHistory[gwHistory.length - 1];
      current.points = liveGwPoints;
      current.totalPoints = liveTotalPoints;
    }

    return {
      entryId,
      shortName: member?.shortName ?? entry.name,
      teamId: team?.id ?? '',
      teamName: team?.name ?? '',
      teamColor: team?.color ?? '#94a3b8',
      lineColor: member?.lineColor ?? team?.color ?? '#94a3b8',
      entryName: entry.name,
      playerName: `${entry.player_first_name} ${entry.player_last_name}`.trim(),
      teamValue: picksResponse.entry_history.value,
      bank: picksResponse.entry_history.bank,
      gwPoints: liveGwPoints,
      totalPoints: liveTotalPoints,
      benchPoints,
      transferCost,
      transfers: picksResponse.entry_history.event_transfers,
      activeChip,
      activeChipLabel: activeChip ? FPL_CHIP_LABELS[activeChip] ?? activeChip : null,
      chips,
      chipsUsedCount: chips.filter((chip) => chip.used).length,
      squad,
      startingXiPoints,
      playersLeftToPlay,
      playersPlayed,
      gwHistory,
    };
  }

  private buildSquadPlayer(
    pick: FplEntryPicksResponse['picks'][number],
    lookup: BootstrapLookup,
    livePoints: Map<number, FplEventLiveResponse['elements'][number]['stats']>,
    fixtureByTeam: Map<number, FixtureMatchStatus>,
    activeChip: string | null,
  ): ManagerSquadPlayer {
    const element = lookup.elements.get(pick.element);
    const club = element ? lookup.teams.get(element.team) : undefined;
    const stats = livePoints.get(pick.element);
    const minutes = stats?.minutes ?? 0;
    const basePoints = stats?.total_points ?? element?.event_points ?? 0;
    const played = minutes > 0;
    const isBench = pick.position > 11;
    const countsTowardTotal = !isBench || activeChip === 'bboost';
    const scoredPoints = countsTowardTotal ? basePoints * pick.multiplier : basePoints;
    const matchStatus = element ? (fixtureByTeam.get(element.team) ?? 'upcoming') : 'upcoming';
    const status = this.resolveSquadPlayerStatus(minutes, matchStatus);

    return {
      elementId: pick.element,
      name: element?.web_name ?? `Player ${pick.element}`,
      club: club?.name ?? '—',
      clubShort: club?.short_name ?? '—',
      role: lookup.elementTypes.get(element?.element_type ?? 0) ?? '—',
      position: pick.position,
      isBench,
      isCaptain: pick.is_captain,
      isViceCaptain: pick.is_vice_captain,
      multiplier: pick.multiplier,
      minutes,
      basePoints,
      scoredPoints,
      played,
      matchStatus,
      status,
      statusLabel: this.statusLabel(status),
    };
  }

  private buildChipInfo(usedChips: FplEntryHistoryResponse['chips']): ManagerChipInfo[] {
    const usedByType = new Map<string, FplEntryHistoryResponse['chips'][number]>();

    for (const chip of usedChips) {
      if (!usedByType.has(chip.name)) {
        usedByType.set(chip.name, chip);
      }
    }

    return ALL_FPL_CHIPS.map((key) => {
      const used = usedByType.get(key);

      return {
        key,
        label: FPL_CHIP_LABELS[key] ?? key,
        event: used?.event ?? 0,
        used: Boolean(used),
      };
    });
  }
}
