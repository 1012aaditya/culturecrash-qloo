import "server-only";

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  category: "news" | "community" | "encyclopedic" | "subcultural" | "video";
  publishedDate?: string | null;
};

function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return unescapeHtml(html.replace(/<[^>]*>/g, " "));
}

/** 1. Exa.ai Neural Vibe Search (finds underground blogs & Substack essays) */
export async function searchExa(query: string, maxResults = 3): Promise<WebSearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query,
        type: "neural",
        useAutoprompt: true,
        numResults: maxResults,
        contents: { text: { maxCharacters: 300 } },
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; text?: string; author?: string }> };
    return (data.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title ?? "Subcultural Analysis",
      url: r.url ?? "",
      snippet: r.text ? r.text.slice(0, 280) : "",
      source: r.url ? `Exa (${new URL(r.url).hostname.replace(/^www\./, "")})` : "Exa.ai",
      category: "subcultural",
      publishedDate: null,
    }));
  } catch {
    return [];
  }
}

/** 2. Reddit Community Sentiment (100% Free Public Feed) */
export async function searchReddit(query: string, maxResults = 3): Promise<WebSearchResult[]> {
  const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=relevance`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: WebSearchResult[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;

    let match: RegExpExecArray | null;
    while ((match = entryRegex.exec(xml)) !== null && items.length < maxResults) {
      const block = match[1];
      const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
      const rawLink = block.match(/<link[^>]*href="([^"]*)"/)?.[1] ?? "";
      const rawPubDate = block.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? null;
      const rawCategory = block.match(/<category[^>]*label="([^"]*)"/)?.[1] ?? "r/community";
      const rawContent = block.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? "";

      const title = unescapeHtml(rawTitle);
      const snippet = stripTags(rawContent).slice(0, 250) || title;
      if (title && rawLink) {
        items.push({
          title,
          url: rawLink,
          snippet,
          source: `Reddit (${rawCategory})`,
          category: "community",
          publishedDate: rawPubDate,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

/** 3. Wikipedia Encyclopedic Provenance (100% Free Public API) */
export async function searchWikipedia(query: string, maxResults = 2): Promise<WebSearchResult[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=${maxResults}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CultureCrash/1.0 (agency research agent)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { query?: { search?: Array<{ title: string; snippet: string }> } };
    return (data.query?.search ?? []).slice(0, maxResults).map((item) => ({
      title: item.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
      snippet: stripTags(item.snippet).slice(0, 260),
      source: "Wikipedia (Verified Provenance)",
      category: "encyclopedic",
      publishedDate: null,
    }));
  } catch {
    return [];
  }
}

/** 4. Wikidata Structured Knowledge Graph (100% Free Public API) */
export async function searchWikidata(query: string, maxResults = 2): Promise<WebSearchResult[]> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=${maxResults}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CultureCrash/1.0 (agency research agent)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      search?: Array<{
        id: string;
        label: string;
        description?: string;
        url?: string;
      }>;
    };
    return (data.search ?? []).slice(0, maxResults).map((item) => {
      const pageUrl = item.url
        ? item.url.startsWith("//")
          ? `https:${item.url}`
          : item.url
        : `https://www.wikidata.org/wiki/${item.id}`;
      return {
        title: `${item.label} (${item.id})`,
        url: pageUrl,
        snippet: item.description
          ? `Wikidata Entity [${item.id}]: ${item.description}`
          : `Wikidata Entity [${item.id}]`,
        source: "Wikidata (Knowledge Graph)",
        category: "encyclopedic",
        publishedDate: null,
      };
    });
  } catch {
    return [];
  }
}

/** 5. YouTube Data API v3 (Cultural Video Essays & Commentary) */
export async function searchYouTube(query: string, maxResults = 2): Promise<WebSearchResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string } }> };
    return (data.items ?? []).filter((item) => item.id?.videoId).map((item) => ({
      title: unescapeHtml(item.snippet?.title ?? "YouTube Cultural Commentary"),
      url: `https://www.youtube.com/watch?v=${item.id!.videoId}`,
      snippet: (item.snippet?.description ?? "").slice(0, 250),
      source: `YouTube (${item.snippet?.channelTitle ?? "Creator"})`,
      category: "video",
      publishedDate: item.snippet?.publishedAt ?? null,
    }));
  } catch {
    return [];
  }
}

