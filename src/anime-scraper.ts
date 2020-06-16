import puppeteer from 'puppeteer';
import cheerio from 'cheerio';

const URL = 'https://gogoanime.pro';

// TODO get episodes link and streaming links with different servers

interface Anime {
	title: string;
	rating: string;
	episodes: string;
	description: string;
	link: string;
	img: string | undefined;
	type: string; //  dub or sub
}

const scrape = async () => {
	try {
		const browser = await puppeteer.launch({ headless: false }); // TODO reset  headless back to true or remove it. This is just for development
		const page = await browser.newPage();
		page.setUserAgent(
			'Mozilla/5.0 (Windows; U; MSIE 9.0; Windows NT 9.0; en-US);'
		);
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		//  wait for the page to load
		await page.waitForSelector('section.content');
		// gets the page html
		const html = await page.content();

		const $ = cheerio.load(html);

		// extract recent anime list from URL
		const recentAnime = $('div.last_episodes > ul.items.widget_content')
			.find('li')
			.toArray();

		// parse anime list
		const recentAnimeList: Anime[] = [];
		for (let i = 0; i < recentAnime.length; ++i) {
			const $elem = $(recentAnime[i]);

			const anchor = $elem.find('div.img > a.tooltipstered');
			const link = URL + anchor.attr('href');
			const title = $elem.find('p.name > a').text().trim();
			const img = anchor.find('img').attr('src')?.trim();
			const type = anchor.find('div.type').text()?.trim();

			let episodes = $elem.find('p.episode').text().trim();
			// eg: ep 15 => 15 or OVA => OVA
			episodes = episodes.split(' ')[1]
				? episodes.split(' ')[1]
				: episodes;

			// open anime page
			await page.goto(link, { waitUntil: 'domcontentloaded' });
			await page.waitForSelector(
				'div.anime_video_body_cate > div.anime_info'
			);
			const html = await page.content();
			const $anime = cheerio.load(html);

			const animeInfo = $anime(
				'div.anime_video_body_cate > div.anime_info'
			).find('dl')[1]; // for the rating container

			const score = $anime($anime(animeInfo).find('dd').toArray()[2])
				.text()
				.trim()
				.split(' / ')[0];

			const desc = $anime('div.anime_video_body_cate > div.anime_info')
				.find('div.desc')
				.text();

			const anime: Anime = {
				title,
				episodes,
				link,
				type,
				img,
				description: desc,
				rating: score === '0' ? 'Not rated yet' : score,
			};
			recentAnimeList.push(anime);
		}

		await browser.close();
		console.log(recentAnimeList);
	} catch (error) {
		console.log(error);
	}
};

scrape();
