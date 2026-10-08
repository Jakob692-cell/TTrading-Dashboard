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
export const CHARACTERS = ['sam', 'lis', 'matt', 'shaun'];

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
    conditionSum: 0, ejections: 0, liftRides: 0, treats: 0, probes: 0, secures: 0, assists: 0, sweeps: 0, acks: 0,
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
  { key: 'treats', title: 'Field Medic', desc: 'Most first-aid measures done right' },
  { key: 'probes', title: 'Probe Line Hero', desc: 'Most probe strikes in the debris' },
  { key: 'secures', title: 'Crossed Skis', desc: 'Secured the most accident sites' },
  { key: 'assists', title: 'Second Rescuer', desc: 'Held the akja rope the most' },
  { key: 'acks', title: 'Radio Operator', desc: 'Answered the most dispatch calls' },
  { key: 'sweeps', title: 'Last Run', desc: 'Sent the most stragglers home at closing' },
];

// Drivable vehicles. Seats are [x, y, z] offsets in the vehicle frame (+z = forward); seat 0 is the driver.
export const VEHICLE_TYPES = {
  snowmobile: {
    label: 'Snowmobile', seats: [[0, 0.82, -0.15], [0, 0.95, -0.8]], maxSpeed: 25, accel: 9, climb: 0.75, grip: 5.5, turn: 1.9,
    radius: 1.2, len: 3.0, wid: 1.1, tow: true, mass: 1,
  },
  quad: {
    label: 'Quad', seats: [[0, 0.98, -0.1], [0, 1.1, -0.65]], maxSpeed: 22, accel: 10.5, climb: 0.55, grip: 6.5, turn: 2.2,
    radius: 1.1, len: 2.1, wid: 1.25, tow: true, mass: 1,
  },
  pickup: {
    label: 'Patrol Pickup', seats: [[-0.42, 1.05, 0.15], [0.42, 1.05, 0.15], [-0.4, 1.15, -1.3], [0.4, 1.15, -1.3]], maxSpeed: 27, accel: 7, climb: 0.34,
    grip: 3.6, turn: 1.25, radius: 2.0, len: 4.9, wid: 2.1, tow: false, mass: 2.5, model: 'pickup', scale: 0.85,
  },
  truck: {
    label: 'Rescue Truck', seats: [[-0.5, 1.45, 1.35], [0.5, 1.45, 1.35]], maxSpeed: 22, accel: 6, climb: 0.3,
    grip: 3.4, turn: 1.1, radius: 2.3, len: 5.0, wid: 2.5, tow: false, mass: 3.5, model: 'truck', scale: 0.85, ambulance: true,
  },
};

// ---------------------------------------------------------------- mountain rescue (Pistenrettung)
// Fictional organisation. Never use real rescue-org names, the red cross / Swiss cross or edelweiss badges.
export const ORG = {
  name: 'Pistenrettung Hintereck',
  short: 'Pistenrettung',
  station: 'Rettungswache Hintereck',
  dispatch: 'Leitstelle Talheim',
  heli: 'Föhn 1',
  heliOperator: 'Talflug',
  clinic: 'Unfallambulanz Talheim',
  channel: 'Bergfunk Kanal 7',
};
export const callsign = (slot) => `Hintereck ${1 + (slot | 0)}`;

// European avalanche danger scale (names only; icons are our own)
export const DANGER_DE = ['', 'gering', 'mäßig', 'erheblich', 'groß', 'sehr groß'];
export const DANGER_EN = ['', 'Low', 'Moderate', 'Considerable', 'High', 'Very high'];

