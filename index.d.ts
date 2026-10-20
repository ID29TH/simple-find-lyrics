declare namespace findLyrics {
	interface Result {
		/** 1 when lyrics were found, 0 otherwise. */
		stat: 0 | 1;
		title: string;
		artist: string;
		/** Plain lyrics text. */
		lyrics: string;
		/** Time-synced lyrics in LRC format, or '' when not available. */
		synced: string;
		source: string;
	}

	interface Options {
		/** Request timeout in milliseconds. Default 10000. */
		timeout?: number;
		/** How many times to retry when the service is busy. Default 3. */
		retries?: number;
	}
}

declare function findLyrics(query: string, options?: findLyrics.Options): Promise<findLyrics.Result>;

export = findLyrics;
