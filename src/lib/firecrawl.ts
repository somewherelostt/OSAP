
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2';
const FIRECRAWL_API_KEY = process.env.NEXT_PUBLIC_FIRECRAWL_API_KEY;

export interface FirecrawlMetadata {
  title?: string | string[];
  description?: string | string[];
  language?: string | string[];
  sourceURL?: string;
  url?: string;
  keywords?: string | string[];
  statusCode?: number;
  contentType?: string;
}

export interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    screenshot?: string;
    links?: string[];
    metadata: FirecrawlMetadata;
  };
  error?: string;
}

function getHeaders(): HeadersInit {
  return {
    'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export function isFirecrawlConfigured(): boolean {
  return !!(FIRECRAWL_API_KEY);
}

export async function scrapeUrl(
  url: string,
  options?: {
    onlyMainContent?: boolean;
    formats?: string[];
  }
): Promise<FirecrawlScrapeResult> {
  if (!FIRECRAWL_API_KEY) {
    return { success: false, error: 'Firecrawl API key not configured' };
  }

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        url,
        formats: options?.formats || ['markdown', 'links'],
        onlyMainContent: options?.onlyMainContent ?? true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Firecrawl API error' };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('[Firecrawl] Scrape error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function crawlUrl(
  url: string,
  options?: {
    maxDepth?: number;
    includePaths?: string[];
    excludePaths?: string[];
  }
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  if (!FIRECRAWL_API_KEY) {
    return { success: false, error: 'Firecrawl API key not configured' };
  }

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/crawl`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        url,
        maxDepth: options?.maxDepth || 2,
        includePaths: options?.includePaths || ['/*'],
        excludePaths: options?.excludePaths || [],
        limit: 50,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Firecrawl API error' };
    }

    const data = await response.json();
    return { success: true, jobId: data.jobId };
  } catch (error) {
    console.error('[Firecrawl] Crawl error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getCrawlStatus(
  jobId: string
): Promise<{
  success: boolean;
  status?: 'active' | 'completed' | 'failed';
  pages?: number;
  error?: string;
}> {
  if (!FIRECRAWL_API_KEY) {
    return { success: false, error: 'Firecrawl API key not configured' };
  }

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/crawl/${jobId}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Firecrawl API error' };
    }

    const data = await response.json();
    return {
      success: true,
      status: data.status,
      pages: data.totalPages || 0,
    };
  } catch (error) {
    console.error('[Firecrawl] Crawl status error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface IngestedKnowledge {
  sourceId: string;
  url: string;
  title: string;
  content: string;
  summary?: string;
  links: string[];
}

export async function scrapeAndPrepareForIngestion(
  url: string
): Promise<{ success: boolean; knowledge?: IngestedKnowledge; error?: string }> {
  const result = await scrapeUrl(url);

  if (!result.success || !result.data) {
    return { success: false, error: result.error || 'Failed to scrape URL' };
  }

  const metadata = result.data.metadata || {};
  const markdown = result.data.markdown || '';

  const knowledge: IngestedKnowledge = {
    sourceId: `web_${Buffer.from(url).toString('base64').substring(0, 20)}`,
    url: metadata.url || metadata.sourceURL || url,
    title: Array.isArray(metadata.title) ? metadata.title[0] : metadata.title || url,
    content: markdown,
    summary: markdown.substring(0, 500) + (markdown.length > 500 ? '...' : ''),
    links: result.data.links || [],
  };

  return { success: true, knowledge };
}
