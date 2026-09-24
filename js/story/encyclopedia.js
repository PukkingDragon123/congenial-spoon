// The encyclopedia: every animal has a picture cut into a four-piece jigsaw
// and four fun facts. Each photo of it reveals one piece and one fact; a
// finished jigsaw earns a keychain of that animal for your camera strap, and
// finishing every animal from one tank earns that tank's camera banner.
import { makeCanvas, clamp, bayer } from '../util.js';
import { renderFish, fishSprite, SPECIES as FISH } from '../art/fish.js';
import { renderJelly, renderComb, renderOctopus, OCTO_FRAMES, renderCrab, renderRay, renderTurtle, JELLY_FRAMES, CRAB_FRAMES, RAY_FRAMES, TURTLE_FRAMES } from '../art/creatures.js';
import { diverSprite, treeSprite, DIVER_FRAMES, TREE_FRAMES } from '../art/divers.js';
import { dolphinSprite, seahorseSprite, DOLPHIN_FRAMES } from '../world/friends.js';

export const PIECES = 4;

// Field notes: size, what it eats, where it lives.
export const NOTES = {
  jelly: ['bell up to 40 cm', 'plankton', 'coastal seas worldwide'],
  nettle: ['bell up to 50 cm', 'plankton, fish eggs, other jellies', 'the Pacific coast'],
  bigjelly: ['bell over 2 m', 'fish, plankton, other jellies', 'cold northern seas'],
  comb: ['a few cm', 'plankton, fish eggs', 'every ocean, even the deep'],
  crystal: ['bell up to 25 cm', 'other jellies, plankton', 'the Pacific coast of North America'],
  manowar: ['float about 30 cm, tentacles 10 m+', 'small fish and shrimp', 'the warm open ocean surface'],
  octopus: ['palm-sized to 5 m across', 'crabs, clams, fish', 'rocky reefs and seafloors'],
  clown: ['about 11 cm', 'algae and tiny plankton', 'Indo-Pacific reefs, in anemones'],
  tang: ['up to 31 cm', 'plankton and algae', 'Indo-Pacific reefs'],
  butterfly: ['most 12-22 cm', 'coral polyps, tiny animals', 'warm reefs worldwide'],
  snapper: ['up to 1 m', 'fish, crabs, shrimp', 'warm coasts and reefs'],
  minnow: ['3-10 cm', 'zooplankton', 'big schools near the surface'],
  trevally: ['up to 85 cm', 'fish, squid, shrimp', 'reefs and open water'],
  giant: ['up to 1.7 m', 'fish, squid, even seabirds', 'the Indo-Pacific'],
  batfish: ['up to 70 cm tall', 'algae, jellies, small animals', 'Indo-Pacific reefs'],
  grouper: ['up to 2.7 m', 'fish, crabs, even small sharks', 'Indo-Pacific reefs'],
  crab: ['pea-sized to 4 m legspan', 'almost anything', 'every ocean, and on land'],
  shark: ['up to 3.2 m', 'fish, rays, squid', 'warm coasts worldwide'],
  reefshark: ['up to 1.6 m', 'fish, octopus, crabs', 'Indo-Pacific coral reefs'],
  ray: ['palm-sized to 2 m wide', 'shellfish, worms, shrimp', 'sandy seafloors'],
  turtle: ['up to 1.5 m', 'seagrass and algae', 'tropical oceans worldwide'],
  whaleshark: ['up to 18 m', 'plankton and tiny fish', 'warm oceans worldwide'],
  dolphin: ['2 to 4 m', 'fish and squid', 'warm and temperate seas'],
  seahorse: ['1.5 to 35 cm', 'tiny shrimp, all day long', 'seagrass and reefs'],
  bean: ['exactly one bean', 'facts', 'wherever there is trivia'],
  treefriend: ['tree-sized (it wishes)', 'sunlight, allegedly', 'the reef corner'],
  me: ['just right', 'snacks', 'behind the camera'],
  us: ['two people', 'shared snacks', 'the big tank'],
};

