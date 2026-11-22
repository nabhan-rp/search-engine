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

  // Brave Search menggunakan 0-based offset (0 = halaman 1, maksimal 9)
  const offset = page - 1;
  const braveUrl = new URL("https://api.search.brave.com/res/v1/web/search");
  braveUrl.searchParams.set("q", query);
  braveUrl.searchParams.set("count", "10");
  braveUrl.searchParams.set("offset", String(offset));

  try {
    const braveRes = await fetch(braveUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": env.BRAVE_API_KEY
      },
      // Cache di edge Cloudflare selama 600 detik (10 menit) untuk menghemat kuota API
      cf: {
        cacheEverything: true,
        cacheTtl: 600
      }
    });

    if (!braveRes.ok) {
      const errText = await braveRes.text();
      return jsonResponse(
        { error: `Brave API Error (${braveRes.status})`, detail: errText },
        braveRes.status
      );
    }

    const data = await braveRes.json();
    const rawResults = data.web?.results || [];

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
