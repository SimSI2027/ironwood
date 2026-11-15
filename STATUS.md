# STATUS - 2026-11-15, session 11 (stored tier, render cost, framing, receiver light)
- Tier: stored under "ironwood.tier.v2", written only by a click on the toggle; tiers saved by earlier builds (ironwood.q) are ignored (checked: old key low -> starts HIGH by GPU).
- Adaptive = render cost: GPU time of S.render() (timer query; ?perf=1 sums its pass queries), floored by the CPU time of the call; median > 20 ms over 1 s of drawn frames (>= 8). Skipped frames never count. RENDER_MS=10: no step; RENDER_MS=25: steps; THROTTLE=4 cycle: no reflection.
- Framing: the resting view was already 8.00% left/right at 1189x940, 1920x935, 1280x720, 390x844 (all 152,587 vertices). The clip was the idle auto-turn (360 deg at a fixed distance, -2.4% at 1189x940); it now dollies out just enough (26-direction hull per mesh, eased, never in).
- Full orbit, all vertices, worst side margin: 8.06 / 8.12 / 8.08 / 8.13% at the four sizes.
- Receiver: cool fill (lower right, 25% of the key, follows the receiver close-up) + lighter, rougher, isotropic wall steel. Luminance wall 5.6 -> 33, top flat 50, port edges 105-120 on HIGH, MED, LOW, shadows off; close-up peaks at 233 (< 92%).
- Look first 1) tones were measured headless on a 4090 as luminance of 3 regions; not seen on integrated graphics.
- 2) Without the timer extension (Safari, Firefox) cost is the CPU time of the render call, which under-reads a slow GPU.
- 3) The turn builds its hull at turn start (~150k vertices, one long frame while idle). D3D warning X4122 predates this. IRONWOOD_JOB.md is still untracked.