// Real facts for real animals; the made-up friends get made-up facts.
export const FACTS = {
  jelly: [
    'No brain, no heart, no bones. Still doing great.',
    'A moon jelly is about 95% water.',
    'The four rings on top? Those are its gonads. Yes, really.',
    'Jellyfish have drifted through the sea for over 500 million years.',
  ],
  nettle: [
    'Its trailing tentacles can grow several metres long.',
    'Each tentacle is covered in thousands of tiny stingers.',
    'Leatherback sea turtles eat sea nettles, stings and all.',
    'Jellyfish aren\'t fish at all. Not even a little bit.',
  ],
  comb: [
    'Those rainbow lights are just sunlight bouncing off tiny beating hairs.',
    'Comb jellies swim by paddling eight rows of little combs.',
    "They're not true jellyfish, and most of them don't sting.",
    'Some comb jellies glow blue-green in the dark.',
  ],
  crystal: [
    'Its glow comes from a protein that won a Nobel Prize in 2008.',
    "That green glowing protein (GFP) is now used in labs all over the world.",
    "It's almost completely see-through.",
    'It eats other jellies, including other crystal jellies.',
  ],
  manowar: [
    "A man o' war isn't one animal. It's a colony of tiny ones working together.",
    'The float is a gas-filled bag that works like a sail. It goes where the wind goes.',
    'Its tentacles can reach over 10 metres long.',
    'It can still sting even after it washes up on the beach. Look, don\'t touch.',
  ],
  octopus: [
    'An octopus has three hearts and blue blood.',
    'Most of its neurons are in its arms, so each arm can kind of think for itself.',
    'It can change colour and skin texture in under a second.',
    'Octopuses can squeeze through any gap bigger than their beak.',
  ],
  bigjelly: [
    'The lion\'s mane is the largest known jellyfish.',
    'Its tentacles were once measured at 37 m, longer than a blue whale.',
    'Little fish shelter between its tentacles to stay safe.',
    'One jelly, Turritopsis, can turn itself young again. Forever.',
  ],
  clown: [
    'A coat of slimy mucus keeps anemone stings from hurting it.',
    'Clownfish are born male. The biggest one turns female.',
    'Each anemone has one boss female, one dad and some kids.',
    'Dad guards the eggs and fans them with his fins until they hatch.',
  ],
  tang: [
    'A spine by its tail is sharp as a scalpel.',
    'That spine is why tangs are also called surgeonfish.',
    'Baby blue tangs are yellow before they turn blue.',
    'They nibble plankton and algae, which helps keep reefs healthy.',
  ],
  butterfly: [
    'Many have a fake eye spot near the tail to fool predators.',
    'Lots of butterflyfish pair up and stay together for years.',
    'Some eat almost nothing but tiny coral polyps.',
    'At night their colours go dull so they\'re harder to see.',
  ],
  snapper: [
    'Named for how fast they snap their jaws shut.',
    'Some snappers can live more than 50 years.',
    'Many school together by day and hunt at night.',
    'They have sharp, pointy canine teeth, like a dog.',
  ],
  minnow: [
    'In a big school, predators struggle to pick out just one.',
    'A school turns all at once by feeling the water move.',
    'The organ that feels it runs down each side: the lateral line.',
    'One school can hold thousands of fish.',
  ],
  trevally: [
    'Trevally hunt in packs, herding little fish into balls.',
    'A deeply forked tail makes them fast, strong swimmers.',
    'Some follow sharks and rays to grab fish they scare up.',
    'Shiny silver sides help them vanish in open water.',
  ],
  giant: [
    'Giant trevally can reach 1.7 m and 80 kg.',
    'Some leap out of the water to catch seabirds. Mid-air!',
    'Anglers call them GTs, and they fight hard.',
    'They patrol reef edges and drop-offs looking for food.',
  ],
  batfish: [
    'Baby batfish pretend to be drifting dead leaves.',
    'They eat seaweed that would otherwise smother coral.',
    'They get taller and rounder as they grow up.',
    'Curious by nature: they often swim right up to divers.',
  ],
  grouper: [
    'Groupers suck prey in whole with a huge gulp.',
    'Many groupers start life female and later become male.',
    'Some team up with moray eels to hunt. Real teamwork.',
    'The goliath grouper can weigh over 300 kg.',
  ],
  crab: [
    'Crabs walk sideways because their legs bend best that way.',
    'They wave their claws to show off and warn rivals.',
    'To grow, a crab climbs out of its old shell and puffs up.',
    'A lost leg or claw can grow back over a few moults.',
  ],
  shark: [
    'Sand tigers gulp air at the surface so they can hover.',
    'Scary teeth, calm personality: they rarely bother people.',
    'Their teeth show even when the mouth is closed.',
    'Sharks have been around for over 400 million years.',
  ],
  reefshark: [
    'Whitetip reef sharks can lie still on the sand and still breathe.',
    'Sharks never run out of teeth. Lost ones get replaced.',
    'They can sense the tiny electric buzz of hidden prey.',
    'Reef sharks keep reefs healthy by catching sick fish.',
  ],
  ray: [
    'Rays are flat cousins of sharks, with skeletons of cartilage.',
    'Eyes on top, mouth underneath. Perfect for the seafloor.',
    'They hide under sand with only their eyes peeking out.',
    'They find buried snacks by sensing electricity.',
  ],
  turtle: [
    'A resting sea turtle can hold its breath for hours.',
    'Mums swim back to the beach where they hatched to lay eggs.',
    'Warmer sand hatches more girl turtles.',
    'Sea turtles swam alongside the dinosaurs.',
  ],
  whaleshark: [
    'The whale shark is the biggest fish in the world.',
    'Huge, but gentle: it eats tiny plankton.',
    'Every whale shark\'s spots are unique, like a fingerprint.',
    'It can grow longer than a bus.',
  ],
  dolphin: [
    'Every dolphin has its own signature whistle, like a name.',
    'Dolphins sleep with half their brain at a time.',
    'They find food by clicking and listening for echoes.',
    'They breathe air through the blowhole on top of their head.',
  ],
  seahorse: [
    'Seahorse dads carry the babies and give birth.',
    'The dwarf seahorse is one of the slowest fish there is.',
    'Each eye moves on its own, so it can look two ways at once.',
    'Some seahorse couples greet each other with a dance each morning.',
  ],
  bean: [
    'Part bean, part dog, all trivia.',
    'A Mameshiba will tell you a fact whether you asked or not.',
    'Wears a scuba suit because beans sink. Allegedly.',
    'Favourite hobby: bubbles. Second favourite: more bubbles.',
  ],
  treefriend: [
    'It is not a tree. It is a very committed actor.',
    'It waves at everyone. Everyone.',
    'It lives in an aquarium and is scared of water.',
    'The leaves are fake. The friendship is real.',
  ],
  me: [
    'A photographer in her natural habitat.',
    'Spotted near jellyfish, holding a camera very seriously.',
    'Runs on snacks and good lighting.',
    'Hasn\'t noticed who\'s at the reef yet.',
  ],
  us: [
    'Two people, one aquarium, no plans. Perfect day.',
    'First seen together at the big tank.',
    'Rarity: legendary. Obviously.',
    'Side effects include smiling at old photos.',
  ],
};

