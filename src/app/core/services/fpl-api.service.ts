import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  forkJoin,
  from,
  map,
  mergeMap,
  of,
  retry,
  shareReplay,
  switchMap,
  timer,
  toArray,
} from 'rxjs';

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
  TeamFixtureInfo,
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

    return this.fplGet<FplLeagueStandingsResponse>(
      `${this.baseUrl}/leagues-classic/${leagueId}/standings/`,
      params,
    );
  }

  getH2hStandings(leagueId = environment.h2hLeagueId): Observable<FplH2hStandingsResponse> {
    return this.fplGet<FplH2hStandingsResponse>(`${this.baseUrl}/leagues-h2h/${leagueId}/standings/`);
  }

  getH2hMatches(eventId: number, leagueId = environment.h2hLeagueId, page = 1): Observable<FplH2hMatchesPage> {
    const params = new HttpParams().set('page', page).set('event', eventId);

    return this.fplGet<FplH2hMatchesPage>(`${this.baseUrl}/leagues-h2h-matches/league/${leagueId}/`, params);
  }

  getCurrentEvent(): Observable<FplEvent | undefined> {
    return this.getBootstrapStatic().pipe(map((data) => data.events.find((event) => event.is_current)));
  }

  getBootstrapStatic(): Observable<FplBootstrapStatic> {
    if (!this.bootstrapCache$) {
      this.bootstrapCache$ = this.fplGet<FplBootstrapStatic>(`${this.baseUrl}/bootstrap-static/`).pipe(
        shareReplay(1),
      );
    }

    return this.bootstrapCache$;
  }

  /** Drop cached bootstrap so the next refresh picks up live element/event data. */
  clearBootstrapCache(): void {
    this.bootstrapCache$ = undefined;
  }

  getEntry(entryId: number): Observable<FplEntry> {
    return this.fplGet<FplEntry>(`${this.baseUrl}/entry/${entryId}/`);
  }

  getEntryHistory(entryId: number): Observable<FplEntryHistoryResponse> {
    return this.fplGet<FplEntryHistoryResponse>(`${this.baseUrl}/entry/${entryId}/history/`);
  }

  getEntryPicks(entryId: number, eventId: number): Observable<FplEntryPicksResponse> {
    return this.fplGet<FplEntryPicksResponse>(`${this.baseUrl}/entry/${entryId}/event/${eventId}/picks/`);
  }

  getEntryTransfers(entryId: number): Observable<FplTransfer[]> {
    return this.fplGet<FplTransfer[]>(`${this.baseUrl}/entry/${entryId}/transfers/`).pipe(
      catchError(() => of([])),
    );
  }

  getEventLive(eventId: number): Observable<FplEventLiveResponse> {
    return this.fplGet<FplEventLiveResponse>(`${this.baseUrl}/event/${eventId}/live/`);
  }

  getFixtures(eventId: number): Observable<FplFixture[]> {
    const params = new HttpParams().set('event', eventId);

    return this.fplGet<FplFixture[]>(`${this.baseUrl}/fixtures/`, params);
  }

  /** Retry flaky FPL/proxy 403/429/5xx so one blocked entry does not fail the whole page. */
  private fplGet<T>(url: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(url, params ? { params } : undefined).pipe(
      retry({
        count: 3,
        delay: (error, retryCount) => {
          const status = error?.status as number | undefined;
          const retryable = !status || status === 0 || status === 403 || status === 429 || status >= 500;
          if (!retryable) {
            throw error;
          }

          return timer(300 * retryCount * retryCount);
        },
      }),
    );
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
    }).pipe(
      switchMap(({ bootstrap, live, fixtures }) => {
        const lookup = this.buildBootstrapLookup(bootstrap);
        const livePoints = new Map(live.elements.map((element) => [element.id, element.stats]));
        const fixtureByTeam = this.buildFixtureLookup(fixtures, lookup.teams);

        return from(entryIds).pipe(
          mergeMap(
            (entryId) =>
              forkJoin({
                entryId: of(entryId),
                entry: this.getEntry(entryId),
                history: this.getEntryHistory(entryId),
                picks: this.getEntryPicks(entryId, eventId),
                transfers: this.getEntryTransfers(entryId),
              }),
            2,
          ),
          toArray(),
          map((rows) => {
            const byId = new Map(rows.map((row) => [row.entryId, row]));

            return entryIds.map((entryId) => {
              const row = byId.get(entryId)!;
              return this.buildManagerProfile(
                entryId,
                row.entry,
                row.history,
                row.picks,
                row.transfers,
                eventId,
                lookup,
                livePoints,
                fixtureByTeam,
              );
            });
          }),
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
    }).pipe(
      switchMap(({ bootstrap, live, fixtures }) => {
        const lookup = this.buildBootstrapLookup(bootstrap);
        const livePoints = new Map(live.elements.map((element) => [element.id, element.stats]));
        const fixtureByTeam = this.buildFixtureLookup(fixtures, lookup.teams);

        return from(entryIds).pipe(
          mergeMap(
            (entryId) =>
              this.getEntryPicks(entryId, eventId).pipe(
                map((picks) => ({ entryId, picks })),
                catchError(() => of({ entryId, picks: null as FplEntryPicksResponse | null })),
              ),
            3,
          ),
          toArray(),
          map((rows) => {
            const extras: Record<number, { activeChip: string | null; playersLeft: number }> = {};

            for (const { entryId, picks } of rows) {
              if (!picks) {
                extras[entryId] = { activeChip: null, playersLeft: 0 };
                continue;
              }

              const progress = this.computeSquadProgress(picks, lookup, livePoints, fixtureByTeam);
              extras[entryId] = {
                activeChip: progress.activeChip,
                playersLeft: progress.playersLeftToPlay,
              };
            }

            return extras;
          }),
        );
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

  private buildFixtureLookup(
    fixtures: FplFixture[],
    teams: Map<number, { short_name: string }>,
  ): Map<number, TeamFixtureInfo> {
    const fixtureByTeam = new Map<number, TeamFixtureInfo>();
    const statusPriority: Record<FixtureMatchStatus, number> = {
      finished: 0,
      upcoming: 1,
      live: 2,
    };

    for (const fixture of fixtures) {
      const status = this.resolveMatchStatus(fixture);
      const homeShort = teams.get(fixture.team_h)?.short_name ?? '???';
      const awayShort = teams.get(fixture.team_a)?.short_name ?? '???';
      const homeInfo: TeamFixtureInfo = {
        status,
        opponentShort: awayShort,
        isHome: true,
      };
      const awayInfo: TeamFixtureInfo = {
        status,
        opponentShort: homeShort,
        isHome: false,
      };

      const existingHome = fixtureByTeam.get(fixture.team_h);
      if (!existingHome || statusPriority[status] >= statusPriority[existingHome.status]) {
        fixtureByTeam.set(fixture.team_h, homeInfo);
      }

      const existingAway = fixtureByTeam.get(fixture.team_a);
      if (!existingAway || statusPriority[status] >= statusPriority[existingAway.status]) {
        fixtureByTeam.set(fixture.team_a, awayInfo);
      }
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

  /** Remaining = not finished yet (upcoming + live). Captain/TC by multiplier (12 at GW start). */
  private countPlayersLeftToPlay(squad: ManagerSquadPlayer[], activeChip: string | null): number {
    const relevantSquad = activeChip === 'bboost' ? squad : squad.filter((player) => !player.isBench);

    return relevantSquad
      .filter((player) => player.status === 'upcoming' || player.status === 'live')
      .reduce((sum, player) => sum + Math.max(1, player.multiplier), 0);
  }

  /** Currently live slots, weighted by multiplier (captain = 2, TC = 3). */
  private countPlayersLive(squad: ManagerSquadPlayer[], activeChip: string | null): number {
    const relevantSquad = activeChip === 'bboost' ? squad : squad.filter((player) => !player.isBench);

    return relevantSquad
      .filter((player) => player.status === 'live')
      .reduce((sum, player) => sum + Math.max(1, player.multiplier), 0);
  }

  private countPlayersPlayed(squad: ManagerSquadPlayer[], activeChip: string | null): number {
    const relevantSquad = activeChip === 'bboost' ? squad : squad.filter((player) => !player.isBench);

    return relevantSquad
      .filter((player) => player.status === 'played' || player.status === 'dnp')
      .reduce((sum, player) => sum + Math.max(1, player.multiplier), 0);
  }

  /** Same squad progress used by Team battle profiles and Overall Yet. */
  private computeSquadProgress(
    picksResponse: FplEntryPicksResponse,
    lookup: BootstrapLookup,
    livePoints: Map<number, FplEventLiveResponse['elements'][number]['stats']>,
    fixtureByTeam: Map<number, TeamFixtureInfo>,
  ): {
    activeChip: string | null;
    squad: ManagerSquadPlayer[];
    playersLeftToPlay: number;
    playersLive: number;
    playersPlayed: number;
  } {
    const activeChip = picksResponse.active_chip;
    const squad = picksResponse.picks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((pick) => this.buildSquadPlayer(pick, lookup, livePoints, fixtureByTeam, activeChip));

    return {
      activeChip,
      squad,
      playersLeftToPlay: this.countPlayersLeftToPlay(squad, activeChip),
      playersLive: this.countPlayersLive(squad, activeChip),
      playersPlayed: this.countPlayersPlayed(squad, activeChip),
    };
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
    fixtureByTeam: Map<number, TeamFixtureInfo>,
  ): ManagerProfile {
    const member = TEAM_BATTLE_TEAMS.flatMap((team) =>
      team.members.map((player) => ({ ...player, team })),
    ).find((player) => player.entryId === entryId);

    const team = member?.team;
    const {
      activeChip,
      squad,
      playersLeftToPlay,
      playersLive,
      playersPlayed,
    } = this.computeSquadProgress(picksResponse, lookup, livePoints, fixtureByTeam);

    const chips = this.buildChipInfo(history.chips);
    const relevantSquad = activeChip === 'bboost' ? squad : squad.filter((player) => !player.isBench);

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
      rank: 0,
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
      playersLive,
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
    fixtureByTeam: Map<number, TeamFixtureInfo>,
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
    const fixture = element ? fixtureByTeam.get(element.team) : undefined;
    const matchStatus = fixture?.status ?? 'upcoming';
    const status = this.resolveSquadPlayerStatus(minutes, matchStatus);
    const opponentShort = fixture?.opponentShort ?? null;
    const isHome = fixture?.isHome ?? null;
    const fixtureLabel =
      opponentShort && isHome !== null ? `vs ${opponentShort} (${isHome ? 'H' : 'A'})` : '—';

    return {
      elementId: pick.element,
      name: element?.web_name ?? `Player ${pick.element}`,
      club: club?.name ?? '—',
      clubShort: club?.short_name ?? '—',
      opponentShort,
      isHome,
      fixtureLabel,
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
