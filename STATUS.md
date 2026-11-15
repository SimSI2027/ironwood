# STATUS - 2026-11-15, session 12 (final build run, v2.0)
- Shipped: 13 items + a 5-defect fix commit; tag v2.0 pushed; https://simsi2027.github.io/ironwood/ (and hero.png, preview.gif, ironwood.mp4) return 200 with the new build.
- AA: scene pass in its own MSAA target (8 HIGH / 4 MED), SMAA last on every tier (LOW now goes through the composer); DPR 2 / 1.5 / 1; outline full-res ~2 px. Creased normals (35 deg), 48-radial tubes, 24x12 springs, aniso 8.
- Camera: one rule, subject = 80% of the usable area: scripts/framing.mjs, every vertex, 25 states x 3 sizes in 70-85%. Idle = +/-20 deg sway (2.8-42.8 deg azimuth), no orbit. Tweens are cubic in-out; quality steps cross-fade.
- Grounding trade-off: the floor rose to -22 and the contact shadow must stay in view, so on short-wide screens (1902x935, 1280x720) the gun sits 15% above centre; it is centred at 1189x940 and 390x844.
- Receiver wall: a set light-to-dark reflection sweep (not the room's), luminance 30 -> 21 rear to front on all tiers (scripts/lum.mjs); one sample at x -19 still reads ~55, cause not found.
- Exploded view: fill +30%, 8 labels clear of parts and each other at 4 sizes; leaders: 0 crossings at the 3 check sizes, 1 left at 800x500.
- Muzzle: soft 15 cm bloom + short puff; found and fixed SSAO blacking out sprite quads on HIGH; Recoil tick label moved to 0.235 so the Muzzle tick covers the flash.
- Film: ?render + window.seek for capture.mjs; mp4 1920x1080 60 fps 12 s (7.6 MB), gif 640 px 15 fps (5.7 MB). Hero re-shot from film mode.
- Risks: 8x MSAA at DPR 2 is heavy on big screens (adaptive steps cover it); full-res outline cost ~20 ms in a throttled perf run; nothing seen on integrated GPUs. IRONWOOD_JOB.md still untracked.
