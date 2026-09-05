## v1.62.3 — baseline recovery

- Removed the rejected Weird Friend / cat owl experiment completely and restored the v1.62.0 owl pool unchanged: 80% normal owl, 10% Owl Army, 10% Owl UFO.
- Restored Supernova to the original v1.62.0 timing, explosion size, circular gradient geometry and collapse behavior.
- Added only a restrained red/orange pre-explosion star phase: the star warms red and grows roughly 38% before ignition.
- Kept the original shockwave motion but made the ring thinner, warmer and less than half as opaque so it contributes impact without reading as a hard white graphic.
- Added subtle warm color to the original supernova gradient while preserving white/cream as the dominant light.
- No event cadence, overnight-stability lifecycle, weather behavior, Owl Army/UFO behavior or routine micro-event frequency changed.

## v1.62.0 — event density

- Added **Supernova**, a new silent 6–12 hour rare sky sighting: an ordinary-looking star blooms into a compact readable stellar explosion, then collapses back to a pinprick and disappears completely.
- Added **Owl Army** as a 10% branch of owl encounters. Owl cadence is unchanged: 80% remain the normal owl, 10% become Owl Army, and the existing 10% Owl UFO branch remains. Owl Army uses the single normal field-recorded hoot, then briefly reveals exactly twenty staring eyes (ten owl pairs) before all vanish together; there is no chorus.
- Airplane and Lantern encounters now retry in 5–11 minutes when their scheduled opportunity is blocked by weather, overlap, visibility or unsafe ground instead of discarding the encounter and waiting another full 45–140 minute interval. Successful encounters retain their original sparse cadence.
- Reduced-motion users now receive calm opacity-only versions of routine shooting stars, distant flashes, moon veils and meteor showers instead of having those event classes removed entirely. Motion remains suppressed; the world no longer becomes disproportionately empty.
- Added non-persistent QA routes `?test=supernova` and `?test=owl-army` for immediate visual review.
- The routine 38–92 second micro-event scheduler, all weather cadence, existing rare-event intervals and the v1.61.1 overnight-stability lifecycle remain unchanged.

## v1.61.1 — overnight stability

- Fixed Ember's long-session lifecycle so a meteor/lightning ignition no longer leaves the full world fire simulation awake forever after every visible/fuel-bearing trace has cooled.
- Ember now drops to a lightweight 5 Hz wake-check while genuinely dormant and returns to normal cadence immediately for a new meteor, lightning strike, scene activation or reset. The accepted meteor, fire, char, steam and weather-interaction behaviour is unchanged while active.
- Completed Ember impacts now release their transient meteor state instead of retaining a permanent completed-impact latch.
- Tightened Web Audio lifecycle cleanup across Ember, Rain, Snow, Storm and rare-event one-shots: stopped/completed sources, filters and gains explicitly disconnect instead of relying on eventual browser garbage collection.
- No visual design, event rarity, weather timing, audio level/mix, UI or world-event compatibility changes in this pass.

## v1.61.0 — world events everywhere

- Decoupled the persistent nighttime event engine from Alive weather control. Rare events, Ambient Life and routine sky micro-events now continue through manually selected Rain, Snow, Ember and composed atmosphere states.
- Alive still owns only autonomous environmental progression: choosing a manual scene keeps that scene fixed exactly as before, while returning to Alive reveals the persisted wall-clock weather phase that has continued underneath.
- Event compatibility now follows the environment actually on screen in manual mode. Manual Rain is treated as Rain, manual Storm as Storm and manual Snow as Snow, preserving existing exclusions and interactions such as Lantern refusing Ember and using its rain behavior in manual Rain.
- Pure Black is the sole event opt-out. Entering Black immediately clears any active sighting, but does not reset, pause or bank the long-term Aurora, Great Meteor, Airplane, Train or Lantern schedules; events due while Black is active are simply missed.
- Routine event fireflies are now tracked separately from Alive's persistent layer state, allowing temporary firefly surges to appear in manual worlds without leaking hidden Alive weather layers. Moon halo/veil micro-events still respect a manually hidden Moon.
- Switching between Alive and manual control no longer tears down the event scheduler, so event clocks keep their place across weather-control changes.
- No UI layout, event renderer, rarity interval, weather duration, audio mix, Lantern animation or manual-scene behavior was redesigned in this pass.

