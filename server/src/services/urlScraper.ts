import axios from 'axios';
import * as cheerio from 'cheerio';

export type UrlScrapeResult = {
  text: string;
  title: string;
  url: string;
};

// Elements that contain navigation/boilerplate rather than content
const BOILERPLATE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '.cookie-banner',
  '.advertisement',
  '.ads',
  '#sidebar',
].join(', ');

/**
 * Scrapes a public URL and extracts meaningful text content.
 * Removes boilerplate elements (nav, header, footer, scripts, styles).
 * Prioritizes <main>, <article>, or <body> content in that order.
 */
export async function scrapeUrl(rawUrl: string): Promise<UrlScrapeResult> {
  // Ensure the URL has a protocol
  const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;

  let html: string;

  try {
    const response = await axios.get<string>(url, {
      timeout: 15_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; PulseAI-Scraper/1.0; +https://pulseai.io)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      maxRedirects: 5,
    });
    html = response.data as string;
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? `HTTP ${err.response?.status ?? 'network error'}: ${err.message}`
      : String(err);
    throw new Error(`Failed to fetch URL "${url}": ${msg}`);
  }

  const $ = cheerio.load(html);

  // Grab the page title before stripping elements
  const pageTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text() ||
    $('h1').first().text() ||
    url;

  // Remove boilerplate
  $(BOILERPLATE_SELECTORS).remove();

  // Prefer semantic content containers; fall back to body
  const contentEl =
    $('main').length > 0
      ? $('main')
      : $('article').length > 0
      ? $('article')
      : $('[role="main"]').length > 0
      ? $('[role="main"]')
      : $('body');

  // Extract text and normalize whitespace
  const rawText = contentEl.text();
  const cleaned = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned || cleaned.length < 50) {
    throw new Error(
      `URL "${url}" yielded insufficient content (${cleaned.length} chars). ` +
        'The page may require JavaScript rendering or be behind a login.'
    );
  }

  return {
    text: cleaned,
    title: pageTitle.trim(),
    url,
  };
}
