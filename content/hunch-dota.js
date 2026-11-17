// Hunch, theme "Dota 2": guess the hero from hints that start vague and get specific. SERVER ONLY.
//
// Hand-written (by Claude) from long-standing facts: lore, look, attack range and ability names that have kept their
// names through Dota 2's updates. Primary attributes are left out on purpose: several heroes changed theirs when
// "Universal" heroes came in (2023). Heroes whose abilities were reworked recently are not in the list of answers.
//
// `heroes` is every hero name a player may guess (shown as suggestions), so the suggestions do not give away which
// heroes can come up. `cards` are the heroes that can come up, each with five hints and other names players use.
// Dota 2 and its heroes are trademarks of Valve. Ballpark uses the names only, never Valve's artwork.
module.exports = {
  name: 'Dota 2',
  heroes: ['Abaddon', 'Alchemist', 'Ancient Apparition', 'Anti-Mage', 'Arc Warden', 'Axe', 'Bane', 'Batrider', 'Beastmaster', 'Bloodseeker', 'Bounty Hunter', 'Brewmaster',
    'Bristleback', 'Broodmother', 'Centaur Warrunner', 'Chaos Knight', 'Chen', 'Clinkz', 'Clockwerk', 'Crystal Maiden', 'Dark Seer', 'Dark Willow', 'Dawnbreaker', 'Dazzle',
    'Death Prophet', 'Disruptor', 'Doom', 'Dragon Knight', 'Drow Ranger', 'Earth Spirit', 'Earthshaker', 'Elder Titan', 'Ember Spirit', 'Enchantress', 'Enigma',
    'Faceless Void', 'Grimstroke', 'Gyrocopter', 'Hoodwink', 'Huskar', 'Invoker', 'Io', 'Jakiro', 'Juggernaut', 'Keeper of the Light', 'Kez', 'Kunkka', 'Legion Commander',
    'Leshrac', 'Lich', 'Lifestealer', 'Lina', 'Lion', 'Lone Druid', 'Luna', 'Lycan', 'Magnus', 'Marci', 'Mars', 'Medusa', 'Meepo', 'Mirana', 'Monkey King', 'Morphling',
    'Muerta', 'Naga Siren', "Nature's Prophet", 'Necrophos', 'Night Stalker', 'Nyx Assassin', 'Ogre Magi', 'Omniknight', 'Oracle', 'Outworld Destroyer', 'Pangolier',
    'Phantom Assassin', 'Phantom Lancer', 'Phoenix', 'Primal Beast', 'Puck', 'Pudge', 'Pugna', 'Queen of Pain', 'Razor', 'Riki', 'Ringmaster', 'Rubick', 'Sand King',
    'Shadow Demon', 'Shadow Fiend', 'Shadow Shaman', 'Silencer', 'Skywrath Mage', 'Slardar', 'Slark', 'Snapfire', 'Sniper', 'Spectre', 'Spirit Breaker', 'Storm Spirit',
    'Sven', 'Techies', 'Templar Assassin', 'Terrorblade', 'Tidehunter', 'Timbersaw', 'Tinker', 'Tiny', 'Treant Protector', 'Troll Warlord', 'Tusk', 'Underlord', 'Undying',
    'Ursa', 'Vengeful Spirit', 'Venomancer', 'Viper', 'Visage', 'Void Spirit', 'Warlock', 'Weaver', 'Windranger', 'Winter Wyvern', 'Witch Doctor', 'Wraith King', 'Zeus'],
  cards: [
    { name: 'Pudge', alt: ['Butcher'], hints: ['An undead hero stitched together from the dead of the battlefield.', 'Melee, carrying a cleaver and a chain.', 'One of his abilities is Rot.', 'Another one is Meat Hook.', 'His ultimate is Dismember.'] },
    { name: 'Invoker', alt: ['Carl', 'Kael'], hints: ['A mage of enormous pride who remembers spells nobody else does.', 'Ranged. His spells come from combining three elements.', 'One of his spells is Cold Snap.', 'Another one is Sun Strike.', 'His three orbs are Quas, Wex and Exort.'] },
    { name: 'Crystal Maiden', alt: ['CM', 'Rylai'], hints: ['She was sent away to the frozen north as a child.', 'A ranged support who wields ice.', 'One of her abilities is Frostbite.', 'Another one is Crystal Nova.', 'Her ultimate is Freezing Field.'] },
    { name: 'Axe', alt: ['Mogul Khan'], hints: ['A warrior who rose through the ranks of the Red Mist army.', 'Melee, red-skinned, and fond of shouting his own name.', 'One of his abilities is Battle Hunger.', "Another one is Berserker's Call.", 'His ultimate is Culling Blade.'] },
    { name: 'Lina', alt: ['Slayer'], hints: ['A sorceress from a desert land, whose sister commands the opposite element.', 'Ranged, and she commands fire.', 'One of her abilities is Light Strike Array.', 'Another one is Dragon Slave.', 'Her ultimate is Laguna Blade.'] },
    { name: 'Sniper', alt: ['Kardel'], hints: ['A small marksman from a village of mountain folk.', 'Ranged, with a very long rifle.', 'One of his abilities is Shrapnel.', 'Another one is Headshot.', 'His ultimate is Assassinate.'] },
    { name: 'Juggernaut', alt: ['Jugg', 'Yurnero'], hints: ['A masked swordsman, said to be the last of his order.', 'Melee, with one blade and a mask he never takes off.', 'One of his abilities is Healing Ward.', 'Another one is Blade Fury.', 'His ultimate is Omnislash.'] },
    { name: 'Drow Ranger', alt: ['Drow', 'Traxex'], hints: ['She was raised in the forest by a people who are not her own.', 'Ranged, an archer.', 'One of her abilities is Gust.', 'Another one is Frost Arrows.', 'Her ultimate is Marksmanship.'] },
    { name: 'Earthshaker', alt: ['ES', 'Raigor'], hints: ['A spirit of the earth bound in a mortal body.', 'Melee, carrying a great totem.', 'One of his abilities is Enchant Totem.', 'Another one is Fissure.', 'His ultimate is Echo Slam.'] },
    { name: 'Zeus', alt: [], hints: ['A god cast down into the mortal world.', 'Ranged, and master of lightning.', 'One of his abilities is Arc Lightning.', 'Another one is Lightning Bolt.', "His ultimate is Thundergod's Wrath."] },
    { name: 'Shadow Fiend', alt: ['SF', 'Nevermore'], hints: ['A demon who collects the souls of the dead.', 'Ranged, and he grows stronger with every soul he takes.', 'One of his abilities is Necromastery.', 'His Shadowraze strikes at three distances.', 'His ultimate is Requiem of Souls.'] },
    { name: 'Phantom Assassin', alt: ['PA', 'Mortred'], hints: ['A veiled sister, trained by an order that follows an oracle.', 'Melee, known for deadly critical strikes.', 'One of her abilities is Stifling Dagger.', 'Another one is Phantom Strike.', 'Her ultimate is Coup de Grace.'] },
    { name: 'Anti-Mage', alt: ['AM', 'Magina', 'Antimage'], hints: ['A monk whose order was wiped out by magic users.', 'Melee, with two blades.', 'One of his abilities is Mana Break.', 'Another one is Blink.', 'His ultimate is Mana Void.'] },
    { name: 'Sven', alt: ['Rogue Knight'], hints: ['A knight of mixed blood, cast out by the knightly order that raised him.', 'Melee, with an enormous sword.', 'One of his abilities is Storm Hammer.', 'Another one is Warcry.', "His ultimate is God's Strength."] },
    { name: 'Tiny', alt: [], hints: ['A creature of living stone.', 'Melee, and he hurls things, including other heroes.', 'One of his abilities is Avalanche.', 'Another one is Toss.', 'His ultimate is Grow.'] },
    { name: 'Windranger', alt: ['WR', 'Windrunner', 'Lyralei'], hints: ['A girl raised by the wind after being born during a storm.', 'Ranged, an archer.', 'One of her abilities is Shackleshot.', 'Another one is Powershot.', 'Her ultimate is Focus Fire.'] },
    { name: 'Rubick', alt: ['Grand Magus'], hints: ['A mage who sees magic as something to take rather than to learn.', 'Ranged, and he copies other heroes’ spells.', 'One of his abilities is Telekinesis.', 'Another one is Fade Bolt.', 'His ultimate is Spell Steal.'] },
    { name: 'Faceless Void', alt: ['Void', 'FV', 'Darkterror'], hints: ['A being from a realm outside of time.', 'Melee, and he bends time.', 'One of his abilities is Time Walk.', 'Another one is Time Lock.', 'His ultimate is Chronosphere.'] },
    { name: 'Tidehunter', alt: ['Tide', 'Leviathan'], hints: ['A sea creature with a grudge against a certain admiral.', 'Melee, huge and covered in slime.', 'One of his abilities is Gush.', 'Another one is Anchor Smash.', 'His ultimate is Ravage.'] },
    { name: 'Kunkka', alt: ['Admiral'], hints: ['The commander of a fleet that fought an enemy from another world.', 'Melee, a ship’s captain with a sword.', 'One of his abilities is Torrent.', 'Another one is X Marks the Spot.', 'His ultimate is Ghostship.'] },
    { name: 'Enigma', alt: [], hints: ['A being that draws everything toward the void.', 'Ranged, and it creates small copies of itself.', 'One of its abilities is Malefice.', 'Another one is Demonic Conversion.', 'Its ultimate is Black Hole.'] },
    { name: 'Lion', alt: ['Demon Witch'], hints: ['A former grandmaster of a dark sorcerous order.', 'Ranged, a sorcerer with a demonic hand.', 'One of his abilities is Mana Drain.', 'Another one is Hex.', 'His ultimate is Finger of Death.'] },
    { name: 'Mirana', alt: ['POTM', 'Princess of the Moon'], hints: ['A princess who gave up her throne to serve a moon goddess.', 'Ranged, riding a great cat.', 'One of her abilities is Starstorm.', 'Another one is Sacred Arrow.', 'Her ultimate is Moonlight Shadow.'] },
    { name: 'Ogre Magi', alt: ['Ogre'], hints: ['A two-headed brute who is surprisingly good at magic.', 'Melee, and his spells sometimes go off several times at once.', 'One of his abilities is Bloodlust.', 'Another one is Fireblast.', 'His passive is called Multicast.'] },
    { name: 'Slark', alt: [], hints: ['A slippery escapee from a deep-sea prison.', 'Melee, and he steals strength from the enemies he hits.', 'One of his abilities is Dark Pact.', 'Another one is Pounce.', 'His ultimate is Shadow Dance.'] },
    { name: 'Bounty Hunter', alt: ['BH', 'Gondar'], hints: ['A hunter who works for whoever pays.', 'Melee, and he throws shurikens.', 'One of his abilities is Shuriken Toss.', 'Another one is Shadow Walk.', 'His ultimate is Track.'] },
    { name: 'Queen of Pain', alt: ['QoP', 'Akasha'], hints: ['A demon who serves as the enforcer of a royal court.', 'Ranged, and she teleports short distances.', 'One of her abilities is Shadow Strike.', 'Another one is Scream of Pain.', 'Her ultimate is Sonic Wave.'] },
    { name: 'Bloodseeker', alt: ['BS', 'Strygwyr', 'Blood'], hints: ['The hound of twin goddesses, sent to hunt down the wounded.', 'Melee, and he gets faster when enemies are badly hurt.', 'One of his abilities is Bloodrage.', 'Another one is Blood Rite.', 'His ultimate is Rupture.'] },
    { name: 'Necrophos', alt: ['Necro', 'Necrolyte'], hints: ['A priest who spread a plague.', 'Ranged, and his death magic heals friends and harms enemies.', 'One of his abilities is Death Pulse.', 'Another one is Ghost Shroud.', "His ultimate is Reaper's Scythe."] },
    { name: 'Witch Doctor', alt: ['WD', 'Zharvakko'], hints: ['A healer from a jungle tribe who walks with a limp.', 'Ranged, and he uses voodoo.', 'One of his abilities is Paralyzing Cask.', 'Another one is Voodoo Restoration.', 'His ultimate is Death Ward.'] }
  ]
};
