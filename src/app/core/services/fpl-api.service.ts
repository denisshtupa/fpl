import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, shareReplay, catchError } from 'rxjs';

import { environment } from '../../../environments/environment';

import { TEAM_BATTLE_ENTRY_IDS, TEAM_BATTLE_TEAMS } from '../config/team-battle.config';
import {
  ALL_FPL_CHIPS,
  FPL_CHIP_LABELS,
  FPL_CHIP_SHORT,
  FixtureMatchStatus,
  FplBootstrapStatic,
  FplEntry,
  FplEntryHistoryResponse,
  FplEntryPicksResponse,
  FplEvent,
  FplEventLiveResponse,
  FplFixture,
  FplH2hMatchesPage,
  FplH2hStandingsResponse,
  FplLeagueStandingsResponse,
  FplStandingEntry,
  FplTransfer,
} from '../models/fpl.models';
import {
  ManagerChipInfo,
  ManagerProfile,
  ManagerSquadPlayer,
  ManagerTransferMove,
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

  getH2hStandings(leagueId = environment.h2hLeagueId): Observable<FplH2hStandingsResponse> {
    return this.http.get<FplH2hStandingsResponse>(`${this.baseUrl}/leagues-h2h/${leagueId}/standings/`);
  }

  getH2hMatches(eventId: number, leagueId = environment.h2hLeagueId, page = 1): Observable<FplH2hMatchesPage> {
    const params = new HttpParams().set('page', page).set('event', eventId);

    return this.http.get<FplH2hMatchesPage>(`${this.baseUrl}/leagues-h2h-matches/league/${leagueId}/`, {
      params,
    });
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

  /** Drop cached bootstrap so the next refresh picks up live element/event data. */
  clearBootstrapCache(): void {
    this.bootstrapCache$ = undefined;
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

  getEntryTransfers(entryId: number): Observable<FplTransfer[]> {
    return this.http.get<FplTransfer[]>(`${this.baseUrl}/entry/${entryId}/transfers/`).pipe(
      catchError(() => of([])),
    );
  }

  getEventLive(eventId: number): Observable<FplEventLiveResponse> {
    return this.http.get<FplEventLiveResponse>(`${this.baseUrl}/event/${eventId}/live/`);
  }

  getFixtures(eventId: number): Observable<FplFixture[]> {
    const params = new HttpParams().set('event', eventId);

    return this.http.get<FplFixture[]>(`${this.baseUrl}/fixtures/`, { params });
  }

  getManagerProfiles(eventId: number): Observable<ManagerProfile[]> {
    return this.getManagerProfilesForEntries(TEAM_BATTLE_ENTRY_IDS, eventId);
  }

  getManagerProfilesForEntries(entryIds: number[], eventId: number): Observable<ManagerProfile[]> {
    if (!entryIds.length) {
      return of([]);
    }

    return forkJoin({
      bootstrap: this.getBootstrapStatic(),
      live: this.getEventLive(eventId),
      fixtures: this.getFixtures(eventId),
      entries: forkJoin(entryIds.map((entryId) => this.getEntry(entryId))),
      histories: forkJoin(entryIds.map((entryId) => this.getEntryHistory(entryId))),
      picks: forkJoin(entryIds.map((entryId) => this.getEntryPicks(entryId, eventId))),
      transfers: forkJoin(entryIds.map((entryId) => this.getEntryTransfers(entryId))),
    }).pipe(
      map(({ bootstrap, live, fixtures, entries, histories, picks, transfers }) => {
        const lookup = this.buildBootstrapLookup(bootstrap);
        const livePoints = new Map(live.elements.map((element) => [element.id, element.stats]));
        const fixtureByTeam = this.buildFixtureLookup(fixtures);

        return entryIds.map((entryId, index) =>
          this.buildManagerProfile(
            entryId,
            entries[index],
            histories[index],
            picks[index],
            transfers[index],
            eventId,
            lookup,
            livePoints,
            fixtureByTeam,
          ),
        );
      }),
    );
  }

  getManagerProfile(entryId: number, eventId: number): Observable<ManagerProfile> {
    return this.getManagerProfilesForEntries([entryId], eventId).pipe(map((profiles) => profiles[0]));
  }

  /** Active chip + players still to play for the current GW (shared live/fixture fetch). */
  getStandingLiveExtras(
    entryIds: number[],
    eventId: number,
  ): Observable<Record<number, { activeChip: string | null; playersLeft: number }>> {
    if (!entryIds.length) {
      return of({});
    }

    return forkJoin({
      bootstrap: this.getBootstrapStatic(),
      live: this.getEventLive(eventId),
      fixtures: this.getFixtures(eventId),
      picks: forkJoin(
        entryIds.map((entryId) =>
          this.getEntryPicks(entryId, eventId).pipe(catchError(() => of(null))),
        ),
      ),
    }).pipe(
      map(({ bootstrap, live, fixtures, picks }) => {
        const lookup = this.buildBootstrapLookup(bootstrap);
        const livePoints = new Map(live.elements.map((element) => [element.id, element.stats]));
        const fixtureByTeam = this.buildFixtureLookup(fixtures);
        const extras: Record<number, { activeChip: string | null; playersLeft: number }> = {};

        entryIds.forEach((entryId, index) => {
          const picksResponse = picks[index];
          if (!picksResponse) {
            extras[entryId] = { activeChip: null, playersLeft: 0 };
            return;
          }

          const activeChip = picksResponse.active_chip;
          const squad = picksResponse.picks.map((pick) =>
            this.buildSquadPlayer(pick, lookup, livePoints, fixtureByTeam, activeChip),
          );
          const relevantSquad =
            activeChip === 'bboost' ? squad : squad.filter((player) => !player.isBench);
          const playersLeft = relevantSquad.filter(
            (player) => player.status === 'upcoming' || player.status === 'live',
          ).length;

          extras[entryId] = { activeChip, playersLeft };
        });

        return extras;
      }),
    );
  }

  getChipShortLabel(chip: string | null | undefined): string | null {
    if (!chip) {
      return null;
    }

    return FPL_CHIP_SHORT[chip] ?? chip.toUpperCase();
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
    transfers: FplTransfer[],
    eventId: number,
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
    const liveRawPoints = relevantSquad.reduce((sum, player) => sum + player.scoredPoints, 0);
    const liveGwFromSquad = liveRawPoints - transferCost;
    // Entry summary / standings stay live during an active GW; picks history often lags until matches finish.
    const liveGwPoints = entry.summary_event_points || liveGwFromSquad;
    const liveTotalPoints =
      entry.summary_overall_points ||
      picksResponse.entry_history.total_points -
        picksResponse.entry_history.points +
        liveGwFromSquad;
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

    const gwTransfers = this.buildGwTransfers(transfers, eventId, lookup);
    const freeTransfers = this.computeFreeTransfers(history, eventId);

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
      freeTransfers,
      gwTransfers,
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

  private buildGwTransfers(
    transfers: FplTransfer[],
    eventId: number,
    lookup: BootstrapLookup,
  ): ManagerTransferMove[] {
    return transfers
      .filter((transfer) => transfer.event === eventId)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((transfer) => ({
        playerIn: lookup.elements.get(transfer.element_in)?.web_name ?? `Player ${transfer.element_in}`,
        playerOut: lookup.elements.get(transfer.element_out)?.web_name ?? `Player ${transfer.element_out}`,
        playerInCost: transfer.element_in_cost,
        playerOutCost: transfer.element_out_cost,
      }));
  }

  /** Free transfers available for the next deadline (after this GW's transfers + weekly replenishment). */
  private computeFreeTransfers(history: FplEntryHistoryResponse, eventId: number): number {
    const maxFreeTransfers = 2;
    const chipByEvent = new Map(history.chips.map((chip) => [chip.event, chip.name]));
    let freeTransfers = 0;

    const weeks = history.current.slice().sort((a, b) => a.event - b.event);

    for (const gw of weeks) {
      if (gw.event > 1) {
        freeTransfers = Math.min(maxFreeTransfers, freeTransfers + 1);
      }

      const chip = chipByEvent.get(gw.event);
      if (chip === 'wildcard' || chip === 'freehit') {
        // Next week starts from 0 banked, then gains the weekly free transfer.
        freeTransfers = 0;
        if (gw.event >= eventId) {
          break;
        }
        continue;
      }

      freeTransfers = Math.max(0, freeTransfers - gw.event_transfers);

      if (gw.event >= eventId) {
        break;
      }
    }

    // Next deadline window replenishes one free transfer (capped).
    return Math.min(maxFreeTransfers, freeTransfers + 1);
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
