// Heroes, weapons and the stat system.
//
// Stats work like the classic games: a character's final stats are the
// hero's base points plus the weapon's points.
//
//   Attack  (ATK)  raises the damage you deal
//   Defense (DEF)  lowers the damage you take
//   Agility (AGI)  more walking per turn, and your turns come sooner
//   Luck    (LUCK) chance of a critical hit, and ignores part of the target's Defense
//   Harm           the weapon's fixed base damage
//
// Weapons have a focus: one stat around 250 with the rest spread out, or
// "balanced" with points split across all four. Every weapon totals 400 points.
// Every hero totals 600 base points, so an average stat ends up near 250.

TK.STAT_KEYS = ['atk', 'def', 'agi', 'luck'];
TK.STAT_NAMES = { atk: 'Attack', def: 'Defense', agi: 'Agility', luck: 'Luck' };
TK.STAT_SHORT = { atk: 'ATK', def: 'DEF', agi: 'AGI', luck: 'LUCK' };
TK.FOCUS_NAMES = { atk: 'Attack focus', def: 'Defense focus', agi: 'Agility focus', luck: 'Luck focus', balanced: 'Balanced' };

TK.HEROES = {
  rookie: {
    name: 'Bo', title: 'Rookie', hp: 1400,
    stats: { atk: 150, def: 150, agi: 150, luck: 150 },
    rage: 1.35, perk: 'Fills the rage bar 35% faster',
  },
  knight: {
    name: 'Gwen', title: 'Knight', hp: 1500,
    stats: { atk: 120, def: 260, agi: 100, luck: 120 },
    noFreeze: true, perk: 'Ice-proof armor: can never be frozen',
  },
  ninja: {
    name: 'Kaze', title: 'Ninja', hp: 1250,
    stats: { atk: 140, def: 90, agi: 270, luck: 100 },
    move: 1.5, perk: 'Light feet: walks 50% farther',
  },
  witch: {
    name: 'Luna', title: 'Witch', hp: 1300,
    stats: { atk: 130, def: 120, agi: 110, luck: 240 },
    critMult: 2, perk: 'Critical hits deal 2x instead of 1.5x',
  },
  brute: {
    name: 'Grog', title: 'Brute', hp: 1800, scale: 1.12,
    stats: { atk: 260, def: 150, agi: 70, luck: 120 },
    perk: 'Huge body: the most HP of any hero',
  },
  tinker: {
    name: 'Pixie', title: 'Tinker', hp: 1350,
    stats: { atk: 140, def: 150, agi: 160, luck: 150 },
    energy: 130, perk: '130 energy per turn: more items',
  },
};
TK.HERO_IDS = Object.keys(TK.HEROES);

