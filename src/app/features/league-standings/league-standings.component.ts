import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
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
import { TeamBattleComponent } from '../team-battle/team-battle.component';

@Component({
  selector: 'app-league-standings',
  imports: [
    DatePipe,
    NgClass,
    TableModule,
    CardModule,
    ButtonModule,
    TagModule,
    ToolbarModule,
    MessageModule,
    ProgressSpinnerModule,
    TabsModule,
    TeamBattleComponent,
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
  protected expandedRows: Record<string, boolean> = {};

  private readonly rowDetails = signal<Record<number, ManagerProfile>>({});
  private readonly rowDetailLoading = signal<Record<number, boolean>>({});
  private readonly rowDetailErrors = signal<Record<number, string>>({});
  protected readonly activeChips = signal<Record<number, string | null>>({});

  protected readonly topThree = computed(() => this.standings().slice(0, 3));
  protected readonly averageGwPoints = computed(() => {
    const entries = this.standings();
    if (!entries.length) {
      return 0;
    }

    const total = entries.reduce((sum, entry) => sum + entry.event_total, 0);
    return Math.round((total / entries.length) * 10) / 10;
  });

  constructor() {
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
    this.expandedRows = {};

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

        if (currentEvent?.id) {
          this.loadActiveChips(
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
      },
    });
  }

  toggleStandingRow(entry: FplStandingEntry): void {
    const key = String(entry.entry);
    const isExpanded = Boolean(this.expandedRows[key]);

    if (isExpanded) {
      const next = { ...this.expandedRows };
      delete next[key];
      this.expandedRows = next;
      return;
    }

    this.expandedRows = { ...this.expandedRows, [key]: true };
    this.loadRowDetail(entry.entry);
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
      return '—';
    }

    return change > 0 ? `+${change}` : `${change}`;
  }

  getRankIcon(rank: number): string {
    if (rank >= 1 && rank <= 3) {
      return 'pi pi-trophy';
    }

    return '';
  }

  private loadActiveChips(entryIds: number[], eventId: number): void {
    this.fplApi.getActiveChips(entryIds, eventId).subscribe({
      next: (chips) => this.activeChips.set(chips),
    });
  }

  private loadRowDetail(entryId: number): void {
    if (this.rowDetails()[entryId] || this.rowDetailLoading()[entryId]) {
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
        this.rowDetails.update((details) => ({ ...details, [entryId]: profile }));
        this.rowDetailLoading.update((loading) => ({ ...loading, [entryId]: false }));
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
}