## v1.59.1 — Owl UFO QA hook + Black label

- Added non-persistent `?test=owl-ufo` QA route to replay the locked Owl Abduction sequence, including the real initial owl call and procedural mangled departing hoot. Production rarity/scheduling is unchanged.
- Renamed the visible control-dock label `Blackout` back to `Black`; behavior remains the same one-tap pure-black reset.

# this quiet world

A quiet persistent nighttime world for an unused screen.

## Netlify

This project is configured for Netlify in `netlify.toml`.

- Build command: `npm run build`
- Publish directory: `dist`
- Node: `22.16.0`

For a Git-connected Netlify site, deploy the repository/root folder as-is; Netlify will install dependencies and build automatically.

For a manual drag-and-drop deployment, run `npm ci && npm run build` locally and upload the generated `dist` folder.

## v1.59.0 — audio production readiness

- Final audio lifecycle/startup pass on top of the approved real rain, heavy rain, owl, train and thunder mix.
- When Sound is already enabled from a previous session, the complete ~7 MB production audio bank is now fetched/decoded up front so the first owl, train or thunder event cannot arrive late while its asset loads.
- Browser autoplay policy is handled explicitly: a fresh page load may keep Web Audio suspended until one real user gesture, but the first ordinary pointer/touch/key interaction now unlocks audio in capture phase. Users never need a mute/unmute cycle just to wake the graph.
- Autoplay-policy `AudioContext.resume()` rejection is intentionally swallowed until that legitimate user gesture rather than surfacing as an unhandled promise rejection.
- No mix-level changes in this pass: v1.58.8 quiet-night/train levels and v1.58.9 real thunder levels are preserved exactly.
- Fixed a pre-existing Snow startup artifact: its dormant procedural wind source now starts at true zero and only becomes audible when live snowfall density requests it.
- Final mix audit confirms substantial headroom at full master volume; no limiter/compressor is required for launch.
- Remaining non-blocking cleanup: Rain/Snow keep silent looping sources alive while Sound is on to preserve their long weather-release envelopes, and an already-running Train can drift slightly out of audiovisual sync after a long background suspension.
- Production-rights check remains separate from technical readiness: source-page licenses for every shipped field recording must be retained/verified before public deployment.

## v1.58.9 — real thunder

- Replaced the rejected cricket-only loop with a cleaner real night ambience bed built from the stable middle of the newly supplied field recording.
- Replaced Rain's procedural noise loop with two real field layers: steady rain as the foundation and heavy rain that blooms according to the existing live visual intensity.
- Weather audio follows the existing gradual Alive transitions: night ambience falls away through Rain Front, steady rain rises with weather density, and the heavy layer disappears first as rain eases.
- Replaced the normal synthetic owl hoot with real field-recorded call passages selected deterministically from several parts of the supplied owl recording. The intentionally mangled departing hoot in Owl Abduction remains procedural.
- Train visual/audio and Ember audio remain locked and unchanged.
- New ambience/rain/owl sources are test assets pending license/source-page confirmation before production deployment.
- Audio audit routes: `?test=night`, `?test=rain`, `?test=heavy-rain`, `?test=owl`, and the existing `?test=train`. Turn Sound on before judging levels.

## v1.58.6 — cricket cleanup trial

- Replaced Alive's procedural night-air/cricket synthesis with the approved CC0 field recording. One repeated source cycle was isolated, circularly crossfaded into a seamless 2:08 loop, gently cleaned, and encoded as a lazy-loaded web asset.
- Cricket ambience now breathes with Alive: full in Calm, softer in Clearing and Rain Front, and smoothly fades away during Rain, Snow, Cold Front and Storm rather than restarting on every phase change.
- Replaced the train's synthetic brown-noise bed, oscillator clacks and oscillator horn with edited material from the approved CC0 distant-train field recording.
- Split the train source into a darkened full-length environmental passage and a separate real two-blast distant horn. High frequencies were strongly reduced to suppress the source recording's bright daytime birds.
- Real train audio uses the steady ambience bus rather than the cancellable transient bus, fixing the previous issue where an in-progress train could remain permanently silent after returning from a backgrounded tab.
- `?test=train` now also enables the real cricket bed, with the real horn still arriving near the 12-second test mark.
- No visual train, weather rendering, Ember audio, owl audio, event scheduling or interface behavior was changed.

