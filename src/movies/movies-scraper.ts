import puppeteer from 'puppeteer-core';
import cheerio from 'cheerio';
import fs from 'fs';
import util from 'util';

import { Movie, MovieStorage } from '../utils/types';

// ! just for progress visualization
import cliProgress from 'cli-progress';

// make fs.readFile a promise
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const URL = 'https://vw.ffmovies.sc/movies';
const MAX_WAIT_TIME = 2000; // 2s

const loadPage = async (page: puppeteer.Page, url: string) => {
	//  wait for the page to load
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('div.widget-body > div.row.movie-list');
	// gets the page html
	const html = await page.content();
	const $ = cheerio.load(html);

	return $;
};

export const parseMovies = async (
	$: CheerioStatic,
	moviesToParse: CheerioElement[],
	page: puppeteer.Page
) => {
	// ! just for progress visualization
	const fetchProgress = new cliProgress.SingleBar(
		{},
		cliProgress.Presets.shades_classic
	);
	fetchProgress.start(moviesToParse.length, 0);
	// ! just for progress visualization

	const movies: Movie[] = [];
	for (let i = 0; i < moviesToParse.length; ++i) {
		// ! just for progress visualization
		fetchProgress.increment();
		// ! just for progress visualization

		const $elem = $(moviesToParse[i]);
		const poster = $elem.find('a.poster');
		const link = poster.attr('href') + 'watching';
		const year = poster
			.attr('href')
			?.split('-')
			.slice(-1)[0]
			.replace(/\//, '');
		const img = {
			src: poster.find('img.lazy').attr('src'),
			alt: poster
				.find('img.lazy')
				.attr('alt')
				?.replace(/Fmovies/gi, ''),
		};
		const title = $elem.find('a.name').text();

		// wait for the movie page to load
		try {
			await page.goto(link, {
				waitUntil: 'domcontentloaded',
				timeout: MAX_WAIT_TIME,
			});
			await page.waitForSelector('#movie', { timeout: MAX_WAIT_TIME });
		} catch {
			continue;
		}

		const html = await page.content();
		const $movie = cheerio.load(html);

		const movieInfo = $movie('#info > div.row > div.info > div');
		const desc = movieInfo.find('div.desc > div.fullcontent').text();
		const rating = movieInfo.find('div.meta > span > span.imdb + b').text();
		const duration = movieInfo
			.find('div.meta span > i.fa.fa-clock-o + b')
			.text();

		let streamLink = undefined;

		const directorContainer = movieInfo.find('div.row > dl > dd')[2];
		const director = $movie(directorContainer).find('a').text();
		const genreContainer = movieInfo.find('div.row > dl > dd')[0];
		const genre = $movie(genreContainer)
			.find('a')
			.map((_, genre) => $movie(genre).text())
			.toArray();

		try {
			await page.waitForFunction(
				"document.getElementById('iframe-embed').getAttribute('src')",
				{ timeout: MAX_WAIT_TIME }
			);
			streamLink = $movie('#iframe-embed').attr('src');
		} catch {}

		const movie: Movie = {
			title,
			director,
			genre,
			img,
			year,
			rating,
			description: desc,
			duration,
			streamLink,
		};
		movies.push(movie);
	}

	fetchProgress.stop();

	return movies;
};

const main = async () => {
	const movies: Movie[] = [];
	let lastPage = 0;
	let totalPages = 0;

	try {
		const data = await readFile('movies.json', { encoding: 'utf8' });
		if (!data) {
			lastPage = 0;
			totalPages = 0;
		} else {
			const parsedData = JSON.parse(data);
			lastPage = +parsedData.page;
			totalPages = +parsedData.totalPages;
			const storedMovies = parsedData.data;
			movies.push(...storedMovies);
		}
	} catch (error) {
		lastPage = 0;
		totalPages = 0;
	}

	try {
		const options: puppeteer.LaunchOptions = {
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-accelerated-2d-canvas',
				'--disable-gpu',
			],
			headless: true,
			executablePath:
				'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		};
		const browser = await puppeteer.launch(options);
		const page = await browser.newPage();
		page.setCacheEnabled(false);
		page.setUserAgent(
			'Mozilla/5.0 (Windows; U; MSIE 9.0; Windows NT 9.0; en-US);'
		);

		if (lastPage === 0) {
			let $;
			try {
				$ = await loadPage(page, URL);
			} catch {
				console.log("Page didn't load");
				process.exit(1);
			}

			// get how many pages. Will be used to fetch movies from the other pages: like page 2 or 3
			const lastPageLink = $(
				$('div.paging > ul.pagination > li > a').slice(-1)[0]
			).attr('href');
			totalPages = lastPageLink
				? +lastPageLink.slice(0, -1).split('/').slice(-1)[0]
				: 0;

			// extract movie lists
			const unparsedMovies = $(
				'div.widget-body > div.row.movie-list > div'
			).toArray();

			console.warn(`\n\t========== PAGE  ${1}/${totalPages} ==========`);

			// parse extracted movies
			let parsedMovies: Movie[] = [];
			try {
				parsedMovies = await parseMovies($, unparsedMovies, page);
			} catch {
				parsedMovies = [];
			}
			movies.push(...parsedMovies);

			// save the page movies
			const movieStorage: MovieStorage = {
				page: 1,
				totalPages,
				data: movies,
			};

			try {
				await writeFile('movies.json', JSON.stringify(movieStorage));
				console.info('Page 1 saved');
			} catch (error) {
				console.error(error);
			}
			lastPage = 1;
		}

		// loop all movie pages. First page is excluded because it's loaded by default
		for (let i = lastPage + 1; i <= totalPages; ++i) {
			console.warn(
				`\n\n\t========== PAGE  ${i}/${totalPages} ==========`
			);

			let $;
			try {
				$ = await loadPage(page, URL + '/page/' + i);
			} catch {
				// load next page if this failed
				continue;
			}

			// extract movie lists
			const unparsedMovies = $(
				'div.widget-body > div.row.movie-list > div'
			).toArray();

			let parsedMovies: Movie[] = [];
			try {
				parsedMovies = await parseMovies($, unparsedMovies, page);
			} catch {
				continue;
			}

			movies.push(...parsedMovies);
			// save the page movies
			const movieStorage: MovieStorage = {
				page: i,
				totalPages,
				data: movies,
			};

			try {
				await writeFile('movies.json', JSON.stringify(movieStorage));
				console.info(`Page ${i} saved`);
			} catch (error) {
				console.error(error);
				continue;
			}
		}

		await browser.close();
	} catch (error) {
		console.log(error);
		process.exit(1);
	}
};

main();
