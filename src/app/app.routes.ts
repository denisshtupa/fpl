import { Routes } from '@angular/router';

import { LeagueStandingsComponent } from './features/league-standings/league-standings.component';

export const routes: Routes = [
  {
    path: '',
    component: LeagueStandingsComponent,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
