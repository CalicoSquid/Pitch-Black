# v1.64.2 audio lifecycle note

- Fresh-load persistent loops are now created only after the shared AudioContext is actually `running`; no persistent source graph is built into an autoplay-suspended context.
- Real AudioContext `statechange` events drive readiness after browser interruption/resume. Any ordinary click/tap/key can satisfy a browser-required fresh-load gesture; a Sound off/on cycle is not required by TQW.
- Calm/Clearing/Rain-front night ambience is approximately 6 dB louder than v1.64.1. Source recording, loop points, weather mix and master headroom are otherwise unchanged.

# Audio release audit — v1.59.0

## Launch mix

- Night ambience: real field bed, deliberately subordinate; Calm phase gain 0.045 with slow presence windows 0.08–0.54 and 0.18 foreground ducking.
- Rain: real steady field recording, maximum runtime gain 0.34.
- Heavy rain: real field layer, maximum runtime gain 0.46 and only blooms at high rain intensity.
- Snow: procedural low-passed hush, maximum runtime gain 0.035.
- Storm bed: procedural low rumble retained, deep gain 0.017–0.035 and texture gain 0.0035–0.012.
- Thunder: real distant recording for most rolls; real heavy recording for rare strong grounded strikes. Distant one-shot gain about 0.078–0.135; close about 0.052–0.070.
- Owl: real field call slices, runtime gain 0.38. The Owl Abduction departure remains intentionally synthetic.
- Train: real environmental passage gain 0.18; isolated real horn gain 0.30.
- Ember / meteor: approved procedural design retained.

## Headroom check

The shipped field-recording peaks plus their runtime gains leave useful master headroom. The loudest sustained combination is steady + heavy rain; even a pessimistic same-polarity peak sum remains below full scale before the much quieter storm bed/transients. A master limiter/compressor is therefore not warranted for launch.

## Startup / lifecycle

- Sound OFF never creates audible output. Snow’s dormant procedural source now also initializes at true zero, eliminating its old brief startup swell.
- Sound ON prewarms the complete ~7 MB real-audio bank so first events do not wait on fetch/decode.
- A browser may legally block Web Audio after a fresh load until the first user gesture. The first pointer/touch/key interaction now retries resume in capture phase; no Sound-toggle cycle is required.
- Hidden/pagehide suspends Web Audio and cancels transient tails. Visible/pageshow attempts resume; gesture fallback remains installed for browsers that require it.
- Muting cancels the transient bus so an old thunder/owl tail cannot reappear after unmuting.

## Non-blocking follow-ups

1. Rain and Snow preserve silent source loops while Sound is enabled. This avoids breaking their deliberately long release envelopes; it is a small optimization opportunity, not a launch blocker.
2. A Train event uses wall-clock visual progress while Web Audio is suspended in the background, so a long background interval can cause a resumed train bed to be slightly out of sync. Rare and non-blocking.
3. Night ambience content remains the most subjective part of the mix. Its level/ducking is now structurally correct, but a sparser source recording could replace it later without architecture changes.
4. Keep/verify the source-page license for every field recording before public deployment.

## Approximate effective peaks at full master volume

These are conservative source-peak + runtime-gain estimates before filters and normal statistical non-coincidence of independent recordings:

- Night ambience at strongest Calm/presence window: about -40 dBFS.
- Train bed: about -31 dBFS; train horn: about -26 dBFS.
- Owl call: about -14.5 dBFS.
- Steady rain: about -10.4 dBFS.
- Heavy-rain layer: about -7.7 dBFS.
- Steady + heavy rain pessimistic same-polarity sum: about -2.9 dBFS.
- Distant real thunder at maximum configured gain: about -18.7 dBFS.
- Heavy/close real thunder at maximum configured gain: about -23.3 dBFS; it is intentionally lower in peak level but heavier in sustained low-frequency body.

The approved mix therefore retains master headroom without dynamics processing.
