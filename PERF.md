# PERF

`?perf=1` shows load milestones (ms since navigation start), per-pass GPU ms (EXT_disjoint_timer_query_webgl2,
mean of the last 120 frames), draw calls and triangles per frame, and the WebGL renderer string.
`node scripts/perf.mjs [W] [H]` runs it headless (HIGH tier, DPR 1) in three states: idle (default view),
x-ray (clock held at Press, 6 s settle), cycle (FULL playing, shadow map re-rendered every frame).

GPU: ANGLE (NVIDIA GeForce RTX 4090 Direct3D11). Headless rAF is vsync-capped, so frame = 16.67 ms
whenever the frame fits. GPU ms move ±50% between runs with the GPU's clock state; read them as ranges.

## Before (session 9, 032a15b + overlay)

Load, 1920x1080: script parsed 30 ms · textures built 1045 ms · shaders compiled = first frame 4020 ms
(the shaders compile inside the first render, about 3.0 s of it).

| 1920x1080 | GPU ms | shadows | main | reflection | SSAO | bloom | x-ray | outline | post | draws | tris |
|---|---|---|---|---|---|---|---|---|---|---|---|
| idle  | 2.4-6.4 | 0     | 0.4-1.6 | 0.6-1.7 | 1.0-2.0 | 0.3-0.4 | -    | 0    | 0.15-0.7 | 368 | 841k |
| x-ray | 4.5     | 0     | 0.45    | 0.96    | 0.78    | 0.40    | 0.25 | 1.44 | 0.26 | 596 | 1.27M |
| cycle | 5.0     | 0.63  | 0.58    | 0.69    | 0.96    | 0.46    | 0.27 | 1.14 | 0.32 | 554 | 856k |

2560x1440: idle 3.1 ms, x-ray 5.8 ms, cycle 6.1 ms GPU (SSAO 1.1-1.4 the largest pass); 60 fps holds.

Hitch: the first 3 s after the clock first enters x-ray measured 15.5 ms GPU and 25.8 ms frames
(reflection 7.2 ms): each part material that turns transparent compiles a new program variant on first use.

Not costs here (checked): x-ray materials are already plain alpha + brass edge lines (no transmission);
the shadow map already re-renders only when explode or the clock moves; procedural textures are
128-256 px canvases built once and cached; the reflection target is a fixed 1024², not full resolution.

## After (session 9, items 2-4)

Load, 1920x1080, three runs: script parsed 28 · stage (context + PMREM) 460 · geometry 930 · shaders
compiled 1490 · **first frame 1555-1583 ms** (was 4020). 2560x1440: first frame 1555 ms.

What moved it: every program compiles in parallel (compileAsync per assembly as soon as it is built,
against the composer's linear target; post-pass shaders unlit, like their quads), 3.0 s inside the
first frame -> 0.55 s after the geometry; the forend's arcs 72 points instead of 144 (its build 410 -> ~200 ms).

Hitches: the muzzle flash light came and went with its group, so every lit program had a second
variant (numPointLights 0/1): the first shot recompiled them all (83 ms frame). It now stays counted at
intensity 0. Transparent variants (dim, x-ray) and the outline pass's programs are warmed after the
first frame. Worst frame in every state now 16.8 ms (was 25.8 ms mean on the first x-ray, 83 ms on the first shot).

| state (reset per state, 2.5 s) | GPU ms 1080p | GPU ms 1440p | frame / worst | drawn/s | draws | tris |
|---|---|---|---|---|---|---|
| settled, no input | - | - | none drawn | 0 (was 60) | - | - |
| idle auto-turn | 6.9-7.3 | 7.4 | 33.3 / 33.5 | 31 (was 60) | 365 | 687k (was 841k) |
| x-ray held | 5.9-7.5 | 3.8 | 33.3 / 33.5 | 31 | 577 | 1.02M |
| cycle playing | 4.3-5.0 | 6.3 | 16.67 / 16.8 | 61 | 1031 | 1.71M |

The idle and x-ray GPU ms read higher than before because the GPU clocks down at 30 fps; per pass,
SSAO (now half resolution) and main stay the largest. 60 fps holds at 2560x1440 with no step dropped.
Adaptive quality, tested with a forced 25 ms render: SSAO off after ~1 s, reflection off after ~2 s,
DPR step skipped at DPR 1; header shows "· no SSAO · no reflection".