// Finish every animal in a set for its camera banner.
export const SETS = [
  { id: 'jelly', name: 'Jelly Hall', keys: ['jelly', 'nettle', 'comb', 'crystal', 'bigjelly', 'manowar'], cols: ['#a878ff', '#ffd6f4'] },
  { id: 'reef', name: 'Coral Reef', keys: ['clown', 'tang', 'butterfly', 'crab', 'octopus'], cols: ['#ff7a2a', '#fff6ea'] },
  { id: 'deep', name: 'Great Tank', keys: ['trevally', 'minnow', 'snapper', 'batfish', 'giant', 'grouper', 'shark', 'reefshark', 'ray', 'turtle'], cols: ['#2a78f0', '#a8e8ff'] },
  { id: 'legend', name: 'Legends', keys: ['whaleshark', 'bean', 'dolphin', 'seahorse', 'treefriend'], cols: ['#ffc830', '#ff5ac8'] },
  { id: 'us', name: 'Just Us', keys: ['me', 'us'], cols: ['#ff4a82', '#ffc8dc'] },
];
// ...and the whole notebook: the golden Always banner (and a pearl keychain)
SETS.push({ id: 'always', name: 'Always', keys: SETS.flatMap((q) => q.keys), cols: ['#ffd84a', '#fff6d0'] });
export const setOf = (key) => SETS.find((s) => s.id !== 'always' && s.keys.includes(key));

// ----------------------------------------------------------------- art --
const PW = 64, PH = 46;          // jigsaw picture size
const cache = new Map();

