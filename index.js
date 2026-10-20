'use strict';

// Lyrics come from LRCLIB (https://lrclib.net), a free lyrics API that needs no key.
// The old version scraped Google search results, which now require JavaScript.
const API_URL = 'https://lrclib.net/api/search';
const USER_AGENT = 'simple-find-lyrics (https://github.com/ID29TH/simple-find-lyrics)';
const SOURCE = 'LRCLIB';

const DEFAULTS = { timeout: 10000, retries: 3 };

// Words that usually mean "not the studio version" when they are not in the query.
const NOISE_WORDS = ['live', 'instrumental', 'karaoke', 'cover', 'remix', 'acoustic', 'sped', 'slowed', 'reverb', 'nightcore', 'tour'];

const EMPTY = Object.freeze({ stat: 0, title: '', artist: '', lyrics: '', synced: '', source: '' });

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

function score(entry, queryTokens) {
	const title = cleanTitle(entry.trackName, entry.artistName);
	const titleTokens = new Set(tokenize(title));
	const artistTokens = new Set(tokenize(entry.artistName));
	const allTokens = new Set([...titleTokens, ...artistTokens]);
	const query = new Set(queryTokens);

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
	if (entry.syncedLyrics) points += 1;
	return points;
}

function songKey(entry) {
	return `${tokenize(cleanTitle(entry.trackName, entry.artistName)).join(' ')}|${tokenize(entry.artistName).join(' ')}`;
}

function pickBest(entries, query) {
	const queryTokens = tokenize(query);
	const candidates = entries.filter((entry) => entry && !entry.instrumental && entry.plainLyrics);
	// The same song is often uploaded many times. A title/artist pair that shows up
	// repeatedly is far more likely to be right than a one-off with swapped fields.
	const votes = new Map();
	for (const entry of candidates) {
		const key = songKey(entry);
		votes.set(key, (votes.get(key) || 0) + 1);
	}
	let best = null;
	let bestScore = -Infinity;
	for (const entry of candidates) {
		const points = score(entry, queryTokens) + 3 * Math.min(votes.get(songKey(entry)) - 1, 5);
		if (points > bestScore) {
			best = entry;
			bestScore = points;
		}
	}
	return best;
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

/**
 * Search for song lyrics.
 *
 * @param {string} s Free text such as "numb linkin park".
 * @param {{ timeout?: number, retries?: number }} [options]
 * @returns {Promise<{ stat: 0 | 1, title: string, artist: string, lyrics: string, synced: string, source: string }>}
 */
const finderLyrics = async function (s, options = {}) {
	const query = cleanQuery(s ?? '');
	if (!query) return { ...EMPTY };

	const opts = { ...DEFAULTS, ...options };
	const entries = await request(`${API_URL}?q=${encodeURIComponent(query)}`, opts);
	const best = Array.isArray(entries) ? pickBest(entries, query) : null;
	if (!best) return { ...EMPTY };

	return {
		stat: 1,
		title: cleanTitle(best.trackName, best.artistName),
		artist: best.artistName || '',
		lyrics: best.plainLyrics,
		synced: best.syncedLyrics || '',
		source: SOURCE,
	};
};

module.exports = finderLyrics;
module.exports.default = finderLyrics;
module.exports._internal = { cleanQuery, cleanTitle, tokenize, pickBest };
