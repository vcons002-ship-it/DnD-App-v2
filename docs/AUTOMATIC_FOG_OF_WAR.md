# Automatic fog of war

Open **Fog** in the DM's main map toolbar. The **Automatic fog of war** section
has two switches, both enabled by default. Choices belong to the map and apply
in daylight, regular darkness and heavy darkness.

| Map fog | Token fog | Player view |
| --- | --- | --- |
| On | On | Unseen terrain and creatures are concealed by walls and closed doors. Explored terrain retains the existing shared grayscale memory. |
| Off | On | Walls do not conceal terrain; creatures still use personal sight and current party sightings. |
| Off | Off | Walls do not conceal terrain or creatures. Walls and closed doors still block movement and targeting. |
| On | Off | Map cover still conceals creatures on unseen terrain. |

Lighting, mist and other environmental effects retain their normal appearance.
Turning fog off does not grant line of sight for attacking or casting through a
wall. Closed doors block; open doors and existing sight openings let targeting
through normally.

**Regular darkness is dim light:** sight has no distance cap. Within the existing
60-foot darkvision range, unlit scenery and figures are brighter, retain more
color, and show enemy affinity. Beyond it, the scene remains visible with darker,
more muted colors; enemy affinity needs actual illumination.

**Heavy darkness:** unlit terrain and enemies remain hidden beyond the existing
60-foot darkvision range, even when both automatic fog switches are off. Distant
illuminated areas retain the existing light-visibility exception. These switches
only decide whether walls conceal the map and creatures, not the darkness range.
Shared explored terrain and current party sightings still follow their existing
memory and grayscale-awareness rules.

**Manual cover** is the existing paint/curtain system, now labeled separately.
It can still conceal terrain or creatures independently of automatic fog, as
can a creature's explicit **Hide from players** setting. Existing manual cover
and exploration history are preserved; toggling automatic fog does not erase
them or record the whole displayed map as explored.

New database columns default to enabled, preserving the automatic visibility
behavior of existing maps. These choices are included in campaign backups and
imports. Only the campaign's DM can change them.
