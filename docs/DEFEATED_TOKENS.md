# Defeated tokens

In 3D mode a confirmed-dead creature becomes a small bone skull lying face-up
on a dark pewter base. Its figure, lantern, combat badge, condition rings,
health bar, name, reveal tag, and initiative badge stop rendering. Click its
base to open the same token info. Fog, shared sight, ownership and base-only
selection rules still apply. The token itself remains in the campaign.

A monster is dead at zero HP or with a Dead condition. A player character is
dead only at three failed death saves or with a Dead condition. A PC at zero HP
still has its figure and health/status indicators while making death saves.
Objects are not dead creatures. Restoring the creature's living state restores
its original model. This visual change does not change resurrection/healing rules.

In 2D mode the flat skull is retained as a fallback, also without dead labels.
The 3D marker is a textured GLB reconstructed from front, back, left and right
reference art. Both Hunyuan shape and texture generation use the four named
views. It replaces the earlier procedural geometry. Source art, the prompt and
verified generation/reduction receipts live in
`assets/miniatures/object-provenance/death-skull`.
The asset is preloaded whenever either 3D token mode is enabled, and its parsed
geometry and textures are shared by all skull copies. Each viewer downloads
one cached GLB, rather than one asset per defeated creature.

Attack, spell, healing/buff, and stance target lists exclude confirmed-dead
creatures by default. **Show Dead** beside the target list opts them back in.
The option applies to this viewer's lists, never another player's preferences.
It does not expose fog-hidden enemies or allow targeting creatures visible
only through another party member. Attack distance sorting is unchanged;
downed allies remain available for healing. Choosing Show Dead does not make
ordinary healing resurrect a dead PC.

Verification: `client/src/lib/deadTargets.test.ts` checks life-state distinctions,
public enemy death, filter toggling, distance/map scope and shared-sight rules.
`e2e/death-marker-preview.spec.ts` runs player and DM views, overhead/45-degree
rendering, skull clicks, target filtering, downed/Dead PC changes, and monster
restoration against a disposable campaign.