## v1.58.4 — train character grounding

- Visual-only train refinement; train audio is intentionally unchanged for the dedicated audio review next.
- Replaced rectangular carriage slabs with subtly crowned roofs, softened body corners, articulated inter-car bellows, darker underframes/bogies, and a more tapered passenger-cab silhouette.
- Darkened the train body substantially so the warm windows now carry most of the read and the vehicle feels embedded in the night rather than laid over it.
- Softened window geometry and varied individual window intensity/width to reduce the row-of-blocks look without making the train brighter.
- Added a tiny route-grade rotation so the consist follows the local contour instead of remaining mechanically level while the route rises/falls.
- Kept the v1.58.1 route, hill occlusion, cadence, weather behavior, performance cleanup, and all approved Ambient Life / rare-event behavior unchanged.

## v1.58.1 — train rethink + localhost/performance cleanup

- Rebuilt the rare Ambient Life passenger train at a readable distant scale: a dark locomotive and 4–5 carriages with warm, unevenly lit windows.
- The 70–120 second route now climbs and curves into perspective, passes behind a nearer invisible hill, briefly re-emerges, then disappears into a rising far ridge.
- Train sightings use a persistent 2–4 hour wall-clock cadence, are never allowed to overlap the Airplane, and are suppressed by full Storm and hero events.
- Rain attenuates and softly diffuses the windows, ground Fog naturally occludes the train through layer order, and active Snow receives a very faint warm surface pickup.
- Sound stays distant but audible: filtered rolling rail texture with a 25% chance of one distant horn.
- Added `?test=train` for immediate visual/audio iteration; the test crossing lasts 90 seconds and alternates direction on each repeat.
- Includes the v1.57.3 control-idle fix unchanged.
- Localhost now self-clears stale This Quiet World service workers/caches before Vite imports, and production workers never intercept Vite source-module paths.
- Removed React StrictMode double-mounting from the local test harness and put dormant Snow/Rain/Fireflies/Storm/base-black canvases on low-frequency heartbeats without changing active rendering cadence.
- Train audio is more legible while remaining distant; `?test=train` horns at ~12 seconds for fast review.

## v1.57.3 — control idle fix

- Fixed the bottom control dock staying visible after a button click because the focused button kept `:focus-within` active.
- Dock visibility is now controlled solely by the existing 4.2-second activity timer, so it fades after inactivity even when the last interaction was with a control.
- Keyboard, pointer, touch, wheel and legacy TV/projector activity still wake the controls through the existing idle hook.
- No world, Alive, event, audio, terrain, persistence, rendering or control-layout behavior was changed.

## v1.57.2 — live baseline

- Removed the visible developer Night Events lab and its Airplane / Owl UFO test buttons for the production baseline.
- Removed the now-unused developer-lab CSS and App-level trigger bindings.
- Locked production Airplane and Owl Abduction behavior remains unchanged, including the 10% UFO variant on successful owl sightings.
- No Alive scheduling, rendering, audio, weather, terrain, persistence, rarity, or event timing was changed in this release.

## v1.57.0 — owl abduction

- Removed Distant Dog from Ambient Life production scheduling, rendering/audio code, and the developer lab after the synthetic bark failed live testing. Airplane is intentionally unchanged.
- Added an ultra-rare Owl Abduction variant: successful Owl sightings now have a 10% chance to become `owl-ufo` while the accepted normal Owl remains the other 90%.
- The abduction starts as the normal owl sighting, then a mostly-dark saucer glides in, casts a restrained cold beam, lifts the owl's warm eyes from the terrain, and accelerates diagonally out of the sky.
- The normal owl call remains unchanged. The UFO variant adds only one faint rising/fading owl call as the craft departs; there is no spaceship hum, neon glow, UI acknowledgement, or standalone UFO schedule.
- Added a dev-only `Owl UFO` button under `More → Dev · Night events`; the existing Airplane dev trigger remains alongside it. No new URL test hook was added.
- Ambient Life persistence is bumped to v2 and now schedules Airplane only; stale v1 dog schedules are ignored.


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


