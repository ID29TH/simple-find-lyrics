declare namespace findLyrics {
	interface Result {
		/** 1 when lyrics were found, 0 otherwise. */
		stat: 0 | 1;
		title: string;
		artist: string;
		album: string;
		/** Track length in seconds, or 0 when unknown. */
		duration: number;
		/** Plain lyrics text. */
		lyrics: string;
		/** Time-synced lyrics in LRC format, or '' when not available. */
		synced: string;
		source: string;
	}

	interface Song {
		title: string;
		artist?: string;
		/** Track length in seconds. Helps pick the right recording. */
		duration?: number;
	}

	interface Options {
		/** Request timeout in milliseconds. Default 10000. */
		timeout?: number;
		/** How many times to retry when the service is busy. Default 3. */
		retries?: number;
	}

	interface SearchOptions extends Options {
		/** Maximum number of songs to return. Default 10. */
		limit?: number;
	}

	interface LrcLine {
		/** Seconds from the start of the song. */
		time: number;
		text: string;
	}

	function search(query: string | Song, options?: SearchOptions): Promise<Result[]>;
	function search(title: string, artist: string, options?: SearchOptions): Promise<Result[]>;

	function parseLrc(lrc: string): LrcLine[];
}

declare function findLyrics(query: string | findLyrics.Song, options?: findLyrics.Options): Promise<findLyrics.Result>;
declare function findLyrics(title: string, artist: string, options?: findLyrics.Options): Promise<findLyrics.Result>;

export = findLyrics;
