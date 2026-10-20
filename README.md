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
//   lyrics: "I'm tired of being what you want me to be\n...",
//   synced: "[00:21.42] I'm tired of being what you want me to be\n...",
//   source: 'LRCLIB'
// }
// or, when nothing is found
// {
//   stat: 0,
//   title: '',
//   artist: '',
//   lyrics: '',
//   synced: '',
//   source: ''
// }
```

TypeScript / ES modules:

```ts
import findLyrics from 'simple-find-lyrics';

const { stat, title, artist, lyrics } = await findLyrics('shape of you ed sheeran');
```

### Tips

- Include the artist in the query (`"hello adele"` rather than `"hello"`) to avoid getting a cover version.
- Any language works, e.g. `findLyrics('ทรงอย่างแบด')`.

### Options

```js
await findLyrics('numb linkin park', {
    timeout: 10000, // ms per request (default 10000)
    retries: 3,     // retries when the service is busy (default 3)
});
```

The promise rejects if the lyrics service cannot be reached or keeps answering with an error.
"Not found" is not an error; it resolves with `stat: 0`.

### Changelog

**0.1.0**
- Fixed: the package always returned `stat: 0`. Google search no longer serves lyrics to scripts, so lyrics now come from LRCLIB.
- Added `synced` (LRC time-synced lyrics), TypeScript types and an `options` argument.
- Removed all dependencies (`cheerio`, `node-fetch`, `encoding`, `typescript`). Requires Node.js 18+.

### Development

```sh
npm test
```
