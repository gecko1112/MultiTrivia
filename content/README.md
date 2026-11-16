# Questions and where they come from

Everything in this folder stays on the server and is never sent to the browser as a whole. A player only learns an answer after giving theirs.

| File | What it is | Where it comes from |
|---|---|---|
| `survival.js` | Survival's 319 standard questions, also used by Party and More/Less's trivia round | Written by hand (by Claude) from well-known facts. Each note gives the exact figure, a range, or the source. |
| `guessless.js` | Guessless questions by category | Written by hand the same way |
| `moreless.js` | More/Less cards | Read from public lists on the date in the file header: IMDb charts, Wikipedia's box-office and Spotify lists |
| `packs/*.js` | Survival question packs (Plus) | See below |
| `clueless.js`, `wordy.js` | Word lists | Not questions; word and similarity data |

## Question packs

One file per pack in `packs/`. The file name is the pack's id, and the pack appears in Survival's "Questions" list on its own.

```js
module.exports = { name: 'Animals', order: 20, about: 'where the facts come from', q: [
  { q: 'How long is a giraffe\'s tongue?', a: 50, u: 'centimetres', n: 'About 45–50 cm.' }
] };
```

- `q` the question, ending in a question mark
- `a` the answer, a number above zero (scoring compares orders of magnitude)
- `u` the unit, shown with the question
- `n` the note shown with the answer: the exact figure, the range, or the source

| Pack | Questions | Source |
|---|---|---|
| Countries by size | 170 | Made from Natural Earth map data by `tools/build-packs.js` |
| Neighbours | 157 | Made from the Atlas map by `tools/build-packs.js`. Each note lists the neighbours |
| Animals, Sports and games, Food and drink | 26–33 each | Written by hand from widely documented figures |

`node tests/run.js content` checks every pack: format, at least 20 questions, and no question that repeats one from another pack or from Survival's standard questions.

## Getting more questions

- **Written by hand.** Fast and good for themes. Choose facts that are well documented and do not change every year. Give a range in the note when sources differ, and check a sample before publishing.
- **Made from open data.** Best for large packs with one pattern ("How tall is ...?", "When was ... founded?"). Good sources: Wikidata (CC0, no attribution needed), Natural Earth (public domain), World Bank open data (CC BY 4.0, needs a credit line). Write a builder like `tools/build-packs.js`, so the pack can be rebuilt when the data changes.
- **Not allowed:** copying another quiz's questions or a curated list wholesale. Facts are free to use. Someone else's selection and wording are not.
