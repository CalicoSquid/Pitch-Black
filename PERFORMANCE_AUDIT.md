# Performance audit - 2026-09-05

This pass targets long-session resource retention and dormant work while preserving the existing scenes, sound levels, and weather tails. Existing local work, including WaterLifeLayer and the lotus changes, was retained. No deployment or commit was made.

## Measured results

Production builds before and after the changes were exercised in isolated Chromium contexts with service workers disabled. Figures below describe decoded PCM and canvas backing stores, not total browser/process memory.

| Scenario | Before | After |
| --- | ---: | ---: |
| Black screen, Sound enabled: PCM decoded | 138.15 MiB / 8 recordings | 0 MiB / 0 recordings |
| Black screen, Sound enabled: live buffer sources | 3 silent loops | 0 |
| Rain: PCM decoded since opening | 138.15 MiB | 19.70 MiB |
| Return from weather to black, after manual tails finish | 3 silent loops | 0 |
| Seven main canvas backing stores at 3840 x 2160, DPR 1 | 221.48 MiB | 106.82 MiB |

A separate 390 x 844 / DPR 3 Chromium run with 4x CPU throttling exercised 12 rain/snow/storm/mute cycles. After each cleanup, no buffer sources remained. Post-GC JavaScript heap samples were 4.03, 4.12, 4.21, and 4.24 MiB. These heap figures exclude native audio and canvas allocations. Synthetic visibility transitions suspended and resumed audio successfully.

## Changes

- Compressed audio warms sequentially in the HTTP/service-worker cache instead of eagerly decoding the whole bank. Warmup aborts when its effect is disposed, when AbortController is available. Gesture handling no longer repeats the bank warmup on every pointer/mouse/click event.
- Decoded buffers use a 32 MiB LRU retention budget, with pending-request deduplication and sample-rate-aware keys. Oversized recordings play without permanent cache retention. Active sources own their buffers independently, so this is a cache limit, not a total audio-memory limit. The redundant compressed-buffer copy before decoding was removed.
- Rain and snow create sources only while active or while their existing audible weather tail remains. Weather/audio envelopes use elapsed time independently of the capped particle-simulation step, so idle polling and slow frames no longer stretch the release envelope. Old source graphs still disconnect after their existing cleanup fades.
- Frequently changing rain, snow, fire, and rumble controls replace their previous automation history while carrying forward the current gain. Deliberate one-shot envelopes and the sleep fade are unchanged.
- Audio resume completions and delayed master reopening are invalidated on suspension. Rejected suspension promises are handled. An interrupted context is eligible for a resume attempt. Suspended ambience cleanup disconnects promptly.
- Fullscreen canvases retain their preferred DPR until they reach approximately four million backing pixels, or two million on browsers reporting at most 4 GiB device memory. High-resolution screens are rendered at lower raster density; CSS geometry is unchanged. Mobile-sized canvases below the limit retain their existing density.
- Black terrain now uses its idle cadence even when moisture remains. Wetness continues receding after standing water reaches zero, rather than becoming permanently latched. Material aging accounts for idle cadence.
- WaterLife avoids repeatedly clearing an already empty canvas. Rare layers allocate their noise fields on demand and stop their frame loops on completion, including on persistent test routes. Storm releases its inactive decoded-asset references.

## Validation

- Production TypeScript/Vite build: passed.
- Five focused tests: passed. Includes LRU eviction and replacement, 864,000 continuous audio updates (eight hours at 30 updates/sec), canvas budgets, interrupted-context recovery, and late-resume/background races. This is deterministic workload simulation, not an eight-hour device soak.
- Chromium and Firefox: sound enable, rain playback, snow transition, fade cleanup, and 4K allocation checks passed without page exceptions.
- Windows Playwright WebKit: visual transitions, allocation checks, and operation without Web Audio passed. This WebKit build exposes no AudioContext, so it cannot validate Safari audio.
- Mobile-size startup smoke checks: aurora, supernova, fog, owl, train, lotus, bubbles, and snow-fade routes rendered without page exceptions. This does not establish complete visual equivalence through every event lifecycle.
- A rendered Chromium rain screenshot was inspected. Local screenshots, JSON measurements, and baseline build are in `.perf-tools/` (gitignored).
- `git diff --check`: passed.
- Whole-repo lint remains blocked by existing findings: 23 errors and one warning, down from 24 errors and one warning before the pass. The removed error was the ambience ref write during render. No new lint findings were introduced. The remaining findings concern existing hook/ref patterns, unused initial assignments, const declarations, and the rain test prop dependency.

## Reproduction

Unit checks require only the repository dependencies:

```powershell
npm.cmd run build
npm.cmd run test:performance
```

Optional browser tooling is isolated from production dependencies:

```powershell
npm.cmd install --prefix .perf-tools --no-package-lock playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.perf-tools/browsers"
node .perf-tools/node_modules/playwright/cli.js install chromium firefox webkit
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

In another terminal with the same browser-path environment variable:

```powershell
node tests/browser-performance.mjs chromium
node tests/browser-performance.mjs firefox
node tests/browser-performance.mjs webkit
node tests/browser-soak.mjs
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can optionally point to an existing Chromium binary. Set `PERF_COMPARE_BASELINE=1` to also compare a preserved baseline served on port 4174. The measured Chromium run used the preinstalled Chromium 145; Firefox 155 and WebKit 26.6 came from the downloaded test tooling.

## Remaining confidence limits

Physical low-RAM Android/iOS devices, Safari audio interruptions, TV browser raster quality at the new resolution ceiling, real battery consumption, and a full-night wall-clock soak still need hardware validation. The checks above establish concrete reductions and lifecycle regressions covered by automation; they do not prove universal browser compatibility or zero memory growth in every scenario. First-use audio now decodes on demand; rare delayed cues still request their buffers ahead of playback, but slow devices may add first-use decode latency. Offline/service-worker cache behavior was not revalidated in these isolated contexts.

API background: [AudioBuffer storage](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer), [decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData), and [audio context interruption states](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state).

## v1.66.2 sunrise audio addendum

The new morning field recording does not change idle overnight PCM residency. An audible armed sunrise primes only its compressed ~1.2 MB MP3. The 32 kHz stereo recording is decoded only once the dawn progression reaches its late-morning audio region; decoded PCM is approximately 23.7 MiB and exists only while morning audio is active or snoozed within that alarm lifecycle. The buffer is reused rather than duplicated, and release/cancel/dispose clears the source, buffer, compressed copy, fetch/decode references and owned timers.

Focused tests cover deferred decode, one-source reuse, delayed decode cancellation, combined birds/chime sound check, and independence from nighttime mute. Physical low-RAM-device and full-night testing remain required; these code-level checks do not establish battery use or browser suspension reliability.

### v1.66.3 Sound Check → Arm memory boundary

The natural morning recording may occupy roughly 23.7 MiB as native 32 kHz stereo PCM, or about 35.5 MiB when represented at a 48 kHz Web Audio context rate. v1.66.3 ensures Sound Check cannot carry that decoded buffer into overnight armed waiting: arming stops transient playback, clears decoded PCM, retains only the ~1.2 MB compressed MP3, and defers the next decode until the late-dawn arrival region.
