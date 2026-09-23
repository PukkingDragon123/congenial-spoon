# Beneath the Blue — a pixel-art love confession

A love confession told almost entirely through pictures, set to Daniel
Caesar's "Always". A couple walks through an empty, softly glowing aquarium
inspired by SEA LIFE Bangkok Ocean World: a jellyfish hall, a coral reef full
of clownfish, and finally the great window with the stone Buddha, where the
fish spell out the words.

All the art is drawn in code: fish, jellies, crabs, coral, the Buddha, the
couple and the whale shark are generated when the page loads. The only asset
is the song in `audio/`.

## The story (the length of the song, about 3:45)

Every beat is pinned to a moment in the track, and the whole tank moves with
the music: fish bounce and squash on the beat, waves ripple through the
schools, crabs wave their claws, and the light breathes with the song.

It plays like a little aquarium game at first, and only turns into a
confession at the turn of the song.

1. **Title** (before the music): "Beneath the Blue, an aquarium adventure". Tap to dive in and start the song.
2. **The Buddha tank** (0:05): a wall of foam reveals the great window. Goal: *say hi to the fish*. Tap creatures to make them react and collect pearls.
3. **Clownfish reef** (0:38): goal: *find the clownfish*. On the first chorus the whole reef throws a fish party.
4. **Jellyfish hall** (1:12): goal: *light up the jellies*. The couple quietly take each other's hand.
5. **The turn** (1:39): back at the Buddha tank a bottle sinks to the glass. Tap it and the letter unrolls. This is where the game stops pretending.
6. **The words** (2:16): foam rushes up for the big chorus, the minnows spell `I ♥ YOU`, and the question appears with **YES ♥** and **no**. The "no" button runs away.
7. **Finale**: after "yes", a whale shark glides in carrying a heart of minnows, the crabs line up to dance, and the minnows come home to frame the Buddha.

Lines of text drift up through the water between the beats, each letter in
its own bubble. They are in `js/config.js` under `lyrics`.

## Personalise it

Edit **`js/config.js`**. It holds the names, the letter, the question, the
words the fish spell, the button labels and the final card. Thai and other
languages work too: characters that aren't in the built-in pixel font are
drawn as crisp pixels from the system font.

`lyrics` is a list of `[seconds, text, band]` entries timed to the song. The
lines included are original words written to the song's shape; swap in your
own. If you change the song, re-time `lyrics` and the `atSong(...)` beats in
`js/story/story.js`.

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
- **Sound** (`js/audio.js`): plays the song and runs a live analyser on it,
  giving the scene a loudness level and a beat pulse. The story reads its
  clock from the track, so it stays in sync. Small effects (bubbles, chimes)
  are still synthesised. It starts on the first tap, and the speaker icon (top
  right) mutes it.
- **Galleries** (`js/world/rooms.js`): the jellyfish hall and the coral reef
  share the main tank's camera, couple and effects, so the story drives any
  of them the same way.
- **Loading**: only the sprites needed for the opening are drawn upfront.
  Everything else is drawn in the background a few milliseconds per frame, with
  nearest-size fallbacks, so the animation doesn't stutter.

### Dev helpers

- `?scene=tank|reef|jelly|bottle|letter|question|finale` jumps to a beat.
- `?sim=1` makes the story follow the simulated clock instead of the audio (for headless tests).
- `?speed=2` runs time faster.
- `?gl=0` forces the plain-2D fallback renderer (no bloom or blur).
- `tools/*.html` are art preview sheets (fish, creatures, environment, couple).