## v1.47.0 — Hero rare events refinement

- Branched cleanly from the pre-animal v1.42.0 baseline; no stag/animal experiment code is present.
- Added a temporary five-button rare-event developer panel with true start/stop toggles.
- Added a slow desaturated Northern Lights / aurora performance.
- Added a Great Meteor / bolide with fragmentation, brief cold world illumination and delayed low boom when sound is enabled.
- Added a distant off-screen storm using the approved hidden-ridge silhouette language, with repeated horizon flashes and distant rain curtain hints but no local storm.
- Added low ground/water-hugging fog that drifts laterally and respects the current world floor.
- Added the Impossible Star: slow satellite-like travel, a dead stop, direction change, then impossible acceleration away.
- No production rarity scheduling yet; this build exists only to judge which events deserve to enter the real world.


## v1.48.0 — Hero event rebuild

- Replaced the rejected ribbon/path aurora renderer with one continuous low-resolution luminous field: noise-warped vertical folds, organic density variation, slow breathing motion, and restrained green with rare violet/magenta variation.
- Removed individually readable aurora ribbons, centre spines, and tentacle-like polygon geometry entirely.
- Rebuilt Great Meteor as a momentum-driven bolide with a history-derived trail whose older samples independently fade, widen, cool, and drift.
- Replaced the attached tail polygon and eased destination motion; the meteor now begins offscreen, maintains forward motion, and disappears behind the horizon with no possible visible stopping state.
- Reworked fragmentation as a few inherited-velocity fragments that peel subtly from the trajectory instead of fixed decorative streaks.
- Retained a restrained cold exposure lift and moved the distant boom timing to several seconds after the bolide disappears behind the horizon.
- Distant Storm, Impossible Star, Fog, Alive scheduling, weather, water/ice, lightning depth, and Ember interactions are unchanged.




## v1.56.1 — Distant dog synthesis retry

- Left the approved airplane event completely unchanged.
- Replaced the dog bark's short filtered-noise/triangle transient with a voiced synthetic call: descending fundamental, harmonic body, two-lobed “wuh-oof” envelope, restrained onset grit, canine-oriented formant shaping, and distance low-pass filtering.
- Preserved the existing dog patterns, answering-dog timing, Ambient Life scheduling, and dev test button so this pass tests the sound design only.

## v1.56.0 — Ambient Life I: airplane + distant dog

- Added the first non-blocking Ambient Life tier to Alive, separate from routine micro-events and rare/hero sightings.
- Added a tiny high-altitude airplane: only navigation/strobe lights are visible, crossing slowly over roughly 2.5–4 minutes with randomized direction, altitude drift and perspective scale.
- Airplanes can appear during calm, clearing, cold-front and snow phases, remain behind local precipitation, and yield to any active rare/hero sighting.
- Added a synthesized distant-dog event with restrained single, double and occasional far-answer patterns; it is audio-only and uses the existing transient audio bus so mute/background cleanup remains authoritative.
- Added persistent wall-clock scheduling for Ambient Life (`this-quiet-world-alive-life-events-v1`): airplane roughly every 45–100 minutes and dog roughly every 50–110 minutes. Missed/background sightings are advanced rather than replayed.
- Added a DEV-only `Ambient life` section inside More with direct Airplane and Dog bark buttons. Production builds contain no visible test controls and no new test URLs.
- Kept the existing Aurora QA URL hook and previous visual QA hooks unchanged.

## v1.55.1 — Aurora QA hook

