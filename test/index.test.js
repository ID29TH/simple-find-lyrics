'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const findLyrics = require('..');
const { cleanTitle, cleanQuery } = findLyrics._internal;

const realFetch = global.fetch;

function mockFetch(responses) {
	const calls = [];
	global.fetch = async (url) => {
		calls.push(url);
		const next = responses.shift();
		return { ok: next.status === 200, status: next.status, json: async () => next.body };
	};
	return calls;
}

test.afterEach(() => {
	global.fetch = realFetch;
});

const entry = (trackName, artistName, extra = {}) => ({
	trackName,
	artistName,
	albumName: 'Album',
	duration: 187,
	instrumental: false,
	plainLyrics: `lyrics of ${trackName} by ${artistName}`,
	syncedLyrics: '[00:01.00] line',
	...extra,
});

test('cleanTitle strips artist and video noise', () => {
	assert.equal(cleanTitle('Linkin Park - Numb', 'Linkin Park'), 'Numb');
	assert.equal(cleanTitle('In The End [Official HD Music Video] - Linkin Park', 'Linkin Park'), 'In The End');
	assert.equal(cleanTitle('Ed_Sheeran_-_Shape_of_You_[Official_Video]', 'Ed Sheeran'), 'Shape of You');
	assert.equal(cleanTitle('Hello', 'Adele'), 'Hello');
});

test('cleanQuery removes brackets and separators', () => {
	assert.equal(cleanQuery('Linkin Park - In The End (Official Video)'), 'linkin park in the end');
});

test('returns the best matching song', async () => {
	const calls = mockFetch([
		{
			status: 200,
			body: [
				entry('linkin park', 'in the end'),
				entry('In The End (Live) - Linkin Park', 'Linkin Park'),
				entry('Linkin Park - In The End', 'Linkin Park'),
				entry('In the End', 'Linkin Park'),
				entry('In the End', 'Linkin Park', { instrumental: true, plainLyrics: null }),
			],
		},
	]);
	const result = await findLyrics('in the end linkin park');
	assert.match(calls[0], /^https:\/\/lrclib\.net\/api\/search\?q=in%20the%20end%20linkin%20park$/);
	assert.deepEqual(result, {
		stat: 1,
		title: 'In the End',
		artist: 'Linkin Park',
		album: 'Album',
		duration: 187,
		lyrics: 'lyrics of In the End by Linkin Park',
		synced: '[00:01.00] line',
		source: 'LRCLIB',
	});
});

test('works with non-Latin queries', async () => {
	mockFetch([{ status: 200, body: [entry('ทรงอย่างแบด', 'Paper Planes')] }]);
	const result = await findLyrics('ทรงอย่างแบด');
	assert.equal(result.stat, 1);
	assert.equal(result.artist, 'Paper Planes');
});

test('returns stat 0 when nothing is found', async () => {
	mockFetch([{ status: 200, body: [] }]);
	assert.deepEqual(await findLyrics('nothing here'), { stat: 0, title: '', artist: '', album: '', duration: 0, lyrics: '', synced: '', source: '' });
});

test('returns stat 0 for an empty query without calling the API', async () => {
	const calls = mockFetch([]);
	assert.equal((await findLyrics('   ')).stat, 0);
	assert.equal(calls.length, 0);
});

test('retries when the service is busy', async () => {
	const calls = mockFetch([
		{ status: 503, body: {} },
		{ status: 200, body: [entry('Hello', 'Adele')] },
	]);
	const result = await findLyrics('hello adele', { retries: 1 });
	assert.equal(calls.length, 2);
	assert.equal(result.title, 'Hello');
});

test('throws after running out of retries', async () => {
	mockFetch([{ status: 503, body: {} }]);
	await assert.rejects(findLyrics('hello adele', { retries: 0 }), /HTTP 503/);
});

test('title and artist can be given separately', async () => {
	const calls = mockFetch([{ status: 200, body: [entry('Numb', 'Some Cover Band'), entry('Numb', 'Linkin Park')] }]);
	const result = await findLyrics('Numb', 'Linkin Park');
	assert.equal(calls[0], 'https://lrclib.net/api/search?track_name=Numb&artist_name=Linkin+Park');
	assert.equal(result.artist, 'Linkin Park');
});

test('accepts an object and prefers the matching duration', async () => {
	mockFetch([
		{
			status: 200,
			body: [entry('Hello', 'Adele', { duration: 367, plainLyrics: 'long' }), entry('Hello', 'Adele', { duration: 295, plainLyrics: 'right' })],
		},
	]);
	const result = await findLyrics({ title: 'Hello', artist: 'Adele', duration: 296 });
	assert.equal(result.lyrics, 'right');
});

test('falls back to free-text search when the field search finds nothing', async () => {
	const calls = mockFetch([
		{ status: 200, body: [] },
		{ status: 200, body: [entry('Numb', 'Linkin Park')] },
	]);
	const result = await findLyrics({ title: 'Numb', artist: 'Linkin Prak' });
	assert.equal(calls.length, 2);
	assert.match(calls[1], /\?q=numb%20linkin%20prak$/);
	assert.equal(result.stat, 1);
});

test('options still work with the two-string form', async () => {
	const calls = mockFetch([
		{ status: 503, body: {} },
		{ status: 200, body: [entry('Hello', 'Adele')] },
	]);
	await findLyrics('Hello', 'Adele', { retries: 1 });
	assert.equal(calls.length, 2);
});

test('search returns distinct songs, best first, up to the limit', async () => {
	mockFetch([
		{
			status: 200,
			body: [
				entry('Bohemian Rhapsody', 'Some Cover Band'),
				entry('Bohemian Rhapsody', 'Queen'),
				entry('Bohemian Rhapsody', 'Queen'),
				entry('Bohemian Rhapsody', 'Another Band'),
			],
		},
	]);
	const results = await findLyrics.search('bohemian rhapsody queen', { limit: 2 });
	assert.deepEqual(
		results.map((r) => r.artist),
		['Queen', 'Some Cover Band'],
	);
});

test('search returns an empty array for an empty query', async () => {
	assert.deepEqual(await findLyrics.search(''), []);
});

test('parseLrc turns synced lyrics into timed lines', () => {
	const lrc = '[ar:Linkin Park]\n[00:21.42] I\'m tired\n[01:02.5][00:05.00] Chorus\n\nno timestamp';
	assert.deepEqual(findLyrics.parseLrc(lrc), [
		{ time: 5, text: 'Chorus' },
		{ time: 21.42, text: "I'm tired" },
		{ time: 62.5, text: 'Chorus' },
	]);
	assert.deepEqual(findLyrics.parseLrc(''), []);
});
