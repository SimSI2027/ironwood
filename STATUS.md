# STATUS - handover, 2026-11-15, v2.1 (project closed)
1. IRONWOOD Mk I: an interactive three.js pump-action shotgun, all geometry and textures in code. Fire, work the pump, explode 8 assemblies, hover for names, 20 s tour. Live: https://simsi2027.github.io/ironwood/
2. Build: `sh scripts/build.sh` (needs the cutaway skill's build.mjs in ~/.claude/skills; npm install for the font) writes docs/index.html, one self-contained file; log goes to logs.txt.
3. Where things live: src/ one file per assembly (barrel, magazine, forend, receiver, bolt, trigger, stock, pad) plus cycle.js (clock t: FIRE 0-0.30, PUMP 0.30-1), fire.js, stage.js (scene, tiers), main.js (UI, camera, labels), tour.js, perf.js, lib/.
4. Checks: scripts/shot.mjs (screenshot + console errors), framing.mjs (80% fill rule), lum.mjs (receiver wall luminance), cards.mjs, probe.mjs, perf.mjs (see PERF.md). Film: ?render + window.seek, captured with the skill's capture.mjs into docs/ironwood.mp4 and preview.gif.
5. Shipped: tags v1.0, v2.0 (release with the film), v2.1; Pages serves docs/ from main. ref/ (the drawing), IRONWOOD_JOB.md, cutaway-out/ and logs.txt are git-ignored.
6. v2.1: fill-light lift and the 8 labels now fade in over explode 0.5-0.8; receiver bright spot was the rear screw head, now a dull material (34 vs 30 wall); history checked: only "ED" + a GitHub noreply address.
7. Leftover: one leader crossing at 800x500 (0 at the three main sizes).
8. Leftover: on short-wide screens (1902x935, 1280x720) the gun sits 15% above centre to keep the contact shadow in view.
9. Leftover: 8x MSAA at DPR 2 is heavy on big screens (adaptive steps cover it); nothing tested on integrated GPUs; the film and gif were not re-rendered for v2.1 (the fill change shows only mid-explode).
10. Docs: README.md (title, live link, controls, tiers, credits), PERF.md (measurements), LICENSE (MIT).
