# GAPS: spec item -> what the code does now (first-3-seconds impact first)
1. Quality tiers (high: 4096 shadow, SSAO, brass bloom, DPR 2) -> one path for all: 1024 VSM shadow, no AO, no bloom, DPR capped 1.75
2. Soft bloom on brass -> none; brass reads only through its specular
3. SSAO where parts meet -> none; only the soft floor shadow grounds the model
4. Tier picked by a 1 s frame-time probe at load -> no probe; only the reflective floor is switched, by `pointer: coarse`
5. Low tier "no post, DPR 1.5" -> no post-free path exists: the hover outline and vignette live only in composer passes
6. Page title IRONWOOD Mk I -> browser tab reads "src" (build.mjs names the page after the folder)
7. Explode stage 1 "assemblies along the axis" -> every assembly moves diagonally (x, y, z at once)
8. Explode stage 2 after stage 1 -> part fan-out starts at e=0.42, overlapping the assembly move (0 to 0.68)
9. Shapes: 8 separate assemblies, bevels, real port hole, 40+ turn helix -> present (46 turns, no raw Box/Cylinder left)
10. Materials/light: walnut, worn blued steel, brass whitelist, charcoal, key+rim, PMREM, ACES -> present
11. 8 pills + fly-to + 25% dim, hover outline/card/leader, 20 s Tour, phone layout -> present
12. README (not on the page) -> calls the gun a "rifle"; the spec says pump-action shotgun
