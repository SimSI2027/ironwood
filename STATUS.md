# STATUS — 2026-11-15, session 2 (polish)
- Materials: walnut retuned (chocolate tones, uneven rings, pore dashes); steel/satin/bright/alloy get worn bright edges (curvature shader) + roughness mottle; steel deeper blued; lathe parts rotate anisotropy so streaks run along tubes (direction reasoned, not seen up close).
- Bevels: extrude bevels now have rounded normals (roundBevels in geo.js); all raw cylinders → chamfered rcyl; last BoxGeometry → rbox. No part shapes changed.
- Stage: ACES was crushing BG to #060609 → BG pre-compensated to 0x272a30 (reads charcoal). Floor raised to -32; unlit fade floor + faint blurred Reflector (desktop only) + soft VSM shadow catcher.
- Hover: leader anchors on the hit point (follows explode/pump), elbow polyline, card glides/flips; touch tap pins card, tap empty clears.
- Tour: fixed 0.08 rad camera snap at all 9 beat hand-offs; Tour button fills as progress; 5 s calm after.
- Phone: portrait framing swings along axis (measured fits x 21–370 of 390); bigger touch targets, landscape-short layout, pill scroll fade.
- Shots: cutaway-out/shot-polish1.png (desktop, BEFORE floor/BG fix), shot-polish2-phone.png (before framing fix). No console errors (only the 5 known ANGLE X4122 warnings).
- Unseen: desktop after BG/reflection fix, edge wear close-up, Reflector frame cost on a laptop GPU (renders scene twice).
- Probe flags barrel LatheGeometry (297 verts) winding agree=0.75 — not investigated. shot.mjs now takes SHOT_VW/SHOT_VH/SHOT_TAP.