// The animal itself, as the game draws it.
function animal(key) {
  switch (key) {
    case 'jelly': return renderJelly(22, 3, 'pink');
    case 'nettle': return renderJelly(16, 3, 'nettle');
    case 'bigjelly': return renderJelly(30, 3, 'violet');
    case 'comb': return renderComb(14, 2);
    case 'crystal': return renderJelly(22, 3, 'crystal');
    case 'manowar': return renderJelly(16, 3, 'manowar');
    case 'octopus': return renderOctopus(18, 2);
    case 'crab': return renderCrab(18, 0, 0, 'red');
    case 'ray': return renderRay(40, 2);
    case 'turtle': return renderTurtle(40, 3);
    case 'bean': return diverSprite('bean', 0);
    case 'treefriend': return treeSprite(0);
    case 'dolphin': return dolphinSprite(0);
    case 'seahorse': return seahorseSprite(1, 1.2);
    case 'whaleshark': return renderFish('whaleshark', 60, 0);
    case 'shark': case 'reefshark': return renderFish(key, 56, 0);
    case 'me': case 'us': return null;
    default: return renderFish(key, key === 'minnow' ? 30 : 44, 0);
  }
}

const BG = { jelly: ['#2a1060', '#6a3ab8'], reef: ['#0c3a7a', '#3aa0e0'], deep: ['#0a2a6a', '#2a7ad8'], legend: ['#3a1450', '#e070a0'], us: ['#3a1030', '#e8709a'] };

// The full jigsaw picture for a species (photo: the player's best shot, used
// for the two of them).
export function picture(key, photo = null) {
  const ck = key + (photo ? '|p' : '');
  if (cache.has(ck) && !(photo && cache.get(ck).src !== photo)) return cache.get(ck);
  const c = makeCanvas(PW, PH), x = c.ctx;
  const [top, bot] = BG[(setOf(key) || SETS[2]).id];
  const g = x.createLinearGradient(0, 0, 0, PH);
  g.addColorStop(0, bot); g.addColorStop(1, top);
  x.fillStyle = g; x.fillRect(0, 0, PW, PH);
  // soft light rays and a few bubbles
  x.fillStyle = 'rgba(255,255,255,0.08)';
  for (const rx of [10, 30, 50]) { x.beginPath(); x.moveTo(rx, 0); x.lineTo(rx + 6, 0); x.lineTo(rx - 4, PH); x.lineTo(rx - 10, PH); x.fill(); }
  x.fillStyle = 'rgba(255,255,255,0.5)';
  for (const [bx, by] of [[6, 38], [8, 31], [57, 12], [55, 20], [52, 6]]) x.fillRect(bx, by, 1, 1);
  const img = photo || animal(key);
  if (img) {
    const s = Math.min((PW - 4) / img.width, (PH - 4) / img.height, photo ? 99 : 1);
    const w = Math.round(img.width * s), h = Math.round(img.height * s);
    x.imageSmoothingEnabled = !!photo;
    x.drawImage(img, Math.round((PW - w) / 2), Math.round((PH - h) / 2), w, h);
  }
  c.src = photo;
  cache.set(ck, c);
  return c;
}

// Which piece a pixel belongs to: a 2x2 grid, each inner edge with a round
// tab that pokes into the neighbour.
const KNOBS = [
  { x: PW / 2 + 2.5, y: PH / 4, owner: 0 }, { x: PW / 2 - 2.5, y: (PH * 3) / 4, owner: 3 },
  { x: PW / 4, y: PH / 2 + 2.5, owner: 0 }, { x: (PW * 3) / 4, y: PH / 2 - 2.5, owner: 3 },
];
function owner(px, py) {
  for (const k of KNOBS) if ((px - k.x) ** 2 + (py - k.y) ** 2 < 12.5) return k.owner;
  return (px >= PW / 2 ? 1 : 0) + (py >= PH / 2 ? 2 : 0);
}
// pieces come in this order: corner, opposite corner, then the rest
const ORDER = [0, 3, 1, 2];
export const PIECE_ORDER = ORDER;
export const PICTURE_SIZE = [PW, PH];

