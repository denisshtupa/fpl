import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { AccordionModule } from 'primeng/accordion';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { ChartData, ChartOptions } from 'chart.js';

import { TEAM_BATTLE_TEAMS } from '../../core/config/team-battle.config';
import { FplEvent, FplStandingEntry } from '../../core/models/fpl.models';
import { ManagerProfile, TeamBattlePlayer, TeamBattleSummary } from '../../core/models/team-battle.models';
import { FplApiService } from '../../core/services/fpl-api.service';

@Component({
  selector: 'app-team-battle',
  imports: [
    AccordionModule,
    CardModule,
    ChartModule,
    MessageModule,
    ProgressSpinnerModule,
    TagModule,
  ],
  templateUrl: './team-battle.component.html',
  styleUrl: './team-battle.component.scss',
})
export class TeamBattleComponent {
  private readonly fplApi = inject(FplApiService);

  readonly standings = input.required<FplStandingEntry[]>();
  readonly currentEvent = input<FplEvent | undefined>(undefined);

  protected readonly detailsLoading = signal(false);
  protected readonly detailsError = signal<string | null>(null);
  protected readonly managerProfiles = signal<ManagerProfile[]>([]);

  /** Prefer live league standings totals so Team battle matches Overall during an active GW. */
  protected readonly liveManagerProfiles = computed(() => {
    const standingsByEntry = new Map(this.standings().map((entry) => [entry.entry, entry]));

    return this.managerProfiles().map((profile) => {
      const standing = standingsByEntry.get(profile.entryId);
      if (!standing) {
        return profile;
      }

      const gwHistory = profile.gwHistory.map((gw, index, all) =>
        index === all.length - 1
          ? { ...gw, points: standing.event_total, totalPoints: standing.total }
          : gw,
      );

      return {
        ...profile,
        gwPoints: standing.event_total,
        totalPoints: standing.total,
        gwHistory,
      };
    });
  });

  protected readonly teams = computed(() => this.buildTeams());
  protected readonly players = computed(() =>
    this.teams().flatMap((team) => team.players).sort((a, b) => b.totalPoints - a.totalPoints),
  );
  protected readonly profilesByTeam = computed(() => {
    const profiles = this.liveManagerProfiles();

    return TEAM_BATTLE_TEAMS.map((team) => ({
      ...team,
      profiles: profiles
        .filter((profile) => profile.teamId === team.id)
        .sort((a, b) => a.shortName.localeCompare(b.shortName)),
    }));
  });
  protected readonly winner = computed(() => {
    const teams = this.teams();
    if (teams.length < 2) {
      return null;
    }

    if (teams[0].totalPoints === teams[1].totalPoints) {
      return null;
    }

    return teams[0].totalPoints > teams[1].totalPoints ? teams[0] : teams[1];
  });
  protected readonly margin = computed(() => {
    const teams = this.teams();
    if (teams.length < 2) {
      return 0;
    }

    return Math.abs(teams[0].totalPoints - teams[1].totalPoints);
  });
  protected readonly isTie = computed(() => this.winner() === null && this.teams().length === 2);

  protected readonly playersLeftByTeam = computed(() => {
    const profiles = this.liveManagerProfiles();

    return TEAM_BATTLE_TEAMS.map((team) => {
      const members = profiles
        .filter((profile) => profile.teamId === team.id)
        .map((profile) => ({
          entryId: profile.entryId,
          shortName: profile.shortName,
          playersLeftToPlay: profile.playersLeftToPlay,
          playersPlayed: profile.playersPlayed,
        }))
        .sort((a, b) => b.playersLeftToPlay - a.playersLeftToPlay || a.shortName.localeCompare(b.shortName));

      return {
        id: team.id,
        name: team.name,
        color: team.color,
        totalLeft: members.reduce((sum, member) => sum + member.playersLeftToPlay, 0),
        members,
      };
    }).filter((team) => team.members.length > 0);
  });

  protected readonly teamChartData = computed<ChartData<'line'>>(() => {
    const profiles = this.liveManagerProfiles();
    const labels = this.gameweekLabels(profiles);

    return {
      labels,
      datasets: TEAM_BATTLE_TEAMS.map((team) => {
        const members = profiles.filter((profile) => profile.teamId === team.id);

        return {
          label: team.name,
          data: labels.map((_, index) =>
            members.reduce((sum, profile) => sum + (profile.gwHistory[index]?.totalPoints ?? 0), 0),
          ),
          borderColor: team.color,
          backgroundColor: team.color,
          pointBackgroundColor: team.color,
          pointBorderColor: '#0f1117',
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2.5,
          tension: 0.25,
          fill: false,
        };
      }),
    };
  });

