export interface TeamData {
  rank: number
  team: string
  record: string
  points: number
  trend: string
}

export interface PollData {
  [year: number]: {
    [week: number]: TeamData[]
  }
}

export const pollData: PollData = {
    2025: {
    1: [
      { rank: 1, team: 'Tet Offensive (Sparsh)', record: '0-0', points: 0, trend: '-' },
      { rank: 2, team: 'Nangali\'s `Naners (Sam)', record: '0-0', points: 0, trend: '-' },
      { rank: 3, team: 'Heterophobes Reloaded 😈 (Joseph)', record: '0-0', points: 0, trend: '-' },
      { rank: 4, team: 'It Hurts a little (Rishi)', record: '0-0', points: 0, trend: '-' },
      { rank: 5, team: 'Indian DJ (TJ)', record: '0-0', points: 0, trend: '-' },
      { rank: 6, team: 'Bark for Daddy!🫵🐶 (Kirk)', record: '0-0', points: 0, trend: '-' },
      { rank: 7, team: 'Kamara vs the World (Amogh)', record: '0-0', points: 0, trend: '-' },
      { rank: 8, team: 'Maye I Digg in yo Boutte (Revanth)', record: '0-0', points: 0, trend: '-' },
      { rank: 9, team: 'Smooth Jazz w Kenny G (Keshav)', record: '0-0', points: 0, trend: '-' },
      { rank: 10, team: 'Code Monkey (PR #414) (Ankith)', record: '0-0', points: 0, trend: '-' },
      { rank: 11, team: 'Jayden Jefferson Jr\'s Mom (Carter)', record: '0-0', points: 0, trend: '-' },
      { rank: 12, team: 'Stevenson and White Guys For (Alvin)', record: '0-0', points: 0, trend: '-' },
    ],
    6: [
      { rank: 1, team: 'Code Monkey (PR #414) (Ankith)', record: '4-1', points: 7, trend: '-' },
      { rank: 2, team: 'Kamara vs the World (Amogh)', record: '4-1', points: 9, trend: '-' },
      { rank: 3, team: 'Nangali\'s `Naners (Sam)', record: '3-2', points: 14, trend: '-' },
      { rank: 4, team: 'It Hurts a little (Rishi)', record: '3-2', points: 21, trend: '-' },
      { rank: 5, team: 'Jayden Jefferson Jr\'s Mom (Carter)', record: '3-2', points: 26, trend: '-' },
      { rank: 6, team: 'Heterophobes Reloaded 😈 (Joseph)', record: '3-2', points: 30, trend: '-' },
      { rank: 7, team: 'Bark for Daddy!🫵🐶 (Kirk)', record: '3-2', points: 34, trend: '-' },
      { rank: 8, team: 'Indian DJ (TJ)', record: '2-3', points: 40, trend: '-' },
      { rank: 9, team: 'Smooth Jazz w Kenny G (Keshav)', record: '2-3', points: 46, trend: '-' },
      { rank: 10, team: 'Stevenson and White Guys For (Alvin)', record: '2-3', points: 49, trend: '-' },
      { rank: 11, team: 'Tet Offensive (Sparsh)', record: '1-4', points: 51, trend: '-' },
      { rank: 12, team: 'Maye I Digg in yo Boutte (Revanth)', record: '0-5', points: 60, trend: '-' },
    ],
    7: [
      { rank: 1, team: 'Kamara vs the World (Amogh)', record: '5-1', points: 6, trend: '↑1' },
      { rank: 2, team: 'Code Monkey (PR #414) (Ankith)', record: '4-2', points: 8, trend: '↓1' },
      { rank: 3, team: 'Nangali\'s `Naners (Sam)', record: '3-3', points: 13, trend: '-' },
      { rank: 4, team: 'It Hurts a little (Rishi)', record: '4-2', points: 14, trend: '-' },
      { rank: 5, team: 'Bark for Daddy!🫵🐶 (Kirk)', record: '4-2', points: 23, trend: '↑2' },
      { rank: 6, team: 'Smooth Jazz w Kenny G (Keshav)', record: '3-3', points: 24, trend: '↑3' },
      { rank: 7, team: 'Jayden Jefferson Jr\'s Mom (Carter)', record: '3-3', points: 30, trend: '↓2' },
      { rank: 8, team: 'Heterophobes Reloaded 😈 (Joseph)', record: '3-3', points: 31, trend: '↓2' },
      { rank: 9, team: 'Tet Offensive (Sparsh)', record: '2-4', points: 35, trend: '↑2' },
      { rank: 10, team: 'Indian DJ (TJ)', record: '2-4', points: 39, trend: '↓2' },
      { rank: 11, team: 'Stevenson and White Guys For (Alvin)', record: '2-4', points: 43, trend: '↓1' },
      { rank: 12, team: 'Maye I Digg in yo Boutte (Revanth)', record: '1-5', points: 45, trend: '-' },
    ],
    8: [
      { rank: 1, team: 'Code Monkey (PR #414) (Ankith)', record: '5-2', points: 2, trend: '↑1'},
      { rank: 2, team: 'Kamara vs the World (Amogh)', record: '5-2', points: 4, trend: '↓1' },
      { rank: 3, team: 'It Hurts a little (Rishi)', record: '5-2', points: 6, trend: '↑1' },
      { rank: 4, team: 'Smooth Jazz w Kenny G (Keshav)', record: '4-3', points: 9, trend: '↑2' },
      { rank: 5, team: 'Nangali\'s `Naners (Sam)', record: '3-4', points: 10, trend: '↓2' },
      { rank: 6, team: 'Bark for Daddy!🫵🐶 (Kirk)', record: '5-2', points: 11, trend: '↓1' },
      { rank: 7, team: 'Maye I Digg in yo Boutte (Revanth)', record: '2-5', points: 14, trend: '↑5' },
      { rank: 8, team: 'Heterophobes Reloaded 😈 (Joseph)', record: '3-4', points: 17, trend: '-' },
      { rank: 8, team: 'Tet Offensive (Sparsh)', record: '3-4', points: 17, trend: '-' },
      { rank: 10, team: 'Jayden Jefferson Jr\'s Mom (Carter)', record: '3-4', points: 20, trend: '↓3' },
      { rank: 11, team: 'Indian DJ (TJ)', record: '2-5', points: 22, trend: '↓1' },
      { rank: 12, team: 'Stevenson and White Guys For (Alvin)', record: '2-5', points: 24, trend: '-' },
    ],
    9: [
      { rank: 1, team: 'Code Monkey (PR #414) (Ankith)', record: '6-2', points: 4, trend: '-'},
      { rank: 2, team: 'It Hurts a little (Rishi)', record: '6-2', points: 8, trend: '↑1' },
      { rank: 3, team: 'Kamara vs the World (Amogh)', record: '5-3', points: 13, trend: '↓1' },
      { rank: 4, team: 'Nangali\'s `Naners (Sam)', record: '3-5', points: 17, trend: '↑1' },
      { rank: 5, team: 'Bark for Daddy!🫵🐶 (Kirk)', record: '6-2', points: 24, trend: '↑1' },
      { rank: 6, team: 'Smooth Jazz w Kenny G (Keshav)', record: '4-4', points: 26, trend: '↓2' },
      { rank: 7, team: 'Indian DJ (TJ)', record: '3-5', points: 28, trend: '↑4' },
      { rank: 8, team: 'Tet Offensive (Sparsh)', record: '4-4', points: 29, trend: '-' },
      { rank: 9, team: 'Heterophobes Reloaded 😈 (Joseph)', record: '3-5', points: 32, trend: '↓1' },
      { rank: 10, team: 'Jayden Jefferson Jr\'s Mom (Carter)', record: '4-4', points: 41, trend: '-' },
      { rank: 11, team: 'Maye I Digg in yo Boutte (Revanth)', record: '2-6', points: 41, trend: '↓4' },
      { rank: 12, team: 'Stevenson and White Guys For (Alvin)', record: '2-6', points: 48, trend: '-' },
    ],
    10: [
      { rank: 1, team: 'Code Monkey (PR #414) (Ankith)', record: '7-2', points: 3, trend: '-' },
      { rank: 2, team: 'It Hurts a little (Rishi)', record: '6-3', points: 6, trend: '-' },
      { rank: 3, team: 'Smooth Jazz w Kenny G (Keshav)', record: '5-4', points: 11, trend: '↑3' },
      { rank: 4, team: 'Kamara vs the World (Amogh)', record: '5-4', points: 15, trend: '↓1' },
      { rank: 5, team: 'Tet Offensive (Sparsh)', record: '5-4', points: 17, trend: '↑3' },
      { rank: 6, team: "Jayden Jefferson Jr’s Mom (Carter)", record: '5-4', points: 20, trend: '↑4' },
      { rank: 6, team: 'Heterophobes Locked in (Joseph)', record: '4-5', points: 20, trend: '↑2' },
      { rank: 8, team: 'Bark for Daddy!🫵🐶 (Kirk)', record: '6-3', points: 24, trend: '↓3' },
      { rank: 8, team: 'Indian DJ (TJ)', record: '3-6', points: 24, trend: '↓2' },
      { rank: 10, team: "Nangali’s `Naners (Sam)", record: '3-6', points: 25, trend: '↓6' },
      { rank: 11, team: 'Maye I Digg in yo Boutte (Revanth)', record: '2-7', points: 33, trend: '-' },
      { rank: 12, team: 'Stevenson and White Guys For (Alvin)', record: '3-6', points: 36, trend: '-' },
    ]
  },
  2024: {
    1: [
      { rank: 1, team: 'Kupp Kupp and Away! (Sparsh)', record: '1-0', points: 6, trend: '-' },
      { rank: 2, team: 'My Puka Bear (Alvin)', record: '1-0', points: 16, trend: '-' },
      { rank: 3, team: 'JamesOn (Cotbib)', record: '1-0', points: 18, trend: '-' },
      { rank: 4, team: 'I Cook Brown Rice (Revanth)', record: '1-0', points: 19, trend: '-' },
      { rank: 5, team: 'Code Monkey (Master) (Ankith)', record: '1-0', points: 28, trend: '-' },
      { rank: 6, team: 'JJ Phoenix Rising (Kirk)', record: '1-0', points: 31, trend: '-' },
      { rank: 7, team: "Scary Terry's Turbulators (Joseph)", record: '0-1', points: 33, trend: '-' },
      { rank: 8, team: 'Chasing an Identity (TJ)', record: '0-1', points: 36, trend: '-' },
      { rank: 9, team: "Ladd's Lads (Keshav)", record: '0-1', points: 44, trend: '-' },
      { rank: 10, team: 'Christian Crusaders (Sam)', record: '0-1', points: 49, trend: '-' },
      { rank: 11, team: "Super Zay'in (Amogh)", record: '0-1', points: 53, trend: '-' },
      { rank: 12, team: 'London is Red (Rishi)', record: '0-1', points: 57, trend: '-' },
    ],
    2: [
      { rank: 1, team: 'JamesOn (Cotbib)', record: '2-0', points: 9, trend: '↑2' },
      { rank: 2, team: 'I Cook Brown Rice (Revanth)', record: '2-0', points: 10, trend: '↑2' },
      { rank: 3, team: 'My Puka Bear (Alvin)', record: '2-0', points: 11, trend: '↓1' },
      { rank: 4, team: "Super Zay'in (Amogh)", record: '1-1', points: 15, trend: '↑7' },
      { rank: 5, team: 'Code Monkey (Master) (Ankith)', record: '2-0', points: 19, trend: '-' },
      { rank: 6, team: 'Chasing an Identity (TJ)', record: '1-1', points: 20, trend: '↑2' },
      { rank: 7, team: "Scary Terry's Turbulators (Joseph)", record: '1-1', points: 31, trend: '-' },
      { rank: 8, team: 'JJ Phoenix Rising (Kirk)', record: '1-1', points: 34, trend: '↓2' },
      { rank: 9, team: 'London is Red (Rishi)', record: '0-2', points: 35, trend: '↑3' },
      { rank: 10, team: 'Kupp Kupp and Away! (Sparsh)', record: '1-1', points: 38, trend: '↓9' },
      { rank: 11, team: "Ladd's Lads (Keshav)", record: '0-2', points: 42, trend: '↓2' },
      { rank: 12, team: 'Christian Crusaders (Sam)', record: '0-2', points: 48, trend: '↓2' },
    ]
  }
}
