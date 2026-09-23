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
    'Every time we stand in front of all this blue,',
    'I forget the fish, the lights, the people...',
    "because I'm only ever looking at you.",
    '',
    'You make my whole world feel like this:',
    'calm, deep, and full of light.',
    '',
    "I don't just want to visit this with you.",
    'I want to keep coming back. Always.',
    '',
    'Love, {from}',
  ],

  question: '{to}, will you be mine?',
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
  // Each line starts where a sung phrase starts in the track (found by
  // measuring the vocal band of the song), so the words breathe with it.
  lyrics: [
    // verse one: the walk through the galleries
    [20.0, 'some people feel like home'],
    [25.0, 'you feel like the whole ocean'],
    [30.0, 'quiet, and deep, and full of light'],
    [34.2, 'i still remember the first day'],
    [38.0, 'you laughed, and the room changed'],
    [44.0, "i've been carrying this for a while"],
    [47.0, 'like a message in a bottle'],
    [51.0, 'waiting for the tide to reach you'],
    [54.0, 'so here it is...'],
    // the hook
    [58.0, 'always'],
    [64.0, "in every lifetime, it's you"],
    [72.0, 'always'],
    [77.0, 'every wave comes back to the shore'],
    [80.0, 'the way i keep coming back to you'],
    [86.0, '{to}'],
    // verse two
    [94.0, "i'm not good with the big words"],
    [101.0, 'so i asked the whole sea'],
    [104.0, 'to say them for me'],
    [107.0, 'look...'],
    // the big chorus
    [139.0, 'always'],
    [153.0, 'no matter how far'],
    [161.0, 'no matter how long'],
    [167.0, 'always'],
    [171.0, "it's you"],
    // outro
    [178.0, '{to},'],
    [185.0, 'thank you for every little moment'],
    [192.0, "and every one that's still to come"],
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