// Weapon behaviours (handled in game.js):
//   split    bursts into N bomblets at the top of its arc
//   freeze   targets skip their next turn
//   poison   damage at the start of the target's next N turns
//   bolt     lightning strike, small crater
//   drill    bores this many px through terrain before exploding
//   bounce   bounces this many times before exploding
//   heal     heals allies in the blast instead of hurting them
TK.WEAPONS = {
  bomb: {
    name: 'Boom Bomb', focus: 'def', desc: 'Sturdy cannon. Solid damage, solid crater.',
    harm: 280, radius: 44, delay: 0,
    stats: { atk: 50, def: 250, agi: 50, luck: 50 },
    superName: 'Mega Bomb', superDesc: 'Giant blast, double damage.',
  },
  splitter: {
    name: 'Splitter', focus: 'atk', desc: 'Bursts into 3 bomblets at the top of its arc.',
    harm: 165, radius: 32, delay: 10, split: 3,
    stats: { atk: 250, def: 50, agi: 60, luck: 40 },
    superName: 'Fireworks', superDesc: 'Bursts into 6 bomblets.',
  },
  frost: {
    name: 'Frost Cannon', focus: 'agi', desc: 'Weak hit, but frozen targets skip their next turn (then are immune until they act).',
    harm: 160, radius: 40, delay: 15, freeze: true, crater: 0.7,
    stats: { atk: 40, def: 60, agi: 250, luck: 50 },
    superName: 'Blizzard', superDesc: 'Huge freezing blast, 1.5x damage.',
  },
  toxic: {
    name: 'Toxic Flask', focus: 'luck', desc: 'Splash of goo: poisons targets for 3 turns.',
    harm: 160, radius: 52, delay: 5, poison: 65, poisonTurns: 3,
    stats: { atk: 60, def: 40, agi: 50, luck: 250 },
    superName: 'Plague Cloud', superDesc: 'Bigger cloud, double poison.',
  },
  thunder: {
    name: 'Thunder Rod', focus: 'luck', desc: 'Calls lightning on impact. Heavy hit, tiny crater, wind matters less.',
    harm: 320, radius: 32, delay: 20, bolt: true, crater: 0.5, wind: 0.5,
    stats: { atk: 70, def: 30, agi: 50, luck: 250 },
    superName: 'Chain Storm', superDesc: 'Lightning jumps to 2 more enemies.',
  },
  drill: {
    name: 'Drill Rocket', focus: 'atk', desc: 'Bores through the ground before blowing up. Digs out hiding foes.',
    harm: 250, radius: 38, delay: 10, drill: 110,
    stats: { atk: 250, def: 70, agi: 40, luck: 40 },
    superName: 'Earth Breaker', superDesc: 'Drills twice as deep, 1.8x damage.',
  },
  bouncer: {
    name: 'Bouncy Ball', focus: 'balanced', desc: 'Bounces once off the ground, then explodes.',
    harm: 265, radius: 42, delay: 5, bounce: 1,
    stats: { atk: 100, def: 100, agi: 100, luck: 100 },
    superName: 'Pinball', superDesc: 'Bounces 3 times, exploding on every hit.',
  },
  medic: {
    name: 'Medic Mortar', focus: 'agi', desc: 'Hurts enemies, heals allies caught in the blast (you too).',
    harm: 220, radius: 50, delay: 10, heal: true,
    stats: { atk: 50, def: 60, agi: 250, luck: 40 },
    superName: 'Field Hospital', superDesc: 'Heals every ally 25%, 1.5x blast.',
  },
};
TK.WEAPON_IDS = Object.keys(TK.WEAPONS);

TK.heroOf = (c) => TK.HEROES[c && c.hero] || TK.HEROES.rookie;
TK.weaponOf = (c) => TK.WEAPONS[c && c.weapon] || TK.WEAPONS.bomb;

// Final stats = hero base + weapon. Accepts a character or {hero, weapon}.
TK.statsOf = (c) => {
  const h = TK.heroOf(c).stats, w = TK.weaponOf(c).stats;
  return { atk: h.atk + w.atk, def: h.def + w.def, agi: h.agi + w.agi, luck: h.luck + w.luck };
};

// ---- formulas (250 in a stat = neutral) ----
// Attack: +/-1% damage per 8 points.            500 ATK = x1.31
TK.atkMult = (c) => 1 + (TK.statsOf(c).atk - 250) / 800;
// Agility: walking and turn speed.             500 AGI = x1.36
TK.agiMult = (c) => Math.max(0.6, 1 + (TK.statsOf(c).agi - 250) / 700);
// Luck: crit chance.                            500 LUCK = 25%
TK.critChance = (c) => TK.clamp(TK.statsOf(c).luck / 2000, 0, 0.5);
// Luck also pierces Defense: ignores LUCK/25 percent of it, max 40%.
TK.pierce = (c) => (c ? TK.clamp(TK.statsOf(c).luck / 2500, 0, 0.4) : 0);
// Defense: -1% damage taken per 10 points.      500 DEF = x0.75
TK.defMult = (target, attacker) => {
  const def = TK.statsOf(target).def * (1 - TK.pierce(attacker));
  return TK.clamp(1 - (def - 250) / 1000, 0.55, 1.3);
};
