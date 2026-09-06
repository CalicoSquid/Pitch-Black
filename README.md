## v1.65.4 — audit hardening

- Snowflake motion, rotation, wind easing, loose powder and drift-material updates are now normalized to elapsed time / a 60 Hz simulation baseline instead of display refresh rate.
- The large cricket field recording is released whenever its Alive phase is genuinely inaudible, and muted mode suspends Web Audio instead of leaving an idle context running.
- Train visuals and audio now share the event's wall-clock start time. Resume/unmute continues the bed and horn from the correct point rather than restarting the journey.
- Owl field-recording playback validates both the live rare-event identity and the current transient-audio generation immediately before starting.
- Hero-event interruption gives train/lantern crossings and train audio a short exit fade instead of hard removal; rain loops now reach zero before their sources stop.
- Water-life scheduling targets frame deadlines and wakes immediately when lightning begins, so resting lotuses can catch brief flashes without running at weather-frame cadence.
- Service-worker install/activate/cache work is attached to the event lifecycle, navigation cache writes accept only valid HTML responses, and cache-write failures no longer poison successful fetches.
- The approved realistic moon remains visually unchanged, but its realistic lunar surface is now served from the bundled `/moon-realistic.webp` instead of a runtime NASA request. `/moon-texture.png` remains underneath as the existing local base/fallback.
- Owl decode completion now also checks a component-disposal flag, closing the remaining unmount race.
- Firefly/snow interaction checks are counted per fixed material-simulation step, so 30 Hz rendering cannot starve one flake parity group.
- Runtime cache writes remain owned by `event.waitUntil()` but no longer sit on the successful response path.

The approved recordings and core rare-event/weather visuals were not replaced or restyled in this pass.
