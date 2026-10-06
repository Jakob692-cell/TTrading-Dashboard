export const TICK_RATE = 20;
export const SNAP_RATE = 15;
export const PLAYER_SEND_RATE = 20;
export const INTERP_DELAY = 0.12; // seconds of buffering for remote entities
export const MAX_PLAYERS = 4;
export const COUNTDOWN = 4;
export const GRAVITY = 20;

export const JACKET_COLORS = [
  '#e63946', // patrol red
  '#2f6fd6', // piste blue
  '#2e9e5b', // pine green
  '#f2b134', // mustard
  '#8e5bd6', // grape
  '#f07b2c', // safety orange
  '#1fb5a8', // glacier teal
  '#e85d9c', // 80s pink
];

export const HATS = ['beanie', 'helmet', 'cap', 'ushanka', 'viking', 'tophat', 'cowboy', 'none'];

export const LIFT_RIDE_TIME = 20; // seconds bottom -> top
export const CHARGE_FUSE = 3.5;
export const CHARGES_PER_REFILL = 2;
export const AIR_SUPPLY = 75; // seconds a buried player can breathe
export const DIG_TIME = 2.6; // seconds of shovelling (shared by everyone digging)

export const SHOP_ITEMS = {
  wax: { name: 'Race Wax', desc: '+10% top speed on skis', price: 60, max: 1 },
  toboggan: { name: 'Pro Toboggan', desc: 'Way harder to tip over, gentler on patients', price: 80, max: 1 },
  beacon: { name: 'Beacon Pro', desc: 'Doubled transceiver range + precise arrow', price: 50, max: 1 },
  thermos: { name: 'Hot Cocoa Thermos', desc: 'Waiting patients get cold 40% slower', price: 70, max: 1 },
  sled: { name: 'Extra Toboggan', desc: '+1 toboggan in the rack', price: 40, max: 2 },
};

export function shiftConfig(day, players = 1) {
  const d = Math.max(1, day | 0);
  const n = Math.max(1, Math.min(4, players | 0));
  const crew = 0.75 + 0.25 * n; // more patrollers -> more calls and a bigger quota
  return {
    duration: 330 + Math.min(d, 4) * 15, // seconds, 09:00 -> 16:30 in-game
    quota: Math.round(((200 + (d - 1) * 120) * crew) / 10) * 10,
    firstCallAt: 6,
    callInterval: Math.max(18, 40 - d * 4) / (0.8 + 0.2 * n),
    maxActiveCalls: Math.min(3 + Math.floor(d / 2), 5) + Math.floor((n - 1) / 2),
    naturalAvalanches: Math.min(1 + d, 4),
    decayWaiting: 0.42 + d * 0.06, // condition points per second while waiting
    sleds: 2,
  };
}

export const PATIENT_TYPES = {
  injured: { label: 'Injured skier', verb: 'Stabilize', time: 1.2 },
  tree: { label: 'Stuck in a tree well', verb: 'Pull out', time: 2.0 },
  buried: { label: 'Buried by avalanche', verb: 'Dig', time: DIG_TIME },
};

export const PATIENT_LINES = [
  'Is this the bunny slope?',
  'I only wanted a selfie with the yeti...',
  'My other ski is somewhere in Austria.',
  'Tell my snowboard I loved it.',
  'I think I left my dignity up there.',
  'Do you take tips? I have 3 granola bars.',
  'The trail map said "fun"!',
  'Ow. Ow. Ow. Hi. Ow.',
  'Did anyone film that? Please say no.',
  'I rented these skis 20 minutes ago.',
  'Is it too late to try snowshoeing?',
  'I can feel my toes. Wait. No I can\'t.',
];

export const TOURIST_NAMES = [
  'Brad', 'Chantal', 'Günther', 'Kevin', 'Skylar', 'Doris', 'Lars', 'Yuki', 'Moritz', 'Tiffany',
  'Bjørn', 'Pascal', 'Gary', 'Inge', 'Chad', 'Heidi', 'Rolf', 'Bianca', 'Hank', 'Mila',
];

export function emptyStats() {
  return {
    rescues: 0, crashes: 0, topSpeed: 0, buried: 0, bumps: 0, charges: 0, digs: 0,
    conditionSum: 0, ejections: 0, liftRides: 0,
  };
}

// Funny end-of-shift awards. Every player gets the one they are most "worthy" of.
export const AWARDS = [
  { key: 'rescues', title: 'Mountain Medic', desc: 'Delivered the most patients' },
  { key: 'crashes', title: 'Yard Sale', desc: 'Scattered skis all over the mountain' },
  { key: 'topSpeed', title: 'Speed Demon', desc: 'Fastest top speed' },
  { key: 'buried', title: 'Avalanche Magnet', desc: 'Got buried the most' },
  { key: 'bumps', title: 'Bowling Ball', desc: 'Took out the most teammates' },
  { key: 'charges', title: 'Boom Boom', desc: 'Threw the most avalanche charges' },
  { key: 'digs', title: 'Snow Mole', desc: 'Dug out the most people' },
  { key: 'ejections', title: 'Toboggan Tosser', desc: 'Launched patients off the sled' },
  { key: 'liftRides', title: 'Chairlift Romantic', desc: 'Most chairlift rides' },
];
