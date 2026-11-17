// Hunch: every game whose characters can come up, in the order they are listed on the start card. SERVER ONLY.
//
// One file per game in content/hunch/, each with:
//   id     short code, stored with the player's rounds and settings: never change it once a game is live
//   name   the game's name, shown at the end of a round
//   short  a short name for the game toggles and the suggestions ("WoW")
//   names  every character a player may guess, shown as suggestions. Much longer than the cards, so the suggestions
//          do not give away who can come up.
//   cards  the characters that can come up: { name, alt: [other names players type], hints: [five hints] }
//
// The rules for hints (tests/hunch-api.js checks what it can):
//   - Hints 1 to 4 are lore, less obvious looks and equipment, and what the character does, each a little more
//     telling than the one before. They never name the character or one of its nicknames, and never an ability.
//   - Hint 5 names one ability, never the ultimate: "One of his abilities is ..." (his, her, its or their; "spells"
//     for a caster).
//   - Facts only. A wrong hint is a bug: report it and it gets fixed in that game's file.
//   - A name that is in two games (Viper, Phoenix, Ashe) is fine: either one counts as the right answer.
//   - Removing a card ends no round: a round that is still running with it is dealt again.
// The names are the games' publishers' trademarks. Ballpark uses the names only, never their artwork.
'use strict';
module.exports = ['dota', 'wow', 'lol', 'overwatch', 'valorant'].map(id => require('./hunch/' + id + '.js'));
