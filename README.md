## v1.65.1 — night ambience replacement

- Replaced the previous night/cricket bed with ES335-001's CC0 Freesound recording `crickets.wav` (sound 440574).
- Built a 4:13 seamless circular loop using a 5-second end-to-start crossfade; no synthetic cricket layers were added.
- Level-matched the replacement asset to the previous raw night-bed loudness (~-21.7 LUFS, -3.0 dBTP), so the v1.65 sleep-mix gains remain unchanged.
- The replacement is much less rhythmically repetitive than the previous bed; onset autocorrelation around the old ~0.5-second pulse drops from ~0.45 to ~0.06.
- No runtime audio gains, weather balance, scheduler logic, visuals, or world behavior changed.

## v1.65.0 — consistency pass

This release restores four product contracts that had drifted apart during recent performance/event work:

- **Controls auto-hide reliably:** every interaction now restarts one simple 4.2-second hide timer. A focused button no longer leaves the dock visible until the user taps elsewhere.
- **Weather audio is normalized as one sleep mix:** Calm insects are brought forward, Snow hush is meaningfully louder, and Rain is pulled back so changing weather no longer requires compensating with device volume. The v1.64.2 AudioContext startup/resume fix remains intact.
- **Snow sits on standing water/ice:** the permanent snow renderer now uses the same pooled surface as snowflake collision/deposition. Snow over a flooded/frozen basin is drawn as a layer on top of the pool rather than down on the buried terrain.
- **Refresh resumes established weather:** if Alive is already in Rain or Snow when the page reloads, the scene resumes at full established weather density (with normal browser/frame fade-in only) instead of replaying the long calm→weather arrival envelope. Genuine in-session phase changes still arrive gradually.
- **Snow + meteor interaction clarified:** an autonomous meteor impact during Snow is now a local hot impact on the snow/ice surface. It melts/steams/burns briefly and Snow can extinguish it naturally. Only the dedicated Ember phase gets the established whole-world water/ice purge behavior.

No event cadence, rare-event probability, lotus/bubble behavior, owl behavior, or Alive timeline duration was changed.
