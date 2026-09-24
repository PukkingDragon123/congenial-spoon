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
    "Okay. If you're reading this, you found the bottle. Good job. The bean would be proud.",
    '',
    "I've wanted to tell you something for a while, and every time I tried to say it out loud it came out as a joke. So I made a whole game instead. Very normal behaviour.",
    '',
    "I like your humour. You're the only person who can make me laugh at the worst possible moment.",
    "I like how you make a normal day feel like a good one without even trying.",
    "I like that you're just cool. Not trying to be. You just are.",
    "And your music taste is genuinely top 1. Every song you've shown me lives in my head now, rent free.",
    '',
    'Being around you makes ordinary days feel like a day at the aquarium: quieter, brighter, and I never want to leave.',
    '',
    'So I made you a tiny playlist. Three songs that sound like you:',
    '{gift}',
    '',
    'Love, {from}',
  ],

  // A little gift at the end of the letter: tap a song to open it on Spotify.
  gift: [
    { title: 'Blue Hair', artist: 'TV Girl', url: 'https://open.spotify.com/search/Blue%20Hair%20TV%20Girl' },
    { title: 'Harvey', artist: "Her's", url: "https://open.spotify.com/search/Harvey%20Her's" },
    { title: 'Lovefool', artist: 'The Cardigans', url: 'https://open.spotify.com/search/Lovefool%20The%20Cardigans' },
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
  // The instrumental that plays during the photo quest; the full song (with
  // the vocals) takes over when the quest is done.
  musicIntro: 'audio/always-instrumental.mp3',

  // Words that drift up through the water, in song seconds. These are our own
  // lines written to the song's shape — replace them with anything you like
  // (including the real lyrics, if you have the right to use them).
  //   [ time, text, band ]   band: 'high' (default, open water up top) | 'low'
  // Each line starts where a sung phrase starts in the track (found by
  // measuring the vocal band of the song), so the words breathe with it.
  // (Empty: the story is told without subtitles. Add lines here to bring
  // them back.)
  lyrics: [
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