// First-aid measures. time = seconds the action takes (client animation, server minimum spacing).
export const AID_STEPS = {
  check: { de: 'Notfallcheck (ABCDE)', en: 'Primary survey (ABCDE)', icon: '🩺', time: 1.1 },
  cspine: { de: 'Kopf/HWS stabilisieren', en: 'Stabilise head & neck', icon: '🧣', time: 1.0 },
  airway: { de: 'Atemwege freimachen', en: 'Clear the airway', icon: '💨', time: 1.0 },
  dms: { de: 'DMS prüfen (Puls, Motorik, Gefühl)', en: 'Check pulse, movement, feeling', icon: '🦶', time: 0.8 },
  vacuumSplint: { de: 'Vakuumschiene anlegen', en: 'Vacuum splint', icon: '🦴', time: 1.4 },
  kneeSplint: { de: 'Knie schienen', en: 'Splint the knee', icon: '🦵', time: 1.2 },
  armSplint: { de: 'Mehrzweckschiene', en: 'Multi-purpose splint', icon: '🩹', time: 1.0 },
  sling: { de: 'Arm ruhigstellen (Dreiecktuch)', en: 'Sling the arm', icon: '🔺', time: 1.0 },
  mattress: { de: 'Vakuummatratze', en: 'Vacuum mattress', icon: '🛏', time: 1.6 },
  cool: { de: 'Kühlen', en: 'Cool the injury', icon: '❄', time: 0.8 },
  warm: { de: 'Wärmeerhalt (Rettungsdecke)', en: 'Keep warm (rescue blanket)', icon: '✨', time: 1.0 },
  heatPack: { de: 'Wärmepackung', en: 'Hypothermia wrap', icon: '🔥', time: 1.4 },
  // traps: never right — popular myths and mistakes
  reduce: { de: 'Schulter einrenken', en: 'Pop the shoulder back in', icon: '💪', time: 1.0, trap: 'Nie selbst einrenken – Nerven und Gefäße!' },
  helmetOff: { de: 'Helm abnehmen', en: 'Take the helmet off', icon: '⛑', time: 0.8, trap: 'Helm bleibt drauf, Kopf achsengerecht halten!' },
  sitUp: { de: 'Patient aufsetzen', en: 'Sit the patient up', icon: '🪑', time: 0.8, trap: 'Bei Verdacht auf Wirbelsäule nie aufsetzen!' },
  bootOff: { de: 'Skischuh ausziehen', en: 'Pull the ski boot off', icon: '🥾', time: 0.8, trap: 'Skischuh nur öffnen, nicht ausziehen!' },
  schnaps: { de: 'Schnaps zum Aufwärmen', en: 'Schnapps to warm up', icon: '🥃', time: 0.8, trap: 'Alkohol kühlt aus – niemals!' },
  rubSnow: { de: 'Mit Schnee abreiben', en: 'Rub with snow', icon: '🧊', time: 0.8, trap: 'Abreiben schadet – nur sanft wärmen!' },
};

// Injury patterns. sev 1..3 (Notfall-Stufe); heli = needs the rescue helicopter (RTH) if it can fly.
// traps = typical mistakes offered as wrong answers for this injury.
export const INJURIES = {
  knee: { de: 'Knieverletzung', en: 'Knee injury', sev: 1, steps: ['check', 'cool', 'kneeSplint', 'warm'], traps: ['bootOff'] },
  wrist: { de: 'Handgelenksbruch', en: 'Broken wrist', sev: 1, steps: ['check', 'dms', 'armSplint', 'sling'], traps: ['rubSnow'] },
  shoulder: { de: 'Schulterluxation', en: 'Dislocated shoulder', sev: 1, steps: ['check', 'dms', 'sling', 'warm'], traps: ['reduce'] },
  lowerLeg: { de: 'Unterschenkelbruch', en: 'Broken lower leg', sev: 2, steps: ['check', 'dms', 'vacuumSplint', 'warm'], traps: ['bootOff'] },
  hip: { de: 'Oberschenkel-/Hüftverletzung', en: 'Hip / thigh injury', sev: 3, heli: true, steps: ['check', 'dms', 'mattress', 'heatPack'], traps: ['sitUp', 'schnaps'] },
  head: { de: 'Schädel-Hirn-Trauma', en: 'Head injury', sev: 3, heli: true, steps: ['cspine', 'airway', 'check', 'warm'], traps: ['helmetOff'] },
  spine: { de: 'V.a. Wirbelsäulenverletzung', en: 'Suspected spinal injury', sev: 3, heli: true, steps: ['cspine', 'check', 'mattress', 'warm'], traps: ['sitUp', 'helmetOff'] },
  hypo: { de: 'Unterkühlung', en: 'Hypothermia', sev: 2, steps: ['airway', 'check', 'heatPack'], traps: ['schnaps', 'rubSnow'] },
  burial: { de: 'Lawinenverschüttung', en: 'Avalanche burial', sev: 3, heli: true, steps: ['airway', 'check', 'heatPack'], traps: ['schnaps', 'sitUp'] },
};
// roughly the real mix of piste accidents: knees and lower legs first
export const INJURY_POOL = ['knee', 'knee', 'knee', 'lowerLeg', 'lowerLeg', 'wrist', 'shoulder', 'head', 'spine', 'hip'];

