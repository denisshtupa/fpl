import { NgClass } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { environment } from '../../../environments/environment';
import { FplEvent, FplH2hMatch, FplH2hStandingEntry } from '../../core/models/fpl.models';
import { FplApiService } from '../../core/services/fpl-api.service';

interface GwOption {
  id: number;
  label: string;
}

@Component({
  selector: 'app-h2h-league',
  imports: [
    NgClass,
    FormsModule,
    CardModule,
    MessageModule,
    ProgressSpinnerModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './h2h-league.component.html',
  styleUrl: './h2h-league.component.scss',
})
export class H2hLeagueComponent {
  private readonly fplApi = inject(FplApiService);

  readonly currentEvent = input<FplEvent | undefined>(undefined);

  protected readonly leagueUrl = environment.h2hLeagueUrl;
  protected readonly loading = signal(true);
  protected readonly matchesLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly leagueName = signal('');
  protected readonly standings = signal<FplH2hStandingEntry[]>([]);
  protected readonly matches = signal<FplH2hMatch[]>([]);
  protected readonly gwOptions = signal<GwOption[]>([]);
  protected readonly selectedEventId = signal<number | null>(null);

  protected readonly selectedGwLabel = computed(() => {
    const id = this.selectedEventId();
    return this.gwOptions().find((gw) => gw.id === id)?.label ?? `GW ${id ?? '—'}`;
  });
  protected readonly topThree = computed(() => this.standings().slice(0, 3));
  protected readonly isCurrentGwSelected = computed(
    () => this.selectedEventId() !== null && this.selectedEventId() === this.currentEvent()?.id,
  );

  constructor() {
    effect(() => {
      const current = this.currentEvent();
      if (current?.id) {
        this.bootstrap(current);
      }
    });

    effect(() => {
      const eventId = this.selectedEventId();
      if (eventId) {
        this.loadMatches(eventId);
      }
    });
  }

  protected matchResult(match: FplH2hMatch): '1' | '2' | 'draw' | 'pending' | 'bye' {
    if (match.is_bye) {
      return 'bye';
    }

    if (match.entry_1_draw || match.entry_2_draw) {
      return 'draw';
    }

    if (match.entry_1_win) {
      return '1';
    }

    if (match.entry_2_win) {
      return '2';
    }

    // Live / unfinished GW: win flags stay 0 until FPL finalizes — use points.
    const p1 = match.entry_1_points ?? 0;
    const p2 = match.entry_2_points ?? 0;
    if (p1 > p2) {
      return '1';
    }
    if (p2 > p1) {
      return '2';
    }
    if (p1 === 0 && p2 === 0) {
      return 'pending';
    }

    return 'draw';
  }

  protected opponentLabel(match: FplH2hMatch): { name: string; manager: string } {
    if (match.is_bye) {
      return { name: 'Bye', manager: 'No opponent' };
    }

    if (!match.entry_2_entry) {
      const name = match.entry_2_name?.trim() || 'Average';
      return {
        name: name === 'AVERAGE' ? 'Average' : name,
        manager: match.entry_2_player_name?.trim() === 'AVERAGE' ? 'League average' : (match.entry_2_player_name ?? 'League average'),
      };
    }

    return {
      name: match.entry_2_name ?? 'Opponent',
      manager: match.entry_2_player_name ?? '',
    };
  }

  protected opponentPoints(match: FplH2hMatch): string {
    if (match.is_bye) {
      return '—';
    }

    return String(match.entry_2_points ?? 0);
  }

  protected getRankIcon(rank: number): string {
    if (rank >= 1 && rank <= 3) {
      return 'pi pi-trophy';
    }

    return '';
  }

  private bootstrap(current: FplEvent): void {
    this.loading.set(true);
    this.error.set(null);

    this.fplApi.getBootstrapStatic().subscribe({
      next: (bootstrap) => {
        const options = bootstrap.events
          .filter((event) => event.id <= current.id)
          .map((event) => ({ id: event.id, label: event.name }));

        this.gwOptions.set(options);
        if (!this.selectedEventId()) {
          this.selectedEventId.set(current.id);
        }
      },
      error: () => {
        this.error.set('Unable to load gameweek list.');
        this.loading.set(false);
      },
    });

    this.fplApi.getH2hStandings().subscribe({
      next: (response) => {
        this.leagueName.set(response.league.name);
        this.standings.set(response.standings.results);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load H2H league data.');
        this.loading.set(false);
      },
    });
  }

  private loadMatches(eventId: number): void {
    this.matchesLoading.set(true);

    this.fplApi.getH2hMatches(eventId).subscribe({
      next: (page) => {
        this.matches.set(page.results);
        this.matchesLoading.set(false);
      },
      error: () => {
        this.matches.set([]);
        this.matchesLoading.set(false);
        this.error.set('Unable to load H2H matches for this gameweek.');
      },
    });
  }
}
