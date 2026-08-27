# this quiet world

A quiet persistent nighttime world for an unused screen.

## Netlify

This project is configured for Netlify in `netlify.toml`.

- Build command: `npm run build`
- Publish directory: `dist`
- Node: `22.16.0`

For a Git-connected Netlify site, deploy the repository/root folder as-is; Netlify will install dependencies and build automatically.

For a manual drag-and-drop deployment, run `npm ci && npm run build` locally and upload the generated `dist` folder.

## v1.37.0 freeze / thaw

- Added a restrained frozen-surface state to the persistent terrain. Ice is not invented by Snow on dry ground: it forms from wetness and standing water left by Rain.
- Rain -> Snow now reads as a material transition: the wet terrain sheen gradually tightens into a broken glass-thin frozen skin, while deeper pools flatten and harden locally.
- Fresh snow gradually buries the frozen skin, so ice is most readable during the transition rather than becoming a permanent bright terrain outline.
- Rain now thaws ice progressively instead of switching it off. Early drops make far fewer liquid ripples and splashes; normal puddle behaviour returns as the surface loosens.
- Ember heat locally thaws frozen patches and can release a little steam before continuing to evaporate the underlying water.
- Ice state is persisted with the rest of the world and resampled safely across viewport changes. Existing saved worlds remain compatible.
- No snow particle design, accumulation ceiling, Rain/Snow/Ember pacing, Alive scheduling, audio balance or control layout was changed in this pass.

## v1.36.0 continuous alive

- Alive now keeps a small persistent wall-clock timeline instead of restarting from Calm every time it is enabled.
- Toggling Alive off and straight back on resumes the same weather phase, including Snow, Rain or Storm.
- Time away now matters: if Alive is re-enabled minutes, hours or days later, missed phase boundaries are advanced to the present and the world resumes wherever its autonomous weather should now be.
- The same catch-up runs when a backgrounded/sleeping browser returns, so throttled timers no longer freeze Alive's overnight progression.
- No weather visuals, phase durations, transition probabilities, terrain physics, audio balance, micro-event probabilities or UI layout were changed in this pass.

## v1.35.2 thunder body

- Removed the short bright band-pass “clap” transient from direct lightning strikes; it was reading as a ruler/desk snap rather than thunder on small speakers.
- Direct terrain strikes now produce a low-passed pressure-wave boom almost immediately after impact, feeding straight into the existing rolling thunder body.
- Close-strike timing now matches the apparent distance of a bolt visibly hitting the world, while distant/in-cloud thunder behaviour is intentionally unchanged.
- No visual, Alive pacing, weather, meteor, terrain or UI behaviour changed in this hotfix.

## v1.35.1 soft departures

- Alive snow and rain now keep separate long-release audio envelopes so weather sound recedes gradually instead of audibly switching off as a scene advances.
- Extended Alive visual departure tails as well: snow now takes roughly 46–61 seconds to thin away and rain roughly 34–46 seconds, while manual scene changes stay responsive.
- Replaced the old rectangular standing-water renderer with shallow elliptical pools and restrained curved highlights. The little pale “cubes” along wet terrain were literal `fillRect()` puddles.

## v1.35.0 weather breath

- Alive Snow now develops as an actual front: a handful of flakes arrive first, then visible population and accumulation build progressively over roughly one to two minutes instead of switching on a pre-populated full-screen snow canvas.
- Alive Snow now dissipates gradually as well, thinning to scattered final flakes while the accumulated terrain remains behind as evidence of the weather.
- Alive Rain can now arrive in two natural ways: either a fast downpour or a slower building front. Both routes use drop population as well as opacity so a gradual start reads as light rain rather than a dim wall of rain.
- Alive Rain always leaves with a long taper, progressively losing drops and sound before the final remnants disappear. Manual Snow/Rain remain responsive rather than inheriting the sleep-oriented Alive transition times.
- Brightened the persistent Alive star field without increasing star count, keeping it restrained but comfortably visible from bedside distance.
- Meteor timing and speed are intentionally unchanged in this pass.

## v1.34.0 bedside controls

