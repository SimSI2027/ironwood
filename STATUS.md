# STATUS — 2026-11-15, session 4 (fixes 1-7, pump cycle 8-12, shipped)
- Done 1-7: pill fill (a cascade tie hid it), GPU-string / 12 ms probe + remembered HIGH/LOW toggle, 8% point-fit camera refit on resize, one-row pills (strip <700 px), dim keeps material at 30%/0.5 + brass rim, CSS gradient + reflective floor with contact band and light pool, screws, pin ends, knurl, checkering normal map, 0.4 mm bevels, bolt machining lines.
- Done 8-11: src/cycle.js keys every channel off c (forend, bolt, locking block, elevator, dented spent shell, crimped fresh shell); forend drag with orbit off; CYCLE panel; x-ray receiver + tick name card; tour cycle at 0.25x, so the tour is now 22.2 s.
- Done 12 + ship: job file edited but still untracked, as last session left it. Pages https://simsi2027.github.io/ironwood/ returned 200 with this build.
- Screenshots: cutaway-out/s4-{assembled,pill,eject}.png. Fixed after them, checked by pixel readback only: dimmed brass bloomed, Closed/Unlock labels overlapped, ejected shell popped out of the receiver top.
- Decisions: the probe times render + 1 px readback, not the rAF interval (a 60 Hz screen never averages <12 ms); default speed 0.25x; Play stops at Locked and snaps to Closed; using the cycle assembles the gun.
- Skipped: nothing failed twice. Left as is: the job file still says the tour is 20 s with "pump twice" (you asked for two edits only).
- Look first 1) receiver close-up (pill 04) on your 4090: headless drew ~1 frame/s, so shot 2 caught the dim fade mid-way; also the receiver's top edge saturates white.
- 2) the cycle at 0.25x and by dragging the forend: parts pass through each other (shell vs mag tube and barrel extension; the bolt runs 10 cm on a 7.5 cm slide). Judge whether the choreography reads.
- 3) phone: the low tier now draws the floor reflection too (scene rendered twice), and the dock is 219 px tall at 390x844. Check fps and that the gun isn't squeezed.
