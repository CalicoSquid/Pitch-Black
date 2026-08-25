# this quiet world

A quiet persistent nighttime world for an unused screen.

## Netlify

This project is configured for Netlify in `netlify.toml`.

- Build command: `npm run build`
- Publish directory: `dist`
- Node: `22.16.0`

For a Git-connected Netlify site, deploy the repository/root folder as-is; Netlify will install dependencies and build automatically.

For a manual drag-and-drop deployment, run `npm ci && npm run build` locally and upload the generated `dist` folder.

## v1.32.0 quiet controls

### Alive overlay refinement

- Moon, Storm, and Fireflies no longer stop Alive; they remain normal additive overlays.
- Alive now keeps its own internal atmospheric overlay state so autonomous moonlight, lightning, and firefly blooms never overwrite the user's overlay choices.
- Blackout is visually separated from Snow/Rain/Ember in the dock.


- Simplified the main dock around a clearer mental model: `Alive` first, then base worlds, atmosphere layers, and only `Clock` + `Sound` as persistent one-tap utilities.
- Moved Sleep Timer, Volume, Keep Screen On, Fullscreen, Share, Reset and Install into one restrained settings sheet behind the top brand control.
- Made the top affordance explicit as `this quiet world •••` so the settings menu no longer depends on hidden discoverability.
- `Keep screen on` is now a proper toggle under Display rather than living inside the old Sleep popover.
- Fullscreen remains easy to reach from the settings sheet and can now also be toggled by double-clicking/double-tapping the world itself.
- First-visit guidance now includes the subtle fullscreen gesture hint.
- Renamed the dock label `Black` to `Blackout` to better communicate that it intentionally clears the visible world to pure black.

## v1.30.0 alive pacing

- Alive now visibly acknowledges activation on a calm/black world by gently bringing in the Moon, with a chance of suitable fireflies, instead of beginning with an apparently inert black screen.
- The first micro-event is now scheduled for roughly 3–8 minutes after activation rather than 12–30 minutes.
- The first proper weather front now arrives roughly 8–20 minutes after activation and is guaranteed to be Rain or Snow rather than another Calm phase.
- Once the opening ramp is over, Alive returns to slow nighttime pacing: Calm periods run roughly 15–50 minutes.
- Later Calm → Calm chaining was reduced from 50% to 25%; Rain and Snow fronts are now substantially more likely after a completed calm period.
- Toggling Alive off and back on still intentionally starts a fresh future from the current physical world rather than resuming an abandoned scheduler timeline.

## v1.29.0 alive world

- Added opt-in `Alive` mode: the world now runs itself through long calm periods, rain fronts, sustained rain, occasional storms, cold fronts, snow, clearing periods and rare meteor impacts.
- Alive uses weighted state transitions and cooldowns rather than a shuffle, so weather develops in plausible sequences and leaves breathing room between events.
- Added an internal `calm` state so accumulated snow, water, char and persistent fire remain visible between active weather systems instead of the world disappearing back to pure black.
- Rare micro-events can now happen without fanfare: slow moon halos, temporary firefly blooms at roughly 2.5–3× normal population, single shooting stars and occasional distant horizon flashes.
- Major meteor events reuse the existing Ember impact/fire simulation. Fire can persist into later calm periods and be cooled or extinguished naturally by later rain or snow.
- Alive never auto-enables sound. Existing Sound, Volume, Sleep Timer, Keep Awake, Clock and Fullscreen controls remain independent.
- Manual scene or atmosphere choices take control back from Alive immediately; switching Alive off leaves the current world consequences intact.
- Shared links can carry Alive mode, while still arriving muted.
- Storage namespaces were advanced for clean testing: world `v3`, preferences `v2`, and first-visit onboarding `v2`.

## v1.28.0 quiet discovery

- First-ever visit begins on literal black with a faint `this quiet world` / `touch anywhere to begin` whisper; the first tap, click or keypress dismisses it permanently.
- The existing control dock still reveals itself briefly on first load, so discovery does not depend on guessing where to click.
- Search metadata now describes the actual product: black screen, sleep/bedside use, ambient night sounds, weather, clock and fullscreen. Open Graph/Twitter metadata and structured WebApplication data are included.
- Added installable PWA plumbing: web manifest, app/touch icons, standalone black theme, service worker registration and offline cache behavior after an initial online load.
- The utility menu exposes `Install` only when the browser supplies a native install prompt.
- Clock position now migrates by only a few pixels over five-minute intervals to reduce a fixed OLED footprint; reduced-motion disables the drift.
- `Share world` creates a clean URL containing scene + Moon/Storm/Fireflies + Clock state. Shared links never auto-enable sound.
- Shared world parameters override the visual state on arrival, retain the visitor's volume preference, and always arrive muted so a shared link can never surprise someone with audio.

## v1.27.0 bedtime utilities

- Black is now a literal one-tap blackout: pure `#000` with Moon, Storm, Fireflies and Clock cleared, while audio is left alone.
- New compact Sleep panel with 30m / 1h / 2h / 4h audio fade timers.
- Sleep timers fade the master output over the final minute, then mute sound without changing the world.
- New persistent master volume control, independent of scene-specific audio balancing.
- Optional Screen Wake Lock keeps a bedside display awake for the current session when the browser supports it.
- New visitors begin on a true black screen; existing saved preferences remain respected.

## v1.23.0 storm ceiling

- Replaces scattered cloud banks with two oversized cached upper-sky ceiling contours.
- Storm gathering is now a slow 48–60 second descent from above, not a lateral arrival.
- Broad hanging reaches are part of the main ceiling edge and occasionally pass across the Moon.
- Moon luminance is invariant; Storm can only obscure it with physical cloud geometry.
- Clouds remain nearly black in ordinary darkness and lightning briefly exposes their folds/underside.
- Short-landscape screens use a shallower ceiling profile to preserve sky composition.
- Lightning bolt, thunder, wind and ground ecology behavior are unchanged.
