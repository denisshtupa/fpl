import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { forkJoin } from 'rxjs';

import { environment } from '../../../environments/environment';
import { FplEvent, FplStandingEntry } from '../../core/models/fpl.models';
import { ManagerProfile } from '../../core/models/team-battle.models';
import { FplApiService } from '../../core/services/fpl-api.service';
import { H2hLeagueComponent } from '../h2h-league/h2h-league.component';
import { TeamBattleComponent } from '../team-battle/team-battle.component';

@Component({
  selector: 'app-league-standings',
  imports: [
    DatePipe,
    NgClass,
    TableModule,
    CardModule,
    ButtonModule,
    DialogModule,
    TagModule,
    ToolbarModule,
    MessageModule,
    ProgressSpinnerModule,
    TabsModule,
    TeamBattleComponent,
    H2hLeagueComponent,
  ],
  templateUrl: './league-standings.component.html',
  styleUrl: './league-standings.component.scss',
})
export class LeagueStandingsComponent {
  private readonly fplApi = inject(FplApiService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly leagueName = signal('');
  protected readonly lastUpdated = signal<string | null>(null);
  protected readonly currentEvent = signal<FplEvent | undefined>(undefined);
  protected readonly standings = signal<FplStandingEntry[]>([]);
  protected readonly leagueUrl = environment.leagueUrl;
  protected activeTab = 'teams';

  private readonly rowDetails = signal<Record<number, ManagerProfile>>({});
  private readonly rowDetailLoading = signal<Record<number, boolean>>({});
  private readonly rowDetailErrors = signal<Record<number, string>>({});
  protected readonly activeChips = signal<Record<number, string | null>>({});
  protected readonly playersLeftByEntry = signal<Record<number, number>>({});
  protected readonly selectedEntryId = signal<number | null>(null);
  protected readonly detailVisible = signal(false);
  private didInitialScrollReset = false;

  protected readonly topThree = computed(() => this.standings().slice(0, 3));
  protected readonly selectedStanding = computed(() => {
    const entryId = this.selectedEntryId();
    if (entryId === null) {
      return null;
    }

    return this.standings().find((entry) => entry.entry === entryId) ?? null;
  });
  protected readonly averageGwPoints = computed(() => {
    const entries = this.standings();
    if (!entries.length) {
      return 0;
    }

    const total = entries.reduce((sum, entry) => sum + entry.event_total, 0);
    return Math.round((total / entries.length) * 10) / 10;
  });

  constructor() {
    this.scrollToTop();
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);
    this.fplApi.clearBootstrapCache();
    this.rowDetails.set({});
    this.rowDetailLoading.set({});
    this.rowDetailErrors.set({});
    this.activeChips.set({});
    this.playersLeftByEntry.set({});
    this.closeDetailModal();

    forkJoin({
      response: this.fplApi.getLeagueStandings(),
      currentEvent: this.fplApi.getCurrentEvent(),
    }).subscribe({
      next: ({ response, currentEvent }) => {
        this.leagueName.set(response.league.name);
        this.lastUpdated.set(response.last_updated_data);
        this.standings.set(response.standings.results);
        // Clone so Team battle's effect re-runs even if bootstrap returns the same event object.
        this.currentEvent.set(currentEvent ? { ...currentEvent } : undefined);
        this.loading.set(false);
        this.scrollToTopAfterPaint();

        if (currentEvent?.id) {
          this.loadStandingExtras(
            response.standings.results.map((entry) => entry.entry),
            currentEvent.id,
          );
        }
      },
      error: () => {
        this.error.set(
          'Unable to load league data. Check your connection and try again. Fantasy Premier League service appears to be down.',
        );
        this.loading.set(false);
        this.scrollToTopAfterPaint();
      },
    });
  }

  openStandingDetail(entry: FplStandingEntry): void {
    this.selectedEntryId.set(entry.entry);
    this.detailVisible.set(true);
    this.loadRowDetail(entry.entry, true);
  }

  closeDetailModal(): void {
    this.detailVisible.set(false);
    this.selectedEntryId.set(null);
  }

  onDetailVisibleChange(visible: boolean): void {
    this.detailVisible.set(visible);
    if (!visible) {
      this.selectedEntryId.set(null);
    }
  }

  getRowDetail(entryId: number): ManagerProfile | undefined {
    return this.rowDetails()[entryId];
  }