- Added the non-persistent `?test=aurora` QA hook, using the production Aurora renderer against the calm night world with the Alive star field visible for representative inspection.
- Aurora test mode starts immediately and automatically replays every 100 seconds while normal Alive scheduling is suspended.
- The hook does not alter saved preferences, production rarity scheduling, Aurora visuals, audio, or world-state behavior.


## v1.55.0 — SEO foundation

- Locked the production canonical domain to `https://thisquiet.world/` across canonical, Open Graph and social metadata.
- Reframed the homepage title and description around the actual product category: a living black screen for sleep with ambient night sounds.
- Added `WebSite` + `WebApplication` JSON-LD with the final brand/domain, free-use offer data and consistent product description.
- Added `sitemap.xml` and advertised it from `robots.txt`; QA `?test=` URLs now self-mark `noindex, nofollow`.
- Upgraded first-visit copy to a semantic H1 and added a restrained, genuinely user-visible About section to the existing More panel so the app has crawlable explanatory content without disturbing the sleep experience.
- Normalized PWA/share naming and descriptions to the final This Quiet World brand.
- No scene, Alive, rare-event, audio, world-state, performance or display-compatibility behavior changed.

## v1.54.1 — Display / embedded-browser compatibility

- Added a non-invasive boot watchdog so unsupported or failed embedded browsers show a quiet compatibility message instead of an indistinguishable black screen.
- Made the no-JavaScript fallback visible against the black page.
- Added legacy mouse/click/touch/focus activity paths alongside Pointer Events so projector/TV remotes can wake the control dock and dismiss onboarding.
- Added matching legacy gesture paths for browser audio unlock without changing mute, volume, or scene audio behavior.
- Added a CSS focus-within failsafe so keyboard/remote focus reveals the dock even if pointer activity is unavailable.
- Lowered the production JavaScript syntax target to ES2017 for older browsers that support modules but not the modern Vite baseline.
- No scene, rendering, Alive scheduling, rare-event, persistence, performance, or world-state behavior changed.

## v1.54.0 — Release polish / event + audio audit

- Audited the full audio lifecycle across manual scenes, Alive, Storm, Ember and rare events without changing the approved Rain/Snow long-release sound behavior.
- Added a dedicated cancellable transient-audio bus for thunder, meteor/impact sounds, Owl and cricket chirps. Muting or backgrounding now permanently silences already-started / already-scheduled one-shots so stale tails cannot reappear after unmute or tab return.
- `getPitchAudio()` now refuses audio scheduling while the document is hidden rather than returning a suspended context; missed Owl calls, meteor booms and thunder therefore remain genuinely missed.
- Ember no longer creates meteor whoosh/impact audio at all while Sound is muted, and Snow audio shutdown now captures the correct source safely across rapid mute/unmute changes.
- Made Alive event hierarchy explicit: routine micro-events yield to all rare events; Distant Storm, Fog, Impossible Star and Owl share the rare-micro tier; Aurora and Great Meteor remain independent hero events and may still overlap each other naturally.
- Hero events now clear lower-tier transient garnish when they begin, and rare micro-events wait/retry around hero moments, while normal weather timing and persistent world simulation continue uninterrupted.
- Kept the non-persistent URL QA hooks (`?test=fog`, `?test=storm`, `?test=moon-veil`, `?test=owl`) for verification; they still do not alter saved production preferences.
- Cleaned one stale pre-v1.52 water-hole comment. No approved visuals, rarity cadences, weather durations, terrain physics or v1.52 performance behavior were intentionally changed.

## v1.53.0 — Owl

- Added Owl as a small Alive rare event: only two dim warm eyes appear just above the live terrain, blink twice with slight asymmetry, shift almost imperceptibly, then fade away. No owl body or silhouette is drawn.
- Added one restrained low, breathy owl call near the end of the sighting when sound is enabled; the visual remains complete when sound is off.
- Owl is scheduled independently at roughly 45–90 minute intervals, retries quietly when conditions are unsuitable, avoids active Storm and hero-event moments, and shares the existing subtle rare-event slot to prevent stacking.
- Added the non-persistent `?test=owl` QA hook, replaying the production Owl sequence every 15 seconds while normal Alive scheduling is suspended.
- No changes to Aurora, Great Meteor, Fog, Distant Storm, Impossible Star, weather timing, terrain physics, or the v1.52 performance optimizations.

