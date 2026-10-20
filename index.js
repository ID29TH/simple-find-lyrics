'use strict';

// Lyrics come from LRCLIB (https://lrclib.net), a free lyrics API that needs no key.
// The old version scraped Google search results, which now require JavaScript.
const API_URL = 'https://lrclib.net/api/search';
const USER_AGENT = 'simple-find-lyrics (https://github.com/ID29TH/simple-find-lyrics)';
const SOURCE = 'LRCLIB';

const DEFAULTS = { timeout: 10000, retries: 3 };

// Words that usually mean "not the studio version" when they are not in the query.
const NOISE_WORDS = ['live', 'instrumental', 'karaoke', 'cover', 'remix', 'acoustic', 'sped', 'slowed', 'reverb', 'nightcore', 'tour'];

const EMPTY = Object.freeze({ stat: 0, title: '', artist: '', album: '', duration: 0, lyrics: '', synced: '', source: '' });

const clearRegex = /((\[|\()(?!.*?(remix|edit|remake)).*?(\]|\))|\/+|-+| x |,|"|video oficial|official lyric video| ft\.?|\|+|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]|❌)/g;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanQuery(s) {
	return String(s).toLowerCase().replace(clearRegex, ' ').replace(/\s+/g, ' ').trim();
}

// Lowercase words, keeping letters and numbers from any script (so Thai, Japanese, etc. work).
function tokenize(s) {
	return String(s).toLowerCase().normalize('NFKC').match(/[\p{L}\p{M}\p{N}']+/gu) || [];
}

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Many LRCLIB entries are uploaded with YouTube-style titles such as
// "Artist - Song (Official Music Video)". Strip that down to "Song".
function cleanTitle(trackName, artistName) {
	let title = String(trackName || '')
		.replace(/_/g, ' ')
		.replace(/\s*[[(][^\])]*(official|video|audio|lyrics?|upgrade|hd|4k|mv|visualizer)[^\])]*[\])]/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (artistName) {
		const artist = escapeRegex(String(artistName).trim());
		title = title
			.replace(new RegExp(`^${artist}\\s*[-–—:|]\\s*`, 'i'), '')
			.replace(new RegExp(`\\s*[-–—|]\\s*${artist}$`, 'i'), '')
			.trim();
	}
	return title || String(trackName || '').trim();
}

// `want` describes what the caller asked for: { tokens, artist?, duration? }.
function score(entry, want) {
	const title = cleanTitle(entry.trackName, entry.artistName);
	const titleTokens = new Set(tokenize(title));
	const artistTokens = new Set(tokenize(entry.artistName));
	const allTokens = new Set([...titleTokens, ...artistTokens]);
	const query = new Set(want.tokens);

	let points = 0;
	for (const token of query) {
		if (allTokens.has(token)) points += 10;
	}
	// The whole title should be part of what the user typed.
	if (titleTokens.size && [...titleTokens].every((t) => query.has(t))) points += 15;
	// Prefer entries whose metadata is already clean.
	if (title === String(entry.trackName).trim()) points += 5;
	// Penalise live / cover / remix versions unless they were asked for.
	for (const word of NOISE_WORDS) {
		if (titleTokens.has(word) && !query.has(word)) points -= 8;
	}
	// Uploads like "Artist - Song" / "Artist - Song" put the same text in both fields.
	if (String(entry.trackName).trim().toLowerCase() === String(entry.artistName).trim().toLowerCase()) points -= 20;
	// When the artist was given on its own, it has to match.
	if (want.artist) {
		points += tokenize(want.artist).every((t) => artistTokens.has(t)) ? 20 : -10;
	}
	// A known track length is a strong hint for picking the right recording.
	if (want.duration && entry.duration) {
		const diff = Math.abs(entry.duration - want.duration);
		if (diff <= 2) points += 10;
		else if (diff > 10) points -= 10;
	}
	if (entry.syncedLyrics) points += 1;
	return points;
}

function songKey(entry) {
	return `${tokenize(cleanTitle(entry.trackName, entry.artistName)).join(' ')}|${tokenize(entry.artistName).join(' ')}`;
}

// Returns usable entries, best match first.
function rank(entries, want) {
	const candidates = entries.filter((entry) => entry && !entry.instrumental && entry.plainLyrics);
	// The same song is often uploaded many times. A title/artist pair that shows up
	// repeatedly is far more likely to be right than a one-off with swapped fields.
	const votes = new Map();
	for (const entry of candidates) {
		const key = songKey(entry);
		votes.set(key, (votes.get(key) || 0) + 1);
	}
	return candidates
		.map((entry, index) => ({ entry, index, points: score(entry, want) + 3 * Math.min(votes.get(songKey(entry)) - 1, 5) }))
		.sort((a, b) => b.points - a.points || a.index - b.index)
		.map(({ entry }) => entry);
}

