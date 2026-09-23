// ---------------------------------------------------------------------------
//  Personalise the confession here. Everything the viewer reads lives in this
//  file. Keep lines short — the whole piece is meant to be felt, not read.
//  Thai (or any language) works too; it is rendered as crisp pixels.
//
//  Quick overrides without editing: add URL params, e.g.
//    index.html?to=Mind&from=Tee
// ---------------------------------------------------------------------------
export const CONFIG = {
  to: 'You',            // the person receiving the confession
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
    'Every time we stand in front of all this blue,',
    'I forget the fish,',
    'the lights, the crowd...',
    '',
    'because I am only looking at you.',
    '',
    'You make my whole world feel like this:',
    'calm, deep, and full of light.',
    '',
    'Love, {from}',
  ],

  question: 'Will you be mine?',
  yes: 'YES ♥',
  no: 'no',
  noEscapes: ['nope!', 'too slow', 'try again', 'hehe', ':('], // what "no" says as it swims away

  // Final card after "yes"
  finale: '{to} ♥ {from}',
  finaleSub: 'our story starts here',

  // Soundtrack. `music` is the file that plays and that the whole piece is
  // timed to; the story follows the song's clock, so swapping the track means
  // re-timing `lyrics` and the atSong(...) beats in js/story/story.js.
  sound: true,
  music: 'audio/always.mp3',

  // Words that drift up through the water, in song seconds. These are our own
  // lines written to the song's shape — replace them with anything you like
  // (including the real lyrics, if you have the right to use them).
  //   [ time, text, band ]   band: 'high' (default, open water up top) | 'low'
  lyrics: [
    // nothing is said until the turn of the song
    [104.0, "i'm no good"],
    [109.0, 'at saying the big things'],

    [142.0, 'always'],
    [150.5, 'still always'],
    [158.0, 'and after that'],

    [174.0, 'every tide'],
    [182.0, 'comes back to you'],
    [191.0, 'always'],
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
