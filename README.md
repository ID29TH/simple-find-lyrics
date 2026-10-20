<p>
  <a href="https://www.npmjs.com/package/simple-find-lyrics" target="_blank">
    <img alt="Version" src="https://img.shields.io/npm/v/simple-find-lyrics.svg" />
  </a>
</p>

> Search for lyrics with artist, song title and source.

Lyrics are looked up on [LRCLIB](https://lrclib.net), a free lyrics database that needs no API key.
Results include plain lyrics and, when available, time-synced lyrics in LRC format.

### Requirements

Node.js 18 or newer. The package has no dependencies.

### Installation

```sh
npm install --save simple-find-lyrics
```

### Usage

```js
const findLyrics = require('simple-find-lyrics');

async function lyrics(s) {
    const lyrics = await findLyrics(s);
    console.log(lyrics);
}

lyrics("numb linkin park");

// Output

// {
//   stat: 1,
//   title: 'Numb',
//   artist: 'Linkin Park',
//   album: 'Meteora',
//   duration: 187,
//   lyrics: "I'm tired of being what you want me to be\n...",
//   synced: "[00:21.42] I'm tired of being what you want me to be\n...",
//   source: 'LRCLIB'
// }
// or, when nothing is found
// {
//   stat: 0,
//   title: '',
//   artist: '',
//   album: '',
//   duration: 0,
//   lyrics: '',
//   synced: '',
//   source: ''
// }
```

#### Song title and artist separately

More accurate than free text, because the title and artist are matched on their own fields.

```js
await findLyrics('numb', 'linkin park');

// or as an object; `duration` (seconds) helps pick the right recording
await findLyrics({ title: 'hello', artist: 'adele', duration: 295 });
```

If nothing matches the separate fields, it falls back to a free-text search of title + artist.

#### Several results

`search` returns up to `limit` (default 10) different songs, best match first. Handy for letting users choose.

```js
const results = await findLyrics.search('bohemian rhapsody', { limit: 5 });
results.forEach((r) => console.log(r.title, '-', r.artist));
```

#### Synced lyrics (karaoke)

`parseLrc` turns the `synced` text into timed lines.

```js
const { synced } = await findLyrics('numb', 'linkin park');
findLyrics.parseLrc(synced);
// [ { time: 21.42, text: "I'm tired of being what you want me to be" }, ... ]
```

#### TypeScript / ES modules

```ts
import findLyrics from 'simple-find-lyrics';

const { stat, title, artist, lyrics } = await findLyrics('shape of you', 'ed sheeran');
```

#### Command line

```sh
npx simple-find-lyrics numb linkin park
npx simple-find-lyrics --title numb --artist "linkin park"
npx simple-find-lyrics --synced hello adele
npx simple-find-lyrics --json numb linkin park
```

### Tips

- Give the artist (`findLyrics('hello', 'adele')`) to avoid getting a cover version. Spelling matters: a misspelled artist usually finds nothing.
- Any language works, e.g. `findLyrics('ทรงอย่างแบด', 'paper planes')`.

### Options

The last argument can be an options object:

```js
await findLyrics('numb linkin park', {
    timeout: 10000, // ms per request (default 10000)
    retries: 3,     // retries when the service is busy (default 3)
});
```

The promise rejects if the lyrics service cannot be reached or keeps answering with an error.
"Not found" is not an error; it resolves with `stat: 0` (or an empty array from `search`).

### Changelog

**0.2.0**
- Added: song title and artist can be given separately, `findLyrics('numb', 'linkin park')` or `findLyrics({ title, artist, duration })`.
- Added: `findLyrics.search()` returns several matches.
- Added: `findLyrics.parseLrc()` turns synced lyrics into timed lines.
- Added: `album` and `duration` fields in the result.
- Added: command line tool, `npx simple-find-lyrics numb linkin park`.

**0.1.0**
- Fixed: the package always returned `stat: 0`. Google search no longer serves lyrics to scripts, so lyrics now come from LRCLIB.
- Added `synced` (LRC time-synced lyrics), TypeScript types and an `options` argument.
- Removed all dependencies (`cheerio`, `node-fetch`, `encoding`, `typescript`). Requires Node.js 18+.

### Development

```sh
npm test
```