/** 5. Firecrawl Deep Search (Deep Web & Competitor Scraping) */
export async function searchFirecrawl(query: string, maxResults = 2): Promise<WebSearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: maxResults }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ title?: string; url?: string; description?: string; markdown?: string }> };
    return (data.data ?? []).slice(0, maxResults).map((item) => ({
      title: item.title ?? "Firecrawl Intelligence",
      url: item.url ?? "",
      snippet: (item.description || item.markdown || "").slice(0, 280),
      source: item.url ? `Firecrawl (${new URL(item.url).hostname.replace(/^www\./, "")})` : "Firecrawl",
      category: "subcultural",
      publishedDate: null,
    }));
  } catch {
    return [];
  }
}

/** 6. Tavily Search API */
async function searchTavily(query: string, apiKey: string, maxResults: number): Promise<WebSearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily error HTTP ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title ?? "Web News",
    url: r.url ?? "",
    snippet: r.content ? r.content.slice(0, 280) : "",
    source: r.url ? new URL(r.url).hostname.replace(/^www\./, "") : "Tavily",
    category: "news",
    publishedDate: null,
  }));
}

/** 7. Brave Search API */
async function searchBrave(query: string, apiKey: string, maxResults: number): Promise<WebSearchResult[]> {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`, {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Brave error HTTP ${res.status}`);
  const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (data.web?.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title ?? "Brave Result",
    url: r.url ?? "",
    snippet: r.description ? r.description.slice(0, 280) : "",
    source: r.url ? new URL(r.url).hostname.replace(/^www\./, "") : "Brave",
    category: "news",
    publishedDate: null,
  }));
}

/** 8. Google News RSS Feed (Zero-config live news fallback) */
async function searchGoogleNews(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`News feed error HTTP ${res.status}`);
  const xml = await res.text();
  const items: WebSearchResult[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null && items.length < maxResults) {
    const block = match[1];
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const rawLink = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
    const rawPubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? null;
    const rawSource = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "";
    const rawDesc = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";

    const title = unescapeHtml(rawTitle);
    const snippet = stripTags(rawDesc) || title;
    const source = rawSource ? unescapeHtml(rawSource) : "Web News";

    if (title && rawLink) {
      items.push({
        title,
        url: rawLink.trim(),
        snippet: snippet.slice(0, 280),
        source,
        category: "news",
        publishedDate: rawPubDate,
      });
    }
  }
  return items;
}

/**
 * Multi-Source Cultural Intelligence Orchestrator:
 * Executes parallel searches across News, Reddit Community Sentiment, Wikipedia Provenance,
 * Wikidata Structured Knowledge Graph, Exa.ai Neural Search, YouTube Video Essays, and Firecrawl.
 */
export async function searchMultiCulturalIntelligence(query: string): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];

  // Run in parallel for ultra-fast response
  const [news, reddit, wiki, wikidata, exa, youtube, firecrawl] = await Promise.allSettled([
    // News query
    (async () => {
      if (process.env.TAVILY_API_KEY) return searchTavily(query, process.env.TAVILY_API_KEY, 3);
      if (process.env.BRAVE_API_KEY) return searchBrave(query, process.env.BRAVE_API_KEY, 3);
      return searchGoogleNews(query, 3);
    })(),
    // Reddit community query
    searchReddit(query, 3),
    // Wikipedia encyclopedic query
    searchWikipedia(query, 2),
    // Wikidata structured knowledge graph
    searchWikidata(query, 2),
    // Exa neural vibe search
    searchExa(query, 2),
    // YouTube video essays
    searchYouTube(query, 2),
    // Firecrawl deep search
    searchFirecrawl(query, 2),
  ]);

  if (news.status === "fulfilled") results.push(...news.value);
  if (reddit.status === "fulfilled") results.push(...reddit.value);
  if (wiki.status === "fulfilled") results.push(...wiki.value);
  if (wikidata.status === "fulfilled") results.push(...wikidata.value);
  if (exa.status === "fulfilled") results.push(...exa.value);
  if (youtube.status === "fulfilled") results.push(...youtube.value);
  if (firecrawl.status === "fulfilled") results.push(...firecrawl.value);

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped: WebSearchResult[] = [];
  for (const item of results) {
    if (item.url && !seen.has(item.url)) {
      seen.add(item.url);
      deduped.push(item);
    }
  }

  return deduped;
}

export async function searchLiveWeb(query: string, maxResults = 4): Promise<WebSearchResult[]> {
  const all = await searchMultiCulturalIntelligence(query);
  return all.slice(0, maxResults);
}