## v1.52.0 — Surface coherence + performance pass

- Removed the legacy `waterOpen` local-hole state from the world model and render path. Lightning can still melt snow, boil moisture, ignite briefly and throw steam/sparks, but standing water and ice now remain one coherent level plane with no geometric strike cutouts.
- Lightning no longer locally deletes the frozen skin; heat response is communicated through steam, global recession/thaw and the existing fire suppression behavior instead of missing grid shelves.
- Capped the persistent world-base/material renderer at ~30 fps while keeping precipitation and hero-meteor motion independent, halving a large amount of repeated terrain/water/ice canvas work without changing world timing.
- Reused the terrain renderer's cached ground surface for water/ice rendering instead of recomputing the same terrain geometry for every surface segment.
- Reduced Snow/Rain high-DPI canvas caps from 2x to 1.5x; on 2x displays this cuts their backing-pixel workload by roughly 44% while preserving the soft precipitation look.
- Moved Rain terrain/ice evolution to a real-time-correct ~30 Hz material tick and Snow freezing to a ~20 Hz material tick, eliminating redundant whole-world simulation passes at high refresh rates.
- Persistent Ember simulation/rendering now uses a ~30 Hz organic-material cadence while meteor flight and fresh impact motion stay display-rate; completely dormant Ember state exits its render hot path immediately.
- Storm now uses a lightweight idle heartbeat when fully absent instead of running gust/cloud bookkeeping every animation frame.
- Aurora, Distant Storm, Impossible Star and Fog rendering are capped at ~30 fps where appropriate; Great Meteor remains display-rate. Fog's expensive density field keeps its existing slower update cadence.
- Reduced Rain/firefly collision scanning to one third of drops per frame with compensated probability, preserving the same stochastic interaction while removing repeated N×M checks.
- Visual QA URL hooks remain available and no accepted scene/event timing or art direction was intentionally changed.

## v1.51.1 — Visual QA URL hooks

- Added non-persistent URL-only visual test hooks with no visible developer UI: `?test=fog`, `?test=storm`, and `?test=moon-veil`.
- Fog test mode forces a calm visible terrain and automatically restarts the production fog every 90 seconds for repeated inspection.
- Storm test mode forces the real Storm layer and Moon on together for cloud-form, movement, occlusion and lightning testing.
- Moon Veil test mode forces the Moon on and replays the actual Alive Moon Veil every 30 seconds.
- Test parameters do not alter saved preferences or production Alive scheduling; removing the query parameter restores normal behavior.

## v1.51.0 — Organic fog and clouds

- Rebuilt contextual Ground Fog as a slowly evolving low-resolution density field instead of overlapping translucent banks/ellipses.
- Fog now uses warped multi-scale noise, irregular openings and gentle vertical shear, then clips against the live terrain / snow / water surface so it genuinely hugs the world.
- Reworked Storm cloud generation into continuous atmospheric ceilings with long irregular fronts, torn undersides and sparse hanging wisps rather than rounded cloud-body construction.
- Preserved Storm gathering/clearing timing, Moon occlusion, lightning reveal, thunder, wind, terrain strikes and Alive behavior.
- Replaced Alive's passing Moon Veil micro-event (previously five CSS ellipses) with a single procedural cloud-density field.
- Removed stale unused radial-gradient cloud CSS so production cloud rendering no longer contains the old overlapping-ellipse approach.

## v1.50.0 — Rare events production pass

- Removed the five temporary rare-event developer toggles and all App-level test state/callback plumbing.
- Removed the developer-control CSS; the reusable rare-event canvas layers remain as production Alive renderers only.
- Kept the approved Aurora and Great Meteor hero-event visuals and their independent persistent rarity schedules unchanged.
- Kept Distant Storm, Impossible Star and contextual post-rain Fog integrated as non-interrupting Alive micro-events.
- Retained event completion/cleanup behavior, persistent wall-clock scheduling, missed-sighting behavior, and rare overlap rules.
- Cleaned stale rare-event lab comments and bumped the PWA cache/version for a clean production deploy.

