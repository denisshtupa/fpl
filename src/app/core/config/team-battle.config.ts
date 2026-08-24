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
    color: '#00ff87',
    members: [
      { entryId: 4800848, shortName: 'Asbjorn', lineColor: '#00ff87' },
      { entryId: 2848510, shortName: 'Denis', lineColor: '#34d399' },
      { entryId: 4695034, shortName: 'Andi', lineColor: '#a7f3d0' },
    ],
  },
  {
    id: 'team-2',
    name: 'Breaking Bench Bad',
    color: '#b8a9ff',
    members: [
      { entryId: 48814, shortName: 'Adnand', lineColor: '#b8a9ff' },
      { entryId: 410014, shortName: 'Olti', lineColor: '#c084fc' },
      { entryId: 839542, shortName: 'Albjon', lineColor: '#e9d5ff' },
    ],
  },
];

export const TEAM_BATTLE_ENTRY_IDS = TEAM_BATTLE_TEAMS.flatMap((team) =>
  team.members.map((member) => member.entryId),
);
