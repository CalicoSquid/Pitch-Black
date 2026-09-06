# v1.65.0 sleep-mix consistency note

## Persistent beds

The previous mix had a very large level spread: the real Calm night bed was roughly -58 LUFS after runtime gain while steady Rain was roughly -35 LUFS. That encouraged users to raise device volume during Calm/Snow and then be surprised by Rain.

This pass narrows the weather-bed envelope without adding compression or changing source recordings:

- Calm night ambience: source measured about -21.1 LUFS; runtime 0.24 presence × 0.26 Calm phase ≈ -45.2 LUFS before master output.
- Clearing night ambience: phase 0.18; Rain-front night ambience: phase 0.055.
- Steady rain: source measured about -25.4 LUFS; runtime gain reduced 0.34 → 0.20 ≈ -39.4 LUFS.
- Heavy rain: source measured about -29.2 LUFS; runtime gain reduced 0.46 → 0.25 ≈ -41.2 LUFS when that layer is fully present. It only blooms at high rain intensity and combines with steady rain.
- Snow: procedural low-passed hush gain increased 0.035 → 0.11. It remains softer than Rain but is no longer effectively inaudible at a volume chosen for the rest of the app.

The intent is not identical meter readings; Rain should still feel fuller than Calm/Snow. The contract is that no ordinary weather phase should require a major device-volume correction.

## Startup / resume

The v1.64.2 lifecycle fix is retained: persistent sources are created only when the shared AudioContext is genuinely running, real AudioContext state changes rebuild persistent ambience after interruption, and any normal user gesture can satisfy browser autoplay policy. TQW does not require a Sound off/on cycle.

# v1.66.2 sunrise morning ambience

The supplied zidzid/Freesound dawn field recording is now the natural morning bed for Sunrise Wake-Up. The shipped derivative measures about -29.2 LUFS integrated with a peak around -11.6 dBFS before runtime gain. Runtime morning gain is bounded independently from the chime; at the default wake level (35%) the fully arrived field bed is approximately -39 LUFS before device/system volume, while the maximum slider remains around -31 LUFS before device/system volume.

The original 44.1 kHz stereo WAV is not shipped. The web asset is a ~97 second, 32 kHz stereo MP3 at 96 kbps with a six-second equal-power circular seam and +5 dB source gain. Its decoded Web Audio footprint is approximately 23.7 MiB. That PCM is deliberately not retained overnight: arming primes only the ~1.2 MB compressed payload; decode waits until the latter part of dawn, and the buffer/source are released when the sunrise lifecycle ends.

The natural bed begins after 55% of the dawn ramp and rises smoothly with the visual progression. The chime remains the distinct wake-time cue. Snooze fades both down and allows the birds to return with the snoozed dawn rise; Finish, Cancel, preview exit and component disposal invalidate pending fetch/decode/playback before releasing resources.

## v1.66.3 sunrise audio hardening

Snooze now treats below-arrival progress as an explicit bird-silence state. The running field-recording source fades to the floor and is stopped instead of remaining alive at a stale low gain; the final three-minute snooze re-rise can start the bed again once sunrise progression crosses the normal arrival threshold. A zero wake-volume update uses the same explicit fade/stop path.

Sound Check no longer leaves decoded morning PCM resident when the user immediately arms an alarm. The controller retains the small compressed MP3, stops transient check sources/tones, invalidates pending decode/playback, and clears the decoded `AudioBuffer` before entering armed waiting. The field recording is then decoded again only when late dawn actually needs it. At 32 kHz stereo the nominal PCM payload is about 23.7 MiB; browsers that resample it into a 48 kHz context can account for roughly 35.5 MiB, which is why this Arm boundary matters for overnight residency.