  isRowDetailLoading(entryId: number): boolean {
    return Boolean(this.rowDetailLoading()[entryId]);
  }

  getRowDetailError(entryId: number): string | undefined {
    return this.rowDetailErrors()[entryId];
  }

  getPlayersLeft(entryId: number): number | null {
    const value = this.playersLeftByEntry()[entryId];
    return value === undefined ? null : value;
  }

  formatValue(value: number): string {
    return `£${(value / 10).toFixed(1)}m`;
  }

  getPlayersTotal(detail: ManagerProfile): number {
    return detail.playersPlayed + detail.playersLeftToPlay;
  }

  getChipShort(entryId: number): string | null {
    return this.fplApi.getChipShortLabel(this.activeChips()[entryId]);
  }

  getRankChange(entry: FplStandingEntry): number | null {
    return this.fplApi.getRankChange(entry);
  }

  getRankChangeSeverity(change: number | null): 'success' | 'danger' | 'secondary' {
    if (change === null || change === 0) {
      return 'secondary';
    }

    return change > 0 ? 'success' : 'danger';
  }

  getRankChangeLabel(change: number | null): string {
    if (change === null) {
      return '—';
    }

    if (change === 0) {
      return '0';
    }

    return change > 0 ? `+${change}` : `${change}`;
  }

  getRankIcon(rank: number): string {
    if (rank >= 1 && rank <= 3) {
      return 'pi pi-trophy';
    }

    return '';
  }

  private loadStandingExtras(entryIds: number[], eventId: number): void {
    this.fplApi.getStandingLiveExtras(entryIds, eventId).subscribe({
      next: (extras) => {
        const chips: Record<number, string | null> = {};
        const playersLeft: Record<number, number> = {};

        for (const [entryId, extra] of Object.entries(extras)) {
          const id = Number(entryId);
          chips[id] = extra.activeChip;
          playersLeft[id] = extra.playersLeft;
        }

        this.activeChips.set(chips);
        this.playersLeftByEntry.set(playersLeft);
      },
    });
  }

  /** Prefer Team battle profile counts when available so Yet matches Managers profiles. */
  onPlayersLeftSync(playersLeft: Record<number, number>): void {
    this.playersLeftByEntry.update((current) => ({ ...current, ...playersLeft }));
  }

  private loadRowDetail(entryId: number, force = false): void {
    if (!force && (this.rowDetails()[entryId] || this.rowDetailLoading()[entryId])) {
      return;
    }

    if (this.rowDetailLoading()[entryId]) {
      return;
    }

    const eventId = this.currentEvent()?.id;
    if (!eventId) {
      this.rowDetailErrors.update((errors) => ({
        ...errors,
        [entryId]: 'Current gameweek is unavailable.',
      }));
      return;
    }

    this.rowDetailLoading.update((loading) => ({ ...loading, [entryId]: true }));
    this.rowDetailErrors.update((errors) => {
      const next = { ...errors };
      delete next[entryId];
      return next;
    });

    this.fplApi.getManagerProfile(entryId, eventId).subscribe({
      next: (profile) => {
        const standing = this.standings().find((entry) => entry.entry === entryId);
        const liveProfile = standing
          ? {
              ...profile,
              rank: standing.rank,
              gwPoints: standing.event_total,
              totalPoints: standing.total,
            }
          : profile;

        this.rowDetails.update((details) => ({ ...details, [entryId]: liveProfile }));
        this.rowDetailLoading.update((loading) => ({ ...loading, [entryId]: false }));
        this.playersLeftByEntry.update((map) => ({
          ...map,
          [entryId]: profile.playersLeftToPlay,
        }));
        if (profile.activeChip) {
          this.activeChips.update((chips) => ({ ...chips, [entryId]: profile.activeChip }));
        }
      },
      error: () => {
        this.rowDetailErrors.update((errors) => ({
          ...errors,
          [entryId]: 'Unable to load manager details.',
        }));
        this.rowDetailLoading.update((loading) => ({ ...loading, [entryId]: false }));
      },
    });
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  private scrollToTopAfterPaint(): void {
    if (this.didInitialScrollReset) {
      return;
    }

    this.didInitialScrollReset = true;
    requestAnimationFrame(() => {
      this.scrollToTop();
      // Team battle content loads after standings; keep top once layout settles.
      setTimeout(() => this.scrollToTop(), 0);
      setTimeout(() => this.scrollToTop(), 150);
    });
  }
}