- Restored the main dock as the single obvious control surface: Alive, Blackout, Snow, Rain, Ember, Moon, Storm, Fireflies, Clock, Sound, Fullscreen and More all live in one place.
- Fullscreen is a first-class one-tap control again while double-click/double-tap remains a shortcut.
- The top `this quiet world` wordmark is branding only. Settings now open from a dedicated More (`…`) button at the end of the dock, with the panel anchored above the controls.
- Removed the floating `Alive •` status and the extra dot on the Alive button. The selected Alive button plus subdued manual controls provide the complete mode feedback.
- Reworked first-visit guidance into comfortably readable, gentle onboarding that explains direct scene choice, Alive, and fullscreen without requiring discovery.
- Mobile now keeps labels and horizontally scrolls the same dock model rather than collapsing controls into unlabeled icons.
- Controls remain visible while settings are open, then auto-hide after inactivity; the desktop cursor disappears with them.
- Removed the redundant `move or tap to wake controls` helper text.

## v1.33.1 alive ambience

- Alive now has a sparse persistent star field with independent slow twinkle, dimming naturally as fronts, rain, snow and storms move through. Stars are part of Alive itself rather than a new user-facing toggle.
- Added a very quiet Alive-only nighttime audio bed when Sound is enabled: filtered night air plus restrained randomized cricket phrases during calm, clearing and early rain-front periods. Weather audio takes over naturally during rain, snow and storms.
- Rebuilt the moon-veil event from separate soft organic cloud bodies, removing the rectangular compositor box that could become visible against pure black.
- Shooting stars and meteor showers now travel much farther and more slowly, with longer trails. Their sky layer sits behind the terrain renderer, so low trajectories can continue naturally behind the horizon instead of simply terminating in mid-air.
- Alive's first small event now arrives in roughly 12–26 seconds, with later micro-events roughly every 38–92 seconds.
- The opening sequence now guarantees a real Rain or Snow phase within about 4.25 minutes. Later weather retains the slower overnight cadence.

## v1.33.0 living world

- Alive is now a complete autonomous state rather than an additive layer mode. Entering Alive clears manual atmosphere choices; touching Snow, Rain, Ember, Moon, Storm or Fireflies takes control back immediately.
- Added persistent, restrained Alive feedback: a small live status and pulsing indicator while manual world controls visually step back. Clock, Sound and utility controls remain independent.
- The Moon is now Alive's permanent visual anchor. Clouds and short moon-veils can obscure it, while occasional halos, firefly blooms, shooting stars and meteor showers create low-key activity between weather fronts.
- Alive's first micro-event now arrives within seconds, later micro-events recur roughly every one to two minutes, and weather fronts arrive on a minutes-not-hours cadence.
- Meteor showers are now distinct from rare actual impacts, so the sky can be active without constantly setting the terrain on fire.
- Reworked long-term snow accumulation around multiple shallow local drift ceilings. Visible flakes contribute far less terrain, mature drifts compact toward low rolling banks, and older oversized snow profiles are gently repaired while snow is active.
- Direct lightning strikes are now rarer than visible forks, but a ground hit in snow punches a broad crater, throws loose powder, leaves heat/char and a longer-lived glow, then gradually cools and can be reclaimed by later snow.
- Meteor impacts now crater snow more decisively and leave a stronger but finite afterglow. Char remembers an impact without acting as permanent fuel.

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
- At v1.30.0, toggling Alive off and back on intentionally started a fresh future; v1.36.0 later replaced that behavior with a persistent wall-clock Alive timeline.

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

## v1.33.2 meteor tail hotfix

- Meteor and shower tails now align opposite the actual screen-space trajectory in both directions.
- Fixes left-moving meteors rendering their trails down/in front of the meteor head.

## v1.42.0 — Ember reclaims the ground

- Promoted the approved lightning-depth landscape from experiment to normal world behavior.
- Removed the temporary developer depth-flash button and its styling.
- Storm now reveals the hidden ridge only on an occasional sufficiently strong lightning strike, with a long cooldown so bursts cannot repeat the effect.
- Alive can also produce a rare off-screen distant lightning reveal during wet/front weather, without requiring a visible bolt.
- Keeps the approved near-ridge tree silhouettes against lit sky, with only faint atmospheric terrain beyond.
- No changes to the accepted landscape artwork, scene controls, weather durations, or terrain physics.
