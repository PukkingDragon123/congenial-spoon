// ---------------------------------------------------------------------------
//  Personalise the confession here. Everything the viewer reads lives in this
//  file. Keep lines short — the whole piece is meant to be felt, not read.
//  Thai (or any language) works too; it is rendered as crisp pixels.
//
//  Quick overrides without editing: add URL params, e.g.
//    index.html?to=Mind&from=Tee
// ---------------------------------------------------------------------------
export const CONFIG = {
  to: 'Primprae',            // the person receiving the confession
  from: 'Me',           // the person confessing

  // Title card shown before diving in
  title: 'Very Cool Aquarium Game',
  subtitle: 'a little underwater adventure',
  tapToBegin: 'tap to dive in',

  // Written by the fish school in the tank (keep it short: 2-10 characters
  // per line; use \n for a line break)
  fishWords: 'I ♥ YOU',

  // The letter inside the bottle. {to} and {from} are replaced automatically.
  letter: [
    'Dear {to},',
    '',
    "I'm not good at saying this out loud,",
    'so I wrote it down instead.',
    '',
    'Every time I am with you, the day feels calmer.',
    'You make ordinary things feel special,',
    "and I don't think you even notice.",
    '',
    "I'd like to keep going places with you.",
    'This one, and all the ones after.',
    '',
    'Love, {from}',
  ],

  question: '{to}, will you be mine?',
  yes: 'yes',
  no: 'no',
  noEscapes: ['nope', 'try again', 'are you sure?', 'hmm', 'okay fine'], // what "no" says as it swims away

  // Final card after "yes"
  finale: 'I ♥ you',          // the ♥ is drawn as a little heart-shaped fish
  finaleSub: 'this is just the beginning',

  // Soundtrack. `music` is the file that plays and that the whole piece is
  // timed to; the story follows the song's clock, so swapping the track means
  // re-timing `lyrics` and the atSong(...) beats in js/story/story.js.
  sound: true,
  music: 'audio/always.mp3',

  // Words that drift up through the water, in song seconds. These are our own
  // lines written to the song's shape — replace them with anything you like
  // (including the real lyrics, if you have the right to use them).
  //   [ time, text, band ]   band: 'high' (default, open water up top) | 'low'
  // Each line starts where a sung phrase starts in the track (found by
  // measuring the vocal band of the song), so the words breathe with it.
  lyrics: [
    // the walk through the galleries
    [20.0, "okay, don't laugh 👀"],
    [25.0, 'I made this for you'],
    [30.0, 'it took me way too long'],
    [38.0, 'I wanted it to feel like a day out with you'],
    [47.0, 'just the two of us'],
    [51.0, "that's my favourite kind of day"],
    // the hook
    [58.0, 'I really like you'],
    [64.0, 'I have for a while now 👀'],
    [72.0, 'always'],
    [80.0, "I hope that's okay"],
    [86.0, '{to}'],
    // verse two
    [94.0, "there's one more thing 👀"],
    [101.0, 'I wrote it down'],
    // the big chorus
    [139.0, 'always'],
    [153.0, 'I mean it'],
    [171.0, "it's you"],
    // outro
    [185.0, 'thank you for being you'],
    [199.0, 'always'],
  ],
};

// URL parameter overrides (?to=..&from=..&q=..)
try {
  const q = new URLSearchParams(location.search);
  if (q.get('to')) CONFIG.to = q.get('to').slice(0, 24);
  if (q.get('from')) CONFIG.from = q.get('from').slice(0, 24);
  if (q.get('q')) CONFIG.question = q.get('q').slice(0, 40);
  if (q.get('words')) CONFIG.fishWords = q.get('words').slice(0, 24);
  if (q.get('sound') === '0') CONFIG.sound = false;
} catch (e) { /* ignore */ }

export const fill = (s) => String(s).replaceAll('{to}', CONFIG.to).replaceAll('{from}', CONFIG.from);