function pickBest(entries, want) {
	return rank(entries, want)[0] || null;
}

async function request(url, { timeout, retries }) {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, {
			headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
			signal: AbortSignal.timeout(timeout),
		});
		if (res.ok) return res.json();
		if (res.status === 404) return [];
		// LRCLIB answers 429/503 when it is busy; wait a little and try again.
		if ((res.status === 429 || res.status >= 500) && attempt < retries) {
			await sleep(1000 * 2 ** attempt);
			continue;
		}
		throw new Error(`simple-find-lyrics: lyrics service responded with HTTP ${res.status}`);
	}
}

// Turns the different call styles into one shape:
//   (query), ({ title, artist, duration }), (title, artist)
// each optionally followed by an options object.
function normalizeInput(input, artistOrOptions, maybeOptions) {
	let song = input;
	let options = artistOrOptions;
	if (typeof artistOrOptions === 'string') {
		song = { title: String(input ?? ''), artist: artistOrOptions };
		options = maybeOptions;
	}
	options = { ...DEFAULTS, ...options };

	if (song && typeof song === 'object') {
		const title = String(song.title ?? '').trim();
		const artist = String(song.artist ?? '').trim();
		const duration = Number(song.duration) || 0;
		return { title, artist, duration, query: cleanQuery(`${title} ${artist}`), options };
	}
	return { title: '', artist: '', duration: 0, query: cleanQuery(song ?? ''), options };
}

async function fetchEntries({ title, artist, query, options }) {
	if (title) {
		// LRCLIB can search the title and artist fields separately, which gives much cleaner results.
		const params = new URLSearchParams({ track_name: title });
		if (artist) params.set('artist_name', artist);
		const entries = await request(`${API_URL}?${params}`, options);
		if (Array.isArray(entries) && entries.length) return entries;
	}
	if (!query) return [];
	const entries = await request(`${API_URL}?q=${encodeURIComponent(query)}`, options);
	return Array.isArray(entries) ? entries : [];
}

function toResult(entry) {
	return {
		stat: 1,
		title: cleanTitle(entry.trackName, entry.artistName),
		artist: entry.artistName || '',
		album: entry.albumName || '',
		duration: entry.duration || 0,
		lyrics: entry.plainLyrics,
		synced: entry.syncedLyrics || '',
		source: SOURCE,
	};
}

/**
 * Search for song lyrics and return the best match.
 *
 * findLyrics('numb linkin park')
 * findLyrics('numb', 'linkin park')
 * findLyrics({ title: 'numb', artist: 'linkin park', duration: 187 })
 */
const finderLyrics = async function (input, artistOrOptions, maybeOptions) {
	const req = normalizeInput(input, artistOrOptions, maybeOptions);
	if (!req.query) return { ...EMPTY };

	const entries = await fetchEntries(req);
	const best = pickBest(entries, { tokens: tokenize(req.query), artist: req.artist, duration: req.duration });
	return best ? toResult(best) : { ...EMPTY };
};

/**
 * Like findLyrics, but returns up to `options.limit` (default 10) different songs, best first.
 */
async function search(input, artistOrOptions, maybeOptions) {
	const req = normalizeInput(input, artistOrOptions, maybeOptions);
	if (!req.query) return [];

	const limit = req.options.limit ?? 10;
	const entries = await fetchEntries(req);
	const seen = new Set();
	const results = [];
	for (const entry of rank(entries, { tokens: tokenize(req.query), artist: req.artist, duration: req.duration })) {
		const key = songKey(entry);
		if (seen.has(key)) continue;
		seen.add(key);
		results.push(toResult(entry));
		if (results.length >= limit) break;
	}
	return results;
}

/**
 * Parse LRC text ("[00:21.42] line") into [{ time: 21.42, text: 'line' }], sorted by time.
 */
function parseLrc(lrc) {
	const lines = [];
	for (const raw of String(lrc || '').split(/\r?\n/)) {
		const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
		if (!stamps.length) continue;
		const text = raw.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
		for (const [, min, sec] of stamps) {
			lines.push({ time: Math.round((Number(min) * 60 + Number(sec)) * 1000) / 1000, text });
		}
	}
	return lines.sort((a, b) => a.time - b.time);
}

module.exports = finderLyrics;
module.exports.default = finderLyrics;
module.exports.search = search;
module.exports.parseLrc = parseLrc;
module.exports._internal = { cleanQuery, cleanTitle, tokenize, pickBest, normalizeInput };
