// Anzeigenamen und Archetyp-Erkennung für den Marvel Snap Tracker.
// Die Spieldatei liefert interne IDs wie "TheCollector" oder "JaneFosterFracturedFrontier".

const NAME_OVERRIDES = {
  SpiderHam: 'Spider-Ham', X23: 'X-23', MrNegative: 'Mister Negative', ShangChi: 'Shang-Chi',
  AntMan: 'Ant-Man', SheHulk: 'She-Hulk', SpiderMan: 'Spider-Man', SpiderWoman: 'Spider-Woman',
  SpiderMan2099: 'Spider-Man 2099', Doom2099: 'Doom 2099', MilesMorales: 'Miles Morales',
  MrFantastic: 'Mister Fantastic', MrSinister: 'Mister Sinister', DrDoom: 'Doctor Doom',
  KaZar: 'Ka-Zar', MBaku: "M'Baku", JJonahJameson: 'J. Jonah Jameson', Agent13: 'Agent 13',
  HitMonkey: 'Hit-Monkey', StarLord: 'Star-Lord', Starlord: 'Star-Lord', WongXavier: 'Wong',
  MobiusMMobius: 'Mobius M. Mobius', JaneFoster: 'Jane Foster Mighty Thor',
  JaneFosterFracturedFrontier: 'Jane Foster (FF)', ThanosFracturedFrontier: 'Thanos (FF)',
  DoctorOctopusFracturedFrontier: 'Doctor Octopus (FF)', HellcowFracturedFrontier: 'Hellcow (FF)',
  ScarletWitchQueenOfChaos: 'Scarlet Witch (Queen of Chaos)', RogueScionOfDivision: 'Rogue (Scion)',
  CalibanHorseman: 'Caliban', AntiPolarMagneto: 'Anti-Polar Magneto', EnSabahNur: 'En Sabah Nur',
  JoaquinTorres: 'Joaquin Torres', ZombieGiantMan: 'Zombie Giant-Man', WhiteTiger: 'White Tiger',
  NegasonicTeenageWarhead: 'Negasonic Teenage Warhead', JeffTheBabyLandShark: 'Jeff!',
  HumanTorch: 'Human Torch', TheThing: 'The Thing', TheHunger: 'The Hunger',
  ThePhoenixForce: 'The Phoenix Force', TheInversion: 'The Inversion', LivingTribunal: 'The Living Tribunal',
  TheCollector: 'The Collector', Modok: 'M.O.D.O.K.', USAgent: 'U.S. Agent',
};

function cardName(id) {
  if (!id) return '';
  if (NAME_OVERRIDES[id]) return NAME_OVERRIDES[id];
  return id
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
}

// Spielmodi aus der Spieldatei -> Anzeige
const MODE_NAMES = {
  Ranked: 'Ranked', Conquest: 'Conquest', ChampionArena: 'Grand Arena', Friendly: 'Freundschaft',
  Draft: 'Draft', HighVoltage: 'High Voltage', Sanctum: 'Sanctum', Event: 'Event',
};
function modeName(m) { return MODE_NAMES[m] || (m ? cardName(m) : 'Unbekannt'); }

// Archetyp-Erkennung: Der erste Eintrag, von dem mindestens `min` Signaturkarten
// beim Gegner gesehen wurden, gewinnt. Reihenfolge = Priorität.
const ARCHETYPES = [
  { name: 'Zombie',          min: 1, cards: ['TheHunger', 'ZombieScarletWitch', 'ZombieGiantMan', 'ZombieSentry', 'ZombieMisterFantastic'] },
  { name: 'Venus',           min: 1, cards: ['Venus'] },
  { name: 'Magneto',         min: 1, cards: ['AntiPolarMagneto', 'CalibanHorseman', 'EnSabahNur'] },
  { name: 'High Evo',        min: 1, cards: ['HighEvolutionary'] },
  { name: 'Negative',        min: 1, cards: ['MrNegative'] },
  { name: 'Surfer',          min: 1, cards: ['SilverSurfer'] },
  { name: 'Arishem',         min: 1, cards: ['Arishem'] },
  { name: 'Galactus',        min: 1, cards: ['Galactus'] },
  { name: 'Discard',         min: 1, cards: ['Apocalypse', 'Swarm', 'Dracula', 'MorbiusDiscard', 'ColleenWing', 'Modok'] },
  { name: 'Created Cards',   min: 1, cards: ['DevilDinosaur', 'VictoriaHand', 'AgentCoulson', 'MoonGirl'] },
  { name: 'Destroy',         min: 2, cards: ['Deathlok', 'Carnage', 'Deadpool', 'X23', 'Venom', 'Knull', 'Death', 'Wolverine', 'BuckyBarnes', 'ZombieVenom', 'Tombstone'] },
  { name: 'Scarlet Witch',   min: 1, cards: ['ScarletWitchQueenOfChaos'] },
  { name: 'Ramp',            min: 2, cards: ['Electro', 'Wave', 'Magneto', 'Infinaut', 'Eson', 'Blink', 'NickFury'] },
  { name: 'Move',            min: 2, cards: ['Kraven', 'Vulture', 'HumanTorch', 'Polaris', 'Cloak', 'Dagger', 'MultipleMan', 'Heimdall'] },
  { name: 'Ongoing',         min: 2, cards: ['Spectrum', 'Wong', 'Patriot', 'BlueMarvel', 'Onslaught', 'Mystique', 'Klaw'] },
  { name: 'Hela',            min: 1, cards: ['Hela'] },
  { name: 'Thanos',          min: 1, cards: ['Thanos', 'ThanosFracturedFrontier'] },
  { name: 'Loki',            min: 1, cards: ['Loki'] },
];
const ARCHETYPE_NAMES = ARCHETYPES.map(a => a.name).concat(['Sonstiges']);

function detectArchetype(cards) {
  if (!cards || !cards.length) return null;
  const set = new Set(cards);
  for (const a of ARCHETYPES) {
    if (a.cards.filter(c => set.has(c)).length >= a.min) return a.name;
  }
  return 'Sonstiges';
}

const LOCATION_NAME = id => cardName(id);