export const RESCUE = {
  heliEta: 22, // seconds from request to arrival
  heliWait: 40, // seconds the landed helicopter waits for the patient
  lzMaxDist: 90, // landing zone must be within this distance of the patient
  lzMaxSlope: 0.3, // tan of max slope at the landing zone
  lzClear: 9, // no colliders within this radius
  probeHitRadius: 0.9,
  secureBonus: 5,
  ackBonus: 5,
  assistBonus: 10,
  sweepBonus: 15,
  stragglerPenalty: 10,
  sweepAt: 0.9, // fraction of the shift when the closing sweep (Pistenschluss) starts
  buriedGrace: 55, // seconds of flat survival before the curve drops (scaled-down "15 minutes")
};

// Leitstelle radio (in-world German radio jargon). {cs} callsign, {heli} helicopter, {where} place, {eta} seconds
export const RADIO = {
  call: 'Pistenrettung Hintereck von Leitstelle Talheim: Einsatz, {what}. {where}. Kommen.',
  repeat: 'Pistenrettung Hintereck von Leitstelle Talheim, bitte melden! Einsatz {where} noch offen. Kommen.',
  ack: 'Hier {cs}, verstanden, übernehme. Kommen.',
  secured: 'Hier {cs}: Unfallstelle abgesichert, Ski stecken oberhalb.',
  heliReq: 'Hier {cs} mit Nachforderung: Benötigen Rettungshubschrauber mit Notarzt. Kommen.',
  heliOk: 'Verstanden. {heli} ist alarmiert, Eintreffen in etwa {eta} Sekunden. Landeplatz vorbereiten. Kommen.',
  heliNoWeather: 'Abgelehnt, Sicht unter Minimum. Abtransport bodengebunden. Kommen.',
  heliNoDark: 'Abgelehnt, keine Flüge mehr nach Sonnenuntergang. Abtransport bodengebunden. Kommen.',
  heliCircle: 'Hintereck von {heli}: Kein Landeplatz in Sicht, wir kreisen. Einweiser! Kommen.',
  heliApproach: 'Hintereck von {heli}: Im Anflug, sehe Einweiser. Kommen.',
  heliLanded: '{heli} ist gelandet. Patient zum Hubschrauber bringen!',
  heliDone: '{heli}: Patient an Bord, fliegen ins Klinikum. Ende.',
  heliAbort: '{heli}: Einsatz abgebrochen, drehen ab. Ende.',
  lzLost: '{heli}: Einweiser verloren! Landeplatz räumen und neu einweisen. Kommen.',
  folge: 'Achtung, von oben! Folgeunfall – wer hat die Ski nicht gesteckt?!',
  delivered: 'Hier {cs}: Patient übergeben, wieder einsatzbereit. Kommen.',
  sweep: 'An alle: Lifte stehen. Beginnen letzte Kontrollfahrt, Pisten werden gesperrt. Ende.',
  avalanche: 'An alle: Lawinenabgang {where}! LVS auf Suchen! Kommen.',
  mayday: 'Mayday, Mayday, Mayday, hier {cs}: Retter verschüttet! Kommen.',
  bulletin: 'Lawinenlagebericht für heute: Warnstufe {level}, {name}.',
};
