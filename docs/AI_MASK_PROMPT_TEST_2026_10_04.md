# Window and natural-interior prompt comparison

The window prompt now asks for ordinary visible windows, including artwork
drawn on a wall face, rather than emphasizing gaps in walls:

```
Paint every visible window and viewing slit in this battle map solid blue (#0000FF), including windows shown on wall faces. Mark only windows actually shown. Keep the map unchanged otherwise.
```

The natural-boundary pass is restricted to enclosing cave and underground
interior rims. Outdoor rock formations, riverbanks, cliffs and bridges are
excluded. Structural walls and light prompts are unchanged. It still receives
the structural wall mask as its reference and only imports newly painted green:

```
This is a second pass for natural interiors only. Add a single continuous bright green (#00FF00) line, about 10 pixels wide, along the outer edge of the rock rim enclosing each cave or natural underground chamber. Leave entrances and passages open. Ignore outdoor rocks, cliffs, riverbanks, bridges and other exterior scenery. Keep existing yellow marks and all other map pixels unchanged. If there are no natural interiors, add no marks. Preserve exact framing. No labels.
```

## Real API test

The configured image API, `gemini-3-pro-image`, processed the same 1536 x 1024
field/cabin/cave artwork as the prior experiment. The structural mask was reused
unchanged to isolate these changes. No returned candidates were manually edited
or deselected. The new window response was reused for the final natural-pass
comparison; the final gallery therefore combines separate API responses.

- Window response: two front-facing windows painted blue, three other visible
  windows missed. Both detected windows fit the existing wall caps.
- Conversion: the former structural-wall minimum span discarded these small
  panes. Window extraction now operates at map resolution with a small noise
  filter, grouping immediately adjacent panes. Both fitted windows pass sight
  and block movement in shared geometry checks.
- Natural response: only the cave is marked; outdoor river rocks are unmarked.
  The first revised response still closed the outer cave entrance. A follow-up
  using the final prompt leaves the entrance open. Sight and a small-radius
  movement check from (1120,240) to (1250,130) both pass.
- Remaining issue: the API draws both inner and outer cave-rim outlines despite
  the request for a single line. The converted result contains eight wall
  shapes. Inspect the draft before applying it.
- The yellow bridge markings remain from the unchanged structural pass. This
  change does not fix that structural false positive.

[Raw masks and converted geometry](https://dnd.nic024i.app/uploads/previews/field-cabin-cave-prompts-20261004/)
are published on the existing DnD domain. Raw local evidence is retained under
`assets/maps/experiments/field-cabin-cave-prompts-v2-20261004/` and
`assets/maps/experiments/field-cabin-cave-prompts-v3-20261004/`.

Typecheck and the full server suite passed (1,649 tests). The added regression
checks small divided windows on a full-resolution map and verifies they remain
two windows instead of being discarded or joined into one. Live campaign data
and the running app installation were not changed; only a new static preview
folder was published there.

## Window-only follow-up

At the user's request, remove the clause about windows on wall faces:

```
Paint every visible window and viewing slit in this battle map solid blue (#0000FF). Mark only windows actually shown. Keep the map unchanged otherwise.
```

One fresh image-API request on the same original map detects four windows:
two front-facing and two back-facing. All four fit the unchanged wall geometry.
The parser and fitting logic are unchanged from the prior comparison; no
candidates were manually corrected. This is an improvement on this run, not
a guarantee across maps or repeated generations. No natural or structural
wall request was rerun.

[Raw response and fitted windows](https://dnd.nic024i.app/uploads/previews/field-cabin-cave-windows-v4-20261004/).
Local evidence: `assets/maps/experiments/field-cabin-cave-windows-v4-20261004/`.
Typecheck and all 1,649 server tests passed again.
