# Production audio sources / rights checklist

## Verified CC0

- Night ambience / crickets: ES335-001 — `crickets.wav`, Freesound sound 440574. Creative Commons 0. Recorded at night in the Nile Valley near Naches, Washington using a Tascam DR08. The shipped `night-ambience-crickets-v2.mp3` is a seamless, level-matched derivative of this source.
- Train source: TRP — `180721 Distant train horn birds summer ambience STRATFORD.mp3`, Freesound sound 571073. Creative Commons 0. The shipped train bed and horn are edited derivatives of this source.
- Distant thunder: LukaCafuka — `Thunder 12`, Freesound sound 795412. Creative Commons 0. The shipped `thunder-distant.mp3` is an edited derivative.
- Heavy/close thunder: Littlebrojay — `long thunder edited.wav`, Freesound sound 195436. Creative Commons 0. The shipped `thunder-close.mp3` is an edited derivative.

## Source page still required before public deployment

The supplied ZIP renamed these masters generically, so their original source/license cannot be recovered reliably from the files alone:

- `rain.wav` -> `public/audio/rain-steady-loop.mp3`
- `heavy rain.wav` -> `public/audio/rain-heavy-loop.mp3`
- `owl.wav` -> `public/audio/owl-field.mp3`

Record the original source page and license for each before treating the audio bank as legally production-cleared. Do not infer a license from the WAV file itself.

## Sunrise wake-up — v1.66.2

- Natural dawn birds: zidzid — `Summer Dawn Birds, Phoenix Arizona`, Freesound sound 395322. Creative Commons 0 (CC0 1.0). Source: https://freesound.org/people/zidzid/sounds/395322/
- Supplied master: `395322__zidzid__summer-dawn-birds-phoenix-arizona.wav` (44.1 kHz, 16-bit, stereo, 1:43). Recorded at summer dawn in a central Phoenix courtyard with natural birds and faint distant city/air-conditioning ambience.
- Shipped derivative: `public/audio/summer-dawn-birds-phoenix-arizona.mp3`. The source is raised 5 dB, given a 6-second equal-power circular crossfade for a quiet repeat, resampled to 32 kHz stereo and encoded at 96 kbps. No synthetic bird calls are added.
- Runtime use: the compressed file is primed when an audible sunrise is armed, but decoded PCM is deferred until the latter part of dawn. It fades in with sunrise progress and is released when the alarm lifecycle ends. The procedural chime remains the clearer wake-time cue.
