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
	assert.deepEqual(await findLyrics('nothing here'), { stat: 0, title: '', artist: '', lyrics: '', synced: '', source: '' });
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