// One jigsaw piece cut out of the picture, with a dark edge, on a
// transparent canvas the size of the whole picture (so it sits exactly in
// its slot when drawn at the picture's origin).
export function pieceImage(key, i, photo = null) {
  const pic = picture(key, photo);
  const ck = 'p|' + key + '|' + i + (photo ? '|p' : '');
  if (cache.has(ck) && cache.get(ck).src === pic) return cache.get(ck);
  const c = makeCanvas(PW, PH), x = c.ctx;
  const src = pic.ctx.getImageData(0, 0, PW, PH).data;
  const out = x.createImageData(PW, PH), d = out.data;
  const own = (px, py) => px >= 0 && py >= 0 && px < PW && py < PH && owner(px + 0.5, py + 0.5) === i;
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    if (!own(px, py)) continue;
    const o = (py * PW + px) * 4;
    const edge = !own(px + 1, py) || !own(px - 1, py) || !own(px, py + 1) || !own(px, py - 1);
    d[o] = edge ? src[o] * 0.45 : src[o]; d[o + 1] = edge ? src[o + 1] * 0.45 : src[o + 1]; d[o + 2] = edge ? src[o + 2] * 0.5 : src[o + 2]; d[o + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  c.src = pic;
  cache.set(ck, c);
  return c;
}
// the middle of piece i, in picture pixels
export const pieceCentre = (i) => [(i % 2 ? 0.75 : 0.25) * PW, (i >= 2 ? 0.75 : 0.25) * PH];

// Which way an animal's sprite faces as drawn: -1 nose left, 1 nose right,
// 0 no facing (jellies drift, crabs scuttle, the tree stands).
export const NOSE = { ray: 1, dolphin: 1, seahorse: 1, bean: 1, jelly: 0, nettle: 0, bigjelly: 0, comb: 0, crystal: 0, manowar: 0, octopus: 0, crab: 0, treefriend: 0, me: 0, us: 0 };
export const noseOf = (key) => NOSE[key] ?? -1;
// where it lives in a tank scene: 'sand' walks the floor, 'drift' bobs
export const MOVES = { crab: 'sand', treefriend: 'sand', jelly: 'drift', nettle: 'drift', bigjelly: 'drift', comb: 'drift', crystal: 'drift', manowar: 'drift', octopus: 'sand' };

// The animal at time t, animated. size: 'icon' (small) or 'big'.
export function animalFrame(key, t, size = 'big') {
  const big = size === 'big';
  const f = (n, fps) => Math.floor(t * fps) % n;
  switch (key) {
    case 'jelly': return renderJelly(big ? 22 : 12, f(JELLY_FRAMES, 8), 'pink');
    case 'nettle': return renderJelly(big ? 16 : 10, f(JELLY_FRAMES, 8), 'nettle');
    case 'bigjelly': return renderJelly(big ? 30 : 16, f(JELLY_FRAMES, 7), 'violet');
    case 'comb': return renderComb(big ? 14 : 8, f(8, 10));
    case 'crystal': return renderJelly(big ? 22 : 12, f(JELLY_FRAMES, 8), 'crystal');
    case 'manowar': return renderJelly(big ? 16 : 9, f(JELLY_FRAMES, 6), 'manowar');
    case 'octopus': return renderOctopus(big ? 18 : 9, f(OCTO_FRAMES, 6));
    case 'crab': return renderCrab(big ? 18 : 10, f(CRAB_FRAMES, 10), 0, 'red');
    case 'ray': return renderRay(big ? 40 : 22, f(RAY_FRAMES, 10));
    case 'turtle': return renderTurtle(big ? 40 : 22, f(TURTLE_FRAMES, 8));
    case 'bean': return diverSprite('bean', f(DIVER_FRAMES, 6));
    case 'treefriend': return treeSprite(f(TREE_FRAMES, 4));
    case 'dolphin': return dolphinSprite(f(DOLPHIN_FRAMES, 7));
    case 'seahorse': return seahorseSprite(f(4, 5), big ? 1.2 : 0.6);
    case 'me': case 'us': return null;
    default: {
      const sp = FISH[key];
      if (!sp) return null;
      const L = key === 'whaleshark' ? (big ? 60 : 30) : key === 'shark' || key === 'reefshark' ? (big ? 56 : 26) : key === 'minnow' ? (big ? 30 : 12) : big ? 44 : 18;
      return fishSprite(key, L, f(sp.frames, 8));
    }
  }
}

// The jigsaw with `n` pieces in place; the rest are bare cardboard.
export function jigsaw(key, n, photo = null) {
  const ck = 'j|' + key + '|' + n + (photo ? '|p' : '');
  const pic = picture(key, photo);
  if (cache.has(ck) && cache.get(ck).src === pic) return cache.get(ck);
  const c = makeCanvas(PW, PH), x = c.ctx;
  const src = pic.ctx.getImageData(0, 0, PW, PH).data;
  const out = x.createImageData(PW, PH), d = out.data;
  const have = new Set(ORDER.slice(0, n));
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const o = owner(px + 0.5, py + 0.5), i = (py * PW + px) * 4;
    const edge = owner(px + 1.5, py + 0.5) !== o || owner(px + 0.5, py + 1.5) !== o;
    let r, g, b;
    if (have.has(o)) {
      [r, g, b] = [src[i], src[i + 1], src[i + 2]];
      if (edge && n < PIECES) { r *= 0.55; g *= 0.55; b *= 0.6; }
    } else {
      const l = 0.9 + (bayer(px, py) - 0.5) * 0.12;
      [r, g, b] = [200 * l, 168 * l, 120 * l];
      if (edge) [r, g, b] = [120, 86, 50];
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  // a little "?" on each missing piece
  for (const p of ORDER.slice(n)) {
    const cx = (p % 2 ? 0.75 : 0.25) * PW, cy = (p >= 2 ? 0.75 : 0.25) * PH;
    x.fillStyle = '#8a6440';
    for (const [qx, qy] of [[-1, -3], [0, -3], [1, -2], [0, -1], [0, 0], [0, 2]]) x.fillRect(Math.round(cx + qx), Math.round(cy + qy), 1, 1);
  }
  c.src = pic;
  cache.set(ck, c);
  return c;
}

// A tiny acrylic keychain of the animal: its picture shrunk down, with a
// white die-cut border and a ring at the top.
export function keychainIcon(key) {
  const ck = 'k|' + key;
  if (cache.has(ck)) return cache.get(ck);
  const img = animal(key);
  const S = 12;
  const c = makeCanvas(S + 4, S + 6), x = c.ctx;
  const tmp = makeCanvas(S, S), t = tmp.ctx;
  if (img) {
    const s = Math.min(S / img.width, S / img.height);
    const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
    t.imageSmoothingEnabled = true;
    // see-through animals (jellies) are drawn a few times over so they
    // come out solid, like printed acrylic
    for (let k = 0; k < 3; k++) t.drawImage(img, Math.round((S - w) / 2), Math.round((S - h) / 2), w, h);
  } else {
    // the two of them: a little heart
    t.fillStyle = '#ff5a8a';
    ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'].forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') t.fillRect(2 + i, 3 + j, 1, 1); });
  }
  // hard pixels only
  const id = t.getImageData(0, 0, S, S), d = id.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 90 ? 255 : 0;
  t.putImageData(id, 0, 0);
  const on = (i, j) => i >= 0 && j >= 0 && i < S && j < S && d[(j * S + i) * 4 + 3];
  x.fillStyle = '#ffffff';
  for (let j = -1; j <= S; j++) for (let i = -1; i <= S; i++) if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) x.fillRect(i + 2, j + 4, 1, 1);
  x.drawImage(tmp, 2, 4);
  // the ring
  x.fillStyle = '#d8d8e0';
  x.fillRect(S / 2 + 1, 0, 2, 1); x.fillRect(S / 2, 1, 1, 2); x.fillRect(S / 2 + 3, 1, 1, 2); x.fillRect(S / 2 + 1, 3, 2, 1);
  c.ring = [S / 2 + 2, 0];
  cache.set(ck, c);
  return c;
}

// A striped sash wrapped round the camera's bottom corner in the set's
// colours, like a prize ribbon.
export function drawBanner(x, id, W, H) {
  const S = SETS.find((s) => s.id === id);
  if (!S) return;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const d = (W - 1 - i) + (H - 1 - j) * 1.1 - 7;
    if (d < 0 || d > 9) continue;
    x.fillStyle = d < 1 || d > 8 ? '#1a1020' : ((i - j) >> 1) % 2 ? S.cols[0] : S.cols[1];
    x.fillRect(i, j, 1, 1);
  }
}

export function done(book, key) { return !!(book[key] && book[key].pieces >= PIECES); }
export function setDone(book, S) { return S.keys.every((k) => done(book, k)); }
export const clampPieces = (n) => clamp(n | 0, 0, PIECES);
