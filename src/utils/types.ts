export interface Movie {
	title: string;
	year: string | undefined;
	streamLink: string | undefined;
	rating: string;
	img: { src: string | undefined; alt: string | undefined };
	description: string;
	duration: string;
}

export interface MovieStorage {
	page: number;
	totalPages: number;
	data: Movie[];
}