## v1.49.3 — Great Meteor physical rework

- Great Meteor is now clipped against the live terrain/snow/water surface, so the head, fragments and trail are progressively occluded and the bolide genuinely disappears behind the world instead of shining through semi-transparent terrain.
- Deepened and slightly accelerated the terminal trajectory so it commits below the horizon with no possible visible skim or stop.
- Simplified the hero read to three smooth continuous strokes: a diffuse atmospheric wake, luminous body and short hot front, eliminating visible stitched trail segmentation.
- Enlarged the warm-white fireball, strengthened the incandescent shoulder joining head to trail, and added an extremely restrained atmospheric bloom for scale.
- Reduced fragment prominence and kept the lingering ionized train, subtle horizon glow, restrained world exposure lift and delayed boom.
- Aurora, Alive rarity scheduling, Distant Storm, Fog, Impossible Star and all five DEV toggles are unchanged.

## v1.49.2 — Great Meteor smoothing pass

- Refined Great Meteor again after live testing: the trail now reads as a smoother continuous bolide streak rather than visibly segmented stitched segments.
- Enlarged and brightened the meteor head so it feels more like a substantial rare-event body instead of a small pinhead.
- Added restrained warmth near the hottest front of the meteor and immediate leading trail while keeping the overall effect elegant and minimal.
- Softened wake drift/turbulence, reduced fragment prominence, and preserved the lingering ionized train, restrained exposure lift, horizon exit acknowledgement and delayed boom.
- No changes to Aurora, Alive rarity scheduling, Fog / Distant Storm / Impossible Star behavior, or the DEV toggles.

## v1.49.0 — Rare events enter Alive

- Promoted Aurora and Great Meteor into Alive as independent persistent wall-clock hero events while keeping their v1.48 renderers unchanged. Aurora now lands on a randomized roughly 6–10 hour cadence and Great Meteor roughly 3–6 hours.
- Hero schedules persist across sessions and advance while the app is closed/backgrounded. Missed sightings are not replayed on return; the world simply schedules the next one.
- Aurora and Great Meteor do not interrupt weather and may, extremely rarely, overlap naturally with one another.
- Promoted Distant Storm and Impossible Star into a separate restrained Alive micro-event cadence. Distant Storm retries around incompatible local rain/storm conditions; Impossible Star waits for a suitably clear phase.
- Ground Fog is now contextual rather than clock-random: after local Rain/Storm clears, sufficiently wet terrain has a chance to develop the existing low fog a few seconds later.
- The three subtle rare events share one slot so Distant Storm, Fog and Impossible Star do not visually stack on one another. Existing normal Alive micro-events remain unchanged.
- Retained all five temporary DEV toggles for direct testing and the next visual-polish pass.


## v1.49.1 — Great Meteor polish

- Refined Great Meteor so it reads more like a rare bolide than a standard shooting star: brighter heavier head, hotter near-core, broader atmospheric wake, and a more irregular turbulent trail.
- Reworked the meteor trail into layered history-based passes: a diffuse outer train plus a brighter inner spine with slight variation instead of one clean uniform stroke.
- Added a brief lingering ionized train after the meteor itself is gone, helping the event leave a subtle atmospheric aftermath.
- Tweaked fragmentation toward smaller shedding sparks with soft halos and short-lived diverging tails, keeping the effect restrained rather than explosive.
- Added a tiny horizon acknowledgement flash at disappearance to imply physical scale without turning the event into a dramatic explosion.
- Aurora, event rarity logic, Alive integration, Fog, Distant Storm, Impossible Star, and all DEV toggles are unchanged.


## v1.57.1 — Owl Abduction polish

- Removed the bright center line from the UFO beam; the beam is now only the soft translucent field.
- Reworked the normal owl call into two distinct rounded hoots with a short silence between them.
- Owl eyes now shrink as they rise into the beam, adding a stronger sense of height and distance.
- Saucer motion, event timing, 10% owl-abduction rarity, airplane behavior, and the departing mangled hoot are unchanged.

