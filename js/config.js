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
    'ok so... every time we stand in front of all this blue,',
    'i forget the fish exist. no offense to the fish 🐟',
    "because i'm only ever looking at you 👀",
    '',
    'you make my whole world feel like this:',
    'calm, deep, and lowkey glowing ✨',
    '',
    "i don't just wanna visit this with you.",
    'i wanna keep coming back. always 💙',
    '',
    'yours (obviously), {from}',
  ],

  question: '{to}, will you be mine? 🥹',
  yes: 'YES 💙',
  no: 'no',
  noEscapes: ['nah', 'bro 😭', 'try again', 'nope 👀', 'pls 🥹'], // what "no" says as it swims away

  // Final card after "yes"
  finale: '{to} 💙 {from}',
  finaleSub: "ok it's official now 🥹",

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
    [20.0, 'yo... this place is lowkey beautiful 🌊'],
    [25.0, "but ngl i'm not even looking at the fish 👀"],
    [30.0, 'bro even nemo is staring at you 😭'],
    [34.2, 'remember when we first met? i was so awkward 💀'],
    [38.0, 'you laughed at me. best day ever tbh 🥹'],
    [44.0, "ok so... i've been meaning to say something"],
    [47.0, "my heart's been doing backflips for months 🐬"],
    [51.0, "ok ok here it goes... don't laugh 😭"],
    [54.0, '...'],
    // the hook
    [58.0, 'ALWAYS 💙'],
    [64.0, 'every version of me picks you. every time.'],
    [72.0, 'always 🫶'],
    [77.0, 'the fish are literally making a heart rn 😭'],
    [80.0, 'even the crabs are rooting for us 🦀'],
    [86.0, '{to} 🥹'],
    // verse two
    [94.0, "i'm bad at big speeches bro"],
    [101.0, 'so i asked the ocean for help 🌊'],
    [104.0, 'it said: just tell her 👀'],
    [107.0, 'ok here goes nothing 😭'],
    // the big chorus
    [139.0, 'ALWAYS 💙'],
    [153.0, 'far away? still you'],
    [161.0, '5 years from now? still you 🥹'],
    [167.0, 'always'],
    [171.0, "it's you. it's always been you 💙"],
    // outro
    [178.0, 'yo {to}...'],
    [185.0, 'thanks for every lil moment 🫶'],
    [192.0, "here's to a million more 🥂"],
    [199.0, 'always 💙'],
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
