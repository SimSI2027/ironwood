# Ironwood Mk I

![Ironwood Mk I mid-cycle: the spent shell leaving the ejection port](docs/hero.png)

An interactive 3D exploded view of a walnut-stocked pump-action shotgun, built entirely in code with three.js. No models or textures are loaded: every part, material and shader is procedural, and the built page is one self-contained HTML file.

**Live:** https://simsi2027.github.io/ironwood/

The pump cycle is a hand-keyed animation of one parameter: the forend, action bars and bolt run back 7.5 cm, the spent shell leaves through the side port, a fresh shell backs out of the magazine tube and rises on the elevator, and the forend pushes forward to chamber it.

## Controls

- **Drag** to orbit, **scroll** or pinch to zoom.
- **Explode** slider takes the rifle apart and puts it back together.
- **Hover** a part (or **tap** on touch) to see its name and assembly. A tap pins the card, and a tap on empty space clears it.
- **Cycle** panel: scrub the timeline or press play (the ticks name each stage: Closed, Unlock, Eject, Lift, Feed, Locked), step with the arrow buttons, and pick 1x, 0.25x or 0.1x speed. On a phone the panel is one row; the chevron opens the steps, ticks and speeds.
- **Drag the forend** along the barrel to pump it by hand (orbit pauses while you hold it).
- **Tour** plays a guided camera sequence. Any input hands control back to you.

## Credits

- [three.js](https://threejs.org/)
- [Nyxera0x/cutaway](https://github.com/Nyxera0x/cutaway), the cutaway skill this project was built with.
- Barlow Condensed and JetBrains Mono fonts, embedded in the build.

## License

MIT
