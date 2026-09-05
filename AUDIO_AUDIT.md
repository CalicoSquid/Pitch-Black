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
