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
  protected activeTab = 'overall';

  protected readonly topScorer = computed(() => this.standings()[0] ?? null);
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

    forkJoin({
      response: this.fplApi.getLeagueStandings(),
      currentEvent: this.fplApi.getCurrentEvent(),
    }).subscribe({
      next: ({ response, currentEvent }) => {
        this.leagueName.set(response.league.name);
        this.lastUpdated.set(response.last_updated_data);
        this.standings.set(response.standings.results);
        this.currentEvent.set(currentEvent);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load league data. Check your connection and try again.');
        this.loading.set(false);
      },
    });
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
    if (rank === 1) {
      return 'pi pi-trophy';
    }

    if (rank <= 3) {
      return 'pi pi-star-fill';
    }

    return '';
  }

}
