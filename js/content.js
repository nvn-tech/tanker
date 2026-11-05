// Heroes and weapons. Pick any hero with any weapon.
//
// Hero stats (DDTank-style):
//   hp    max health
//   atk   outgoing damage multiplier
//   def   incoming damage multiplier (lower = tankier)
//   agi   agility: more walking per turn and less delay (turns come sooner)
//   luck  chance of a "Lucky!" hit (+50% damage)
//
// Weapon behaviours (handled in game.js):
//   split    bursts into N bomblets at the top of its arc
//   freeze   targets skip their next turn
//   poison   damage at the start of the target's next N turns
//   bolt     lightning strike, small crater
//   drill    bores this many px through terrain before exploding
//   bounce   bounces this many times before exploding
//   heal     heals allies in the blast instead of hurting them

TK.HEROES = {
  rookie: {
    name: 'Bo', title: 'Rookie', hp: 1400, atk: 1.0, def: 1.0, agi: 1.0, luck: 0.06,
    rage: 1.35, perk: 'Fills the rage bar 35% faster',
  },
  knight: {
    name: 'Gwen', title: 'Knight', hp: 1550, atk: 0.95, def: 0.82, agi: 0.85, luck: 0.03,
    perk: 'Heavy armor: takes 18% less damage',
  },
  ninja: {
    name: 'Kaze', title: 'Ninja', hp: 1200, atk: 1.0, def: 1.05, agi: 1.35, luck: 0.1,
    perk: 'Walks 35% farther and acts sooner',
  },
  witch: {
    name: 'Luna', title: 'Witch', hp: 1300, atk: 1.0, def: 1.0, agi: 1.0, luck: 0.22,
    perk: '22% chance of a Lucky hit (+50% damage)',
  },
  brute: {
    name: 'Grog', title: 'Brute', hp: 1750, atk: 1.12, def: 1.0, agi: 0.78, luck: 0.03, scale: 1.12,
    perk: 'Huge HP, hits 12% harder, but slow',
  },
  tinker: {
    name: 'Pixie', title: 'Tinker', hp: 1350, atk: 0.95, def: 1.0, agi: 1.0, luck: 0.06, energy: 130,
    perk: '130 energy per turn: more items',
  },
};
TK.HERO_IDS = Object.keys(TK.HEROES);

TK.WEAPONS = {
  bomb: {
    name: 'Boom Bomb', desc: 'The trusty all-rounder. Solid damage, solid crater.',
    dmg: 280, radius: 44, delay: 0,
    superName: 'Mega Bomb', superDesc: 'Giant blast, double damage.',
  },
  splitter: {
    name: 'Splitter', desc: 'Bursts into 3 bomblets at the top of its arc. Great for spread-out foes.',
    dmg: 165, radius: 32, delay: 10, split: 3,
    superName: 'Fireworks', superDesc: 'Bursts into 6 bomblets.',
  },
  frost: {
    name: 'Frost Cannon', desc: 'Weak hit, but frozen targets skip their next turn (then are immune until they act).',
    dmg: 160, radius: 40, delay: 15, freeze: true, crater: 0.7,
    superName: 'Blizzard', superDesc: 'Huge freezing blast, 1.5x damage.',
  },
  toxic: {
    name: 'Toxic Flask', desc: 'Splash of goo: poisons targets for 3 turns.',
    dmg: 160, radius: 52, delay: 5, poison: 65, poisonTurns: 3,
    superName: 'Plague Cloud', superDesc: 'Bigger cloud, double poison.',
  },
  thunder: {
    name: 'Thunder Rod', desc: 'Calls lightning on impact. Heavy hit, tiny crater, wind matters less.',
    dmg: 330, radius: 32, delay: 20, bolt: true, crater: 0.5, wind: 0.5,
    superName: 'Chain Storm', superDesc: 'Lightning jumps to 2 more enemies.',
  },
  drill: {
    name: 'Drill Rocket', desc: 'Bores through the ground before blowing up. Digs out hiding foes.',
    dmg: 250, radius: 38, delay: 10, drill: 110,
    superName: 'Earth Breaker', superDesc: 'Drills twice as deep, 1.8x damage.',
  },
  bouncer: {
    name: 'Bouncy Ball', desc: 'Bounces once off the ground, then explodes.',
    dmg: 265, radius: 42, delay: 5, bounce: 1,
    superName: 'Pinball', superDesc: 'Bounces 3 times, exploding on every hit.',
  },
  medic: {
    name: 'Medic Mortar', desc: 'Hurts enemies, heals allies caught in the blast (you too).',
    dmg: 220, radius: 50, delay: 10, heal: true,
    superName: 'Field Hospital', superDesc: 'Heals every ally 25%, 1.5x blast.',
  },
};
TK.WEAPON_IDS = Object.keys(TK.WEAPONS);

TK.heroOf = (c) => TK.HEROES[c && c.hero] || TK.HEROES.rookie;
TK.weaponOf = (c) => TK.WEAPONS[c && c.weapon] || TK.WEAPONS.bomb;

// 0..5 rating for menu stat bars
TK.heroRatings = (h) => ({
  HP: TK.clamp(Math.round((h.hp - 1100) / 130), 1, 5),
  ATK: TK.clamp(Math.round((h.atk - 0.85) / 0.06), 1, 5),
  DEF: TK.clamp(Math.round((1.15 - h.def) / 0.07), 1, 5),
  AGI: TK.clamp(Math.round((h.agi - 0.6) / 0.15), 1, 5),
  LUCK: TK.clamp(Math.round(h.luck / 0.05) + 1, 1, 5),
});
