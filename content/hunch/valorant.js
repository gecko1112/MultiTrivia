// Hunch, game "Valorant": the agents. SERVER ONLY.
// Rules for the hints: content/hunch.js. Hand-written (by Claude), added 2026-11-17. Valorant tells less story
// than the other games, so more of these hints are about where an agent comes from and what their abilities do.
// The first hint, the agent's home country, is shared with heroes of other games (South Korea: D.Va and Jett).
// Players who know Valorant should check them.
// Valorant and its agents are trademarks of Riot Games.
module.exports = {
  id: 'valorant', name: 'Valorant', short: 'Valorant',
  names: ['Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher', 'Deadlock', 'Fade', 'Gekko', 'Harbor', 'Iso', 'Jett', 'KAY/O', 'Killjoy', 'Neon', 'Omen', 'Phoenix',
    'Raze', 'Reyna', 'Sage', 'Skye', 'Sova', 'Tejo', 'Viper', 'Vyse', 'Waylay', 'Yoru'],
  cards: [
    { name: 'Brimstone', alt: ['Brim'], hints: ['He is a veteran soldier from the United States.', 'He leads a secret organisation that protects the world from a mirror image of Earth.', 'He calls in smoke from above with a tablet strapped to his wrist.', 'His strongest move brings a laser down from orbit.', 'One of his abilities is Stim Beacon.'] },
    { name: 'Viper', alt: [], hints: ['She is a chemist from the United States.', 'She was one of the first agents to join, and works closely with their leader.', 'She wears a respirator mask and keeps her skin covered.', 'She floods areas with toxic gas, and enemies inside it weaken.', 'One of her abilities is Snake Bite.'] },
    { name: 'Phoenix', alt: [], hints: ['He is a young agent from London.', 'He is confident and flashy, and loves to show off.', 'Standing in his own flames heals him.', 'If he dies during his strongest move, he comes back to where he started it.', 'One of his abilities is Curveball.'] },
    { name: 'Sage', alt: [], hints: ['She comes from China.', 'She is the calm stronghold of her team, and keeps it alive.', 'She can raise a wall of ice to block a path.', 'She can bring a fallen teammate back to life.', 'One of her abilities is Slow Orb.'] },
    { name: 'Sova', alt: [], hints: ['He is a hunter from Russia.', 'He is calm and patient, and never loses a trail.', 'He fights with a high-tech bow.', 'He fires arrows that scan the area and reveal enemies.', 'One of his abilities is Owl Drone.'] },
    { name: 'Cypher', alt: [], hints: ['He comes from Morocco.', 'He is an information broker who trades in everyone\'s secrets.', 'He hides his face behind a mask and wears a wide-brimmed hat.', 'He covers the map with tripwires and hidden cameras.', 'One of his abilities is Cyber Cage.'] },
    { name: 'Reyna', alt: [], hints: ['She comes from Mexico.', 'Her eyes glow purple.', 'She feeds on the souls of the enemies she kills.', 'Consuming a soul heals her, or makes her untouchable for a moment.', 'One of her abilities is Leer.'] },
    { name: 'Killjoy', alt: [], hints: ['She is a young inventor from Germany.', 'She wears a yellow jacket, a beanie and big round glasses.', 'She builds gadgets that guard an area for her while she is away.', 'She sets up a turret and a little robot that hunts enemies down.', 'One of her abilities is Nanoswarm.'] },
    { name: 'Breach', alt: [], hints: ['He comes from Sweden.', 'Both of his arms are bionic.', 'He is loud and blunt, and likes to hit things.', 'He sends shockwaves through walls to stun and blind enemies on the other side.', 'One of his abilities is Fault Line.'] },
    { name: 'Omen', alt: [], hints: ['Nobody knows where he came from, not even himself.', 'He is a hooded figure with three glowing marks where his face should be.', 'He can step through the shadows to teleport.', 'He hides his team behind dark smoke and blinds his foes.', 'One of his abilities is Paranoia.'] },
    { name: 'Raze', alt: [], hints: ['She comes from Brazil.', 'She loves explosions more than anything.', 'She carries a launcher on her back, and sends out a little robot that rolls along and explodes.', 'She blasts herself into the air with her own explosives.', 'One of her abilities is Paint Shells.'] },
    { name: 'Skye', alt: [], hints: ['She comes from Australia.', 'She has a deep bond with nature, and her healing comes from it.', 'She fights alongside animals, such as a Tasmanian tiger.', 'She sends out a hawk that blinds her enemies.', 'One of her abilities is Regrowth.'] },
    { name: 'Yoru', alt: [], hints: ['He comes from Japan.', 'He is arrogant, and prefers to work alone.', 'He can open rifts and step between dimensions.', 'He sends out a copy of himself to fool his enemies.', 'One of his abilities is Gatecrash.'] },
    { name: 'KAY/O', alt: ['Kayo'], hints: ['He is a machine of war, from a future where the war went badly.', 'He was built for one purpose: to stop people with powers.', 'His knife shuts down the powers of anyone caught near it.', 'When he goes down, he can keep fighting until a teammate brings him back.', 'One of his abilities is FRAG/ment.'] },
    { name: 'Chamber', alt: [], hints: ['He is a weapons designer from France.', 'He wears a sharp suit, and stays calm and charming.', 'He builds his own guns, including a heavy sniper rifle.', 'He can teleport back to an anchor he sets down.', 'One of his abilities is Headhunter.'] },
    { name: 'Neon', alt: [], hints: ['She comes from the Philippines.', 'Her body makes more electricity than she can control.', 'She can sprint faster than any other agent.', 'She fires lines of electricity that become walls.', 'One of her abilities is Relay Bolt.'] },
    { name: 'Fade', alt: [], hints: ['She comes from Turkey.', 'She was a bounty hunter.', 'She uses people\'s nightmares to find them.', 'She sends out creatures made of nightmares to hunt her enemies.', 'One of her abilities is Haunt.'] },
    { name: 'Jett', alt: [], hints: ['She comes from South Korea.', 'She is fast and cocky, and loves to show off.', 'She glides through the air, carried on the wind.', 'She throws knives that come back to her when she gets a kill.', 'One of her abilities is Updraft.'] }
  ]
};
