export interface TeamBattleMember {
  entryId: number;
  shortName: string;
  lineColor: string;
}

export interface TeamBattleTeam {
  id: string;
  name: string;
  color: string;
  members: TeamBattleMember[];
}

export const TEAM_BATTLE_TEAMS: TeamBattleTeam[] = [
  {
    id: 'team-1',
    name: 'Ctrl Alt Defeat',
    color: '#ef5350',
    members: [
      { entryId: 4800848, shortName: 'Asbjorn', lineColor: '#ef5350' },
      { entryId: 2848510, shortName: 'Denis', lineColor: '#f87171' },
      { entryId: 4695034, shortName: 'Andi', lineColor: '#fca5a5' },
    ],
  },
  {
    id: 'team-2',
    name: 'Breaking Bench Bad',
    color: '#38bdf8',
    members: [
      { entryId: 48814, shortName: 'Adnand', lineColor: '#38bdf8' },
      { entryId: 410014, shortName: 'Olti', lineColor: '#7dd3fc' },
      { entryId: 839542, shortName: 'Albjon', lineColor: '#bae6fd' },
    ],
  },
];

export const TEAM_BATTLE_ENTRY_IDS = TEAM_BATTLE_TEAMS.flatMap((team) =>
  team.members.map((member) => member.entryId),
);
