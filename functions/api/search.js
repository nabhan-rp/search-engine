export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, Math.min(10, parseInt(url.searchParams.get("page") || "1", 10)));

  if (!query) {
    return jsonResponse({ error: "Parameter pencarian 'q' kosong." }, 400);
  }

  if (!env.BRAVE_API_KEY) {
    return jsonResponse({ error: "BRAVE_API_KEY belum diatur di Environment Variables Cloudflare." }, 500);
  }

  const offset = page - 1;
  const braveUrl = new URL("https://api.search.brave.com/res/v1/web/search");
  braveUrl.searchParams.set("q", query);
  braveUrl.searchParams.set("count", "10");
  braveUrl.searchParams.set("offset", String(offset));

  try {
    const webPromise = fetch(braveUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": env.BRAVE_API_KEY
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 600
      }
    });

    const spellcheckPromise = env.BRAVE_SPELLCHECK_API_KEY
      ? fetchSpellcheck(query, env.BRAVE_SPELLCHECK_API_KEY)
      : Promise.resolve(null);

    const [braveRes, spellcheckFromApi] = await Promise.all([webPromise, spellcheckPromise]);

    if (!braveRes.ok) {
      const errText = await braveRes.text();
      return jsonResponse(
        { error: `Brave API Error (${braveRes.status})`, detail: errText },
        braveRes.status
      );
    }

    const data = await braveRes.json();
    const rawResults = data.web?.results || [];

    // Ambil koreksi dari Spellcheck API, atau fallback ke auto-correction bawaan Web Search (data.query.altered)
    const webAltered = typeof data.query?.altered === "string" ? data.query.altered.trim() : "";
    const spellcheckSuggestion =
      spellcheckFromApi ||
      (webAltered && webAltered.toLowerCase() !== query.toLowerCase() ? webAltered : null);

    const results = rawResults.map((item) => ({
      title: item.title || "",
      url: item.url || "",
      description: item.description || "",
      age: item.age || "",
      siteName: item.profile?.name || extractDomain(item.url),
      favicon: item.profile?.img || ""
    }));

    return jsonResponse(
      {
        query,
        page,
        spellcheckSuggestion,
        hasMore: Boolean(data.query?.more_results_available),
        results
      },
      200,
      { "Cache-Control": "public, max-age=300" }
    );
  } catch (err) {
    return jsonResponse({ error: "Gagal menghubungi server Brave Search.", detail: err.message }, 502);
  }
}

async function fetchSpellcheck(query, apiKey) {
  try {
    const spellUrl = new URL("https://api.search.brave.com/res/v1/spellcheck/search");
    spellUrl.searchParams.set("q", query);

    const res = await fetch(spellUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 3600
      }
    });

    if (!res.ok) return null;

    const data = await res.json();
    const candidate =
      data.results?.[0]?.query ||
      data.query?.altered ||
      data.altered ||
      null;

    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed && trimmed.toLowerCase() !== query.toLowerCase()) {
        return trimmed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function extractDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}
