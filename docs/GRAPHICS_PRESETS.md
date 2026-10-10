# Graphics presets

Players choose **Interface settings > Graphics quality**. The DM chooses
**Campaign > Settings > Interface > Graphics quality**, also available under
**Maps > Environment > Graphics quality**. Settings are saved in this browser,
using the existing `dnd-environment-quality` preference; they do not change the
campaign or another viewer's settings. Old High/Low/Off values still load.

| Budget | High | Balanced | Low |
|---|---:|---:|---:|
| Maximum render pixel ratio | 2 | 1.5 | 1 |
| Token shadow cube face | 512 | 384 | 256 |
| Maximum token shadow sources | 4 | 4 | 2 |
| Maximum map shadow texture | 2048 | 1024 | 512 |
| Dice shadow texture | 1024 | 512 | 256 |
| Maximum dice render width | 1440 | 1200 | 960 |
| Weather/decorative particle budget | 100% | 35% | 18% |
| Mist resolution fraction / ray samples | 50% / 24 | 25% / 12 | 25% / 12 |

Actual resolution also respects the device pixel ratio. All lights still
illuminate the scene in Low; only the strongest two receive token shadow maps.
Effects off uses Low resolution, removes mist/weather/decorative particles and
token/map shadows, and keeps lighting, darkness and fog. Character dice powers
remain visible at every preset. Dice capture their graphics budget when a roll
scene is created, so changing a preference does not resize an active roll.

Auto selects Balanced below 900 CSS pixels and High otherwise. This first
release does not measure device frame times or change model geometry. For a
slow wide-screen device, choose Low explicitly. Reduced-detail player meshes
and adaptive selection remain separate follow-ups.
