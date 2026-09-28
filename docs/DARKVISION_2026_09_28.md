# Personal dungeon vision

Enabled Night and Dungeon map environments use the accepted campaign rule:
each player sees within 60 feet of their own placed character. Regular darkness
is dim, colored vision; heavy darkness is nonmagical darkness rendered grayscale.
Lanterns (20 feet) and revealed placed light pools retain color and affinity
outlines. Unlit token affinity outlines/dots are hidden. Lights do not extend the
60-foot horizon. The DM retains the full map overview.

The server filters tokens and creature lists separately for every viewer and
limits live drag broadcasts accordingly. Encounter tags are assigned only when
a creature reaches a placed party character's range, in addition to existing
active-map and manual-fog rules. Tags already revealed remain stable.

The client mask follows committed animated movement, pan, tilt and rotation,
and remains enabled when environment quality is Off. Players without their own
placed token have no dungeon view yet. Existing fog/hidden-token rules still
apply. Painted dungeon walls do not automatically block sight.

Environment, weather, lights, and darkness settings remain saved per map using
the existing environment persistence. No save migration is needed. This is a
fixed campaign vision mode, not a species-specific or wall-raycast rules system.

Verification: server tests cover two-player isolation in both broadcast orders,
60-foot boundaries, movement, hidden/fogged creatures and carried lights, DM
visibility, and encounter numbering. The production-browser demo exercises both
darkness levels, the real lantern control, click-drag movement, a second player's
independent view, overhead projection, and effects-off enforcement.
