# Beneath the Blue — a pixel-art love confession

A love confession told almost entirely through pictures, set in front of a huge
curved aquarium window inspired by SEA LIFE Bangkok Ocean World (Siam
Paragon). Two silhouettes walk up to the glowing glass and hold hands. Then
the tank answers for them: a school of trevally swirls into a heart around the
carved stone head, a message in a bottle sinks down, and the fish spell out the
words.

Everything is drawn in code, with no image or audio files. The fish, sharks,
eagle rays, sea turtle, jellyfish, rocks, statue, kelp, the couple and the
music are all generated when the page loads.

## The story (about 90 seconds)

1. **Title**: the tank glows, blurred, behind the title. Tap to dive in.
2. **Dive**: a curtain of bubbles rushes up the screen and the water wobbles.
3. **Arrival**: the camera pans across the panorama while the couple walks in and turns to face the glass.
4. **Hands**: they hold hands, a heart pops up, and she leans her head on his shoulder.
5. **The heart**: about 120 trevally leave their school and swirl into a hollow heart around the statue's face.
6. **Message in a bottle**: a bottle sinks to the glass. Tapping it sends out a ripple and a parchment letter unrolls.
7. **The words**: a wall of fish sweeps across the screen. Then about 190 glowing baitfish spell `I ♥ YOU`, and the question appears with **YES ♥** and **no** buttons. The "no" button runs away.
8. **Finale**: a pink flash and a burst of hearts. The couple share a forehead kiss while every trevally forms a giant beating heart. Jellyfish rise and hearts float up from the sand.

## Personalise it

Edit **`js/config.js`**. It holds the names, the letter, the question, the
words the fish spell, the button labels and the final card. Thai and other
languages work too: characters that aren't in the built-in pixel font are
drawn as crisp pixels from the system font.

For a quick test without editing, use URL parameters:

```
index.html?to=Mind&from=Tee
index.html?to=Mind&from=Tee&words=MARRY%20ME%3F&q=Will%20you%20marry%20me%3F
index.html?sound=0          # start muted
```

Keep `fishWords` short, about 2–10 characters per line. Use `\n` for a second
line.

## Run it

It's a static site with ES modules, so serve it over HTTP. Opening the file
directly with `file://` won't work.

```bash
npx serve .            # or: python3 -m http.server
```

To deploy, publish the folder as-is on GitHub Pages, Netlify or Vercel. There
is no build step.

## Tech notes

- **Pixel pipeline**: the scene renders into a low-resolution canvas, about
  640×360 on desktop. The size is chosen per device so every pixel scales by a
  whole number. On tall phone screens the window grows taller so the tank fills
  the screen.
- **WebGL2 post-processing** (`js/post.js`): pixel-exact upscaling, soft
  bloom, depth-of-field blur behind the letter, ripple and wobble distortions
  for transitions, flash and vignette. If WebGL2 isn't available it falls back
  to plain 2D.
- **Procedural art** (`js/art/`): each fish species is described as a shape
  (body outline plus fin shapes) and drawn pixel by pixel, so every size, tilt
  and swim frame comes out crisp and shaded. The ray is a flapping 3D surface.
  Rocks are piles of faceted boulders. The stone head is sculpted from a height
  map.
- **Depth**: layers scroll at different speeds (parallax), each depth band
  gets its own water tint, caustics play over rock tops and sand, and there are
  god rays, marine snow, bubble columns and a glossy floor reflection.
- **Behaviour** (`js/world/`): schools use flocking behaviour, and fish can
  also follow set paths to form shapes (the swirling heart, the lettering).
- **Director** (`js/story/story.js`): the whole piece is one async script
  built from waits, tweens and taps.
- **Sound** (`js/audio.js`): a music box and underwater hum synthesised with
  WebAudio. It starts on the first tap, and the speaker icon (top right) mutes
  it.
- **Loading**: only the sprites needed for the opening are drawn upfront.
  Everything else is drawn in the background a few milliseconds per frame, with
  nearest-size fallbacks, so the animation doesn't stutter.

### Dev helpers

- `?scene=tank|heart|bottle|letter|question|finale` jumps to a beat.
- `?speed=2` runs time faster.
- `tools/*.html` are art preview sheets (fish, creatures, environment, couple).
