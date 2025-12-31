const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://amazfitwatchfaces.com';

// Realistic User-Agent to avoid simple bot detection
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    try {
        console.log(`Starting Axios/Cheerio scraper for: ${query}`);
        let allWatchFaces = [];
        const seenLinks = new Set();

        let currentUrl = `${BASE_URL}/search/gtr/text/${encodeURIComponent(query)}?compatible=GTR_3&paid=0`;
        let pagesCrawled = 0;

        while (currentUrl) {
            pagesCrawled++;
            console.log(`Crawling: ${currentUrl} (Items so far: ${allWatchFaces.length})`);

            const response = await axios.get(currentUrl, { headers: HEADERS, timeout: 15000 });
            const $ = cheerio.load(response.data);

            const items = $('.panel.wf-panel');
            if (items.length === 0) break;

            items.each((i, el) => {
                const item = $(el);
                const title = item.attr('title');
                const img = item.find('.wf-img');
                const link = item.find('a.wf-act');
                const author = item.find('.wf-user a');

                if (title && img.length && link.length) {
                    let imgSrc = img.attr('src');
                    let detailLink = link.attr('href');

                    const absoluteImage = imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`;
                    const absoluteLink = detailLink.startsWith('http') ? detailLink : `${BASE_URL}${detailLink}`;

                    if (!seenLinks.has(absoluteLink)) {
                        seenLinks.add(absoluteLink);
                        allWatchFaces.push({
                            title: title,
                            image: absoluteImage,
                            link: absoluteLink,
                            author: author.length ? author.text().trim() : 'Unknown'
                        });
                    }
                }
            });

            // Handle pagination
            let nextUrl = null;
            const paginationLinks = $('ul.pagination li a');
            paginationLinks.each((i, el) => {
                const a = $(el);
                if (a.text().includes('Next →')) {
                    const parentLi = a.parent();
                    if (!parentLi.hasClass('disabled')) {
                        const href = a.attr('href');
                        if (href && href !== '#') {
                            nextUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                        }
                    }
                }
            });

            currentUrl = nextUrl;
            if (pagesCrawled > 50) break;
        }

        console.log(`Successfully scraped ${allWatchFaces.length} unique items for "${query}"`);
        res.status(200).json({
            success: true,
            query,
            count: allWatchFaces.length,
            data: allWatchFaces
        });

    } catch (error) {
        console.error('Scraping error:', error.message);
        res.status(500).json({
            success: false,
            message: error.response?.status === 403 ? 'Access denied by server. Try a different search term or wait a few minutes.' : 'Failed to fetch data',
            error: error.message
        });
    }
};