  protected readonly playerChartData = computed<ChartData<'line'>>(() => {
    const profiles = this.liveManagerProfiles();
    const labels = this.gameweekLabels(profiles);

    return {
      labels,
      datasets: profiles.map((profile) => ({
        label: profile.shortName,
        data: labels.map((_, index) => profile.gwHistory[index]?.totalPoints ?? 0),
        borderColor: profile.lineColor,
        backgroundColor: profile.lineColor,
        pointBackgroundColor: profile.lineColor,
        pointBorderColor: '#0f1117',
        pointRadius: 2.5,
        pointHoverRadius: 4.5,
        borderWidth: 2,
        tension: 0.25,
        fill: false,
      })),
    };
  });

  protected readonly chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          boxWidth: 10,
          boxHeight: 10,
          padding: 10,
          font: {
            size: 10,
          },
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          title: (items) => items[0]?.label ?? '',
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#94a3b8',
          font: { size: 10 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: '#94a3b8',
          font: { size: 10 },
        },
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
      },
    },
  };

  private gameweekLabels(profiles: ManagerProfile[]): string[] {
    const maxEvents = Math.max(0, ...profiles.map((profile) => profile.gwHistory.length));
    const source = profiles.find((profile) => profile.gwHistory.length === maxEvents)?.gwHistory ?? [];

    if (source.length) {
      return source.map((gw) => `GW${gw.event}`);
    }

    const current = this.currentEvent()?.id ?? 1;
    return Array.from({ length: current }, (_, index) => `GW${index + 1}`);
  }

  constructor() {
    effect(() => {
      const eventId = this.currentEvent()?.id;
      // Re-fetch squad/live data whenever Overall standings refresh (live totals change).
      const standingsFingerprint = this.standings()
        .map((entry) => `${entry.entry}:${entry.event_total}:${entry.total}`)
        .join('|');

      if (eventId && standingsFingerprint) {
        this.loadManagerDetails(eventId);
      }
    });
  }

  protected formatValue(value: number): string {
    return `£${(value / 10).toFixed(1)}m`;
  }

  protected getChipShort(chip: string | null | undefined): string | null {
    return this.fplApi.getChipShortLabel(chip);
  }

  protected getProfile(entryId: number): ManagerProfile | undefined {
    return this.liveManagerProfiles().find((profile) => profile.entryId === entryId);
  }

  private loadManagerDetails(eventId: number): void {
    this.detailsLoading.set(true);
    this.detailsError.set(null);

    this.fplApi.getManagerProfiles(eventId).subscribe({
      next: (profiles) => {
        this.managerProfiles.set(profiles);
        this.detailsLoading.set(false);
      },
      error: () => {
        this.detailsError.set('Unable to load manager squads and chip data.');
        this.detailsLoading.set(false);
      },
    });
  }

  private buildTeams(): TeamBattleSummary[] {
    const standingsByEntry = new Map(this.standings().map((entry) => [entry.entry, entry]));
    const profilesByEntry = new Map(this.liveManagerProfiles().map((profile) => [profile.entryId, profile]));

    return TEAM_BATTLE_TEAMS.map((team) => {
      const players = team.members.map((member) => {
        const standing = standingsByEntry.get(member.entryId);
        const profile = profilesByEntry.get(member.entryId);

        return {
          entryId: member.entryId,
          shortName: member.shortName,
          teamId: team.id,
          teamName: team.name,
          teamColor: team.color,
          entryName: profile?.entryName ?? standing?.entry_name ?? member.shortName,
          playerName: profile?.playerName ?? standing?.player_name ?? '—',
          // Standings are the live source during an active GW (same as Overall).
          gwPoints: standing?.event_total ?? profile?.gwPoints ?? 0,
          totalPoints: standing?.total ?? profile?.totalPoints ?? 0,
          rank: standing?.rank ?? 0,
          activeChip: profile?.activeChip ?? null,
        } satisfies TeamBattlePlayer;
      });

      return {
        id: team.id,
        name: team.name,
        color: team.color,
        totalPoints: players.reduce((sum, player) => sum + player.totalPoints, 0),
        gwPoints: players.reduce((sum, player) => sum + player.gwPoints, 0),
        players,
      } satisfies TeamBattleSummary;
    }).sort((a, b) => b.totalPoints - a.totalPoints);
  }
}
