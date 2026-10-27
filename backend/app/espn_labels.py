"""ESPN's own undocumented numeric codes for position/lineup-slot/pro-team, shared by any
service that maps a player entry (roster sync, box scores, ...). See roster.py's original
docstring / docs/ESPN_INTEGRATION_PLAN.md §7 for how these were cross-checked against a real
captured league payload."""

from dataclasses import dataclass

from app.sanitize import sanitize_name

POSITIONS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}

LINEUP_SLOTS = {
    0: "QB",
    2: "RB",
    3: "RB/WR",
    4: "WR",
    5: "WR/TE",
    6: "TE",
    7: "OP",
    16: "D/ST",
    17: "K",
    20: "Bench",
    21: "IR",
    23: "FLEX",
}
BENCH_SLOTS = {20, 21}

PRO_TEAMS = {
    1: "ATL",
    2: "BUF",
    3: "CHI",
    4: "CIN",
    5: "CLE",
    6: "DAL",
    7: "DEN",
    8: "DET",
    9: "GB",
    10: "TEN",
    11: "IND",
    12: "KC",
    13: "LV",
    14: "LAR",
    15: "MIA",
    16: "MIN",
    17: "NE",
    18: "NO",
    19: "NYG",
    20: "NYJ",
    21: "PHI",
    22: "ARI",
    23: "PIT",
    24: "LAC",
    25: "SF",
    26: "SEA",
    27: "TB",
    28: "WSH",
    29: "CAR",
    30: "JAX",
    33: "BAL",
    34: "HOU",
}


# Per-category stat ids worth showing under a player. Each was verified against a live capture by
# checking raw count x this league's scoring rule == the matching appliedStats points, across
# 17-101 players per id (fumbles lost: matches the community list, seen on QB/RB/WR/TE).
# K and D/ST ids are deliberately absent until confirmed against named stat lines. Not
# position-restricted: whatever of these a player has a non-zero value for is shown.
STAT_IDS = {
    3: "Passing Yards",
    4: "Passing TDs",
    20: "INT",
    24: "Rushing Yards",
    25: "Rushing TDs",
    42: "Receiving Yards",
    43: "Receiving TDs",
    53: "Receptions",
    72: "Fumbles Lost",
}


def label_stat_breakdown(stats: dict[str, float]) -> dict[str, float]:
    """Labeled, non-zero subset of a player's raw ESPN stat counts."""
    return {
        label: value for stat_id, label in STAT_IDS.items() if (value := stats.get(str(stat_id)))
    }


@dataclass
class LabeledPlayer:
    name: str
    position: str
    pro_team: str
    lineup_slot: str
    is_starter: bool


def label_player(
    full_name: str, default_position_id: int, pro_team_id: int, lineup_slot_id: int
) -> LabeledPlayer | None:
    """Sanitizes a player's name and resolves ESPN's numeric codes to display labels -- shared by
    roster.py and boxscore.py, which both parse this same entry shape (a lineup slot id plus a
    playerPoolEntry.player). Returns None when the name is unusable, same as sanitize_name's own
    empty-string signal, so each caller decides its own warning message (they differ: "on ESPN
    team {id}" vs "in matchup {id} ({side})")."""
    name = sanitize_name(full_name)
    if not name:
        return None

    return LabeledPlayer(
        name=name,
        position=POSITIONS.get(default_position_id, "?"),
        pro_team=PRO_TEAMS.get(pro_team_id, "FA"),
        lineup_slot=LINEUP_SLOTS.get(lineup_slot_id, "?"),
        is_starter=lineup_slot_id not in BENCH_SLOTS,
    )
