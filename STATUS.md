# STATUS — 2026-11-15, session 3 (brought up to IRONWOOD_JOB.md v2; gap list in GAPS.md)
- Done 2e: tiers. High: 4096 VSM, GTAO, brass-only bloom (warm-keyed high-pass), outline pass, DPR 2. Low: no post, CSS vignette, inverted-hull hover outline, DPR 1.5. Picked by a 1 s probe (skips 10 frames, median >21 ms -> low); phones start low; ?q=high|low forces. Shadows re-render only when parts move.
- Done 2c: explode in 2 stages. Axial slide 0-0.5, then rows + part fan-out 0.45-1. Bolt/trigger move in stage 2 only; magazine x 12->18 so the barrel ring clears its cap; tour beats 0.62->0.7.
- 2a/2b/2d were already in the code: verified by reading, no changes. Tab title "src" -> IRONWOOD Mk I via scripts/build.sh (use it to build).
- Done 3: LICENSE -> ED, README rifle -> shotgun, git user ED + GitHub noreply, every commit re-authored, force-pushed.
- Decisions: 3 screenshots (your prompt) over the job file's 2; IRONWOOD_JOB.md left untracked as found.
- Screenshots (cutaway-out/s3-*.png) showed a blank model in high tier: bloom blurred NaN/Inf pixels over the whole frame. Fixed in the bloom high-pass, plus a clamp in the vignette pass that removed black specks. Verified by pixel probe only, not by eye.
- Skipped: nothing (no fix failed twice). Root source of the NaN/Inf pixels not found, only filtered.
- Look first: 1) high tier on your GPU, which nobody has seen since the fix: model visible, bloom strength, GTAO darkness.
- 2) explode 0.5-0.8: nested parts (forend on the magazine tube, bolt through the receiver roof, trigger pins) still pass through each other. 3) tour/explode frame rate on a laptop: the 4096 VSM blur re-runs every frame a part moves.
