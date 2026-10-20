#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');
const findLyrics = require('..');

const HELP = `Usage: simple-find-lyrics [options] <song and artist...>

Examples:
  simple-find-lyrics numb linkin park
  simple-find-lyrics --title numb --artist "linkin park"
  simple-find-lyrics --synced hello adele

Options:
  -t, --title <title>    Song title
  -a, --artist <artist>  Artist name
  -s, --synced           Print time-synced (LRC) lyrics
  -j, --json             Print the full result as JSON
  -h, --help             Show this help`;

async function main() {
	let parsed;
	try {
		parsed = parseArgs({
			allowPositionals: true,
			options: {
				title: { type: 'string', short: 't' },
				artist: { type: 'string', short: 'a' },
				synced: { type: 'boolean', short: 's' },
				json: { type: 'boolean', short: 'j' },
				help: { type: 'boolean', short: 'h' },
			},
		});
	} catch (err) {
		console.error(`${err.message}\n\n${HELP}`);
		return 2;
	}
	const { values, positionals } = parsed;
	const query = positionals.join(' ');
	if (values.help || (!query && !values.title)) {
		console.log(HELP);
		return values.help ? 0 : 2;
	}

	const input = values.title ? { title: values.title, artist: values.artist } : `${query} ${values.artist || ''}`;
	const result = await findLyrics(input);

	if (values.json) {
		console.log(JSON.stringify(result, null, 2));
	} else if (!result.stat) {
		console.error('No lyrics found.');
	} else {
		console.log(`${result.title} - ${result.artist}\n`);
		console.log(values.synced && result.synced ? result.synced : result.lyrics);
	}
	return result.stat ? 0 : 1;
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(err) => {
		console.error(err.message);
		process.exitCode = 1;
	},
);
