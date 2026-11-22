(() => {
  const htmlEl = document.documentElement;
  const themeToggleBtn = document.getElementById("themeToggle");
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");
  const statusBar = document.getElementById("statusBar");
  const resultsContainer = document.getElementById("resultsContainer");
  const paginationEl = document.getElementById("pagination");
  const brandHome = document.getElementById("brandHome");
  const spellcheckBar = document.getElementById("spellcheckBar");

  // 1. Kelola Tema (Dark / Light)
  const savedTheme = localStorage.getItem("vz-search-theme") || "dark";
  htmlEl.setAttribute("data-theme", savedTheme);

  themeToggleBtn.addEventListener("click", () => {
    const next = htmlEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
    htmlEl.setAttribute("data-theme", next);
    localStorage.setItem("vz-search-theme", next);
  });

  // 2. Sanitasi aman untuk snippet Brave (mempertahankan tag <strong> hasil highlight)
  function sanitizeSnippet(rawHtml) {
    const div = document.createElement("div");
    div.textContent = rawHtml
      .replace(/<strong>/gi, "[[B_OPEN]]")
      .replace(/<\/strong>/gi, "[[B_CLOSE]]")
      .replace(/<[^>]+>/g, "");
    return div.innerHTML
      .replace(/\[\[B_OPEN\]\]/g, "<strong>")
      .replace(/\[\[B_CLOSE\]\]/g, "</strong>");
  }

  // 3. Fungsi Utama Pencarian
  async function runSearch(query, page = 1) {
    const cleanQuery = (query || "").trim();

    if (!cleanQuery) {
      document.body.classList.remove("has-results");
      document.title = "Search — vz.gay";
      searchInput.value = "";
      statusBar.hidden = true;
      spellcheckBar.hidden = true;
      spellcheckBar.innerHTML = "";
      resultsContainer.innerHTML = "";
      paginationEl.hidden = true;
      searchInput.focus();
      return;
    }

    document.body.classList.add("has-results");
    document.title = `${cleanQuery} — search.vz.gay`;
    searchInput.value = cleanQuery;

    statusBar.hidden = false;
    statusBar.textContent = `Mencari "${cleanQuery}"...`;
    spellcheckBar.hidden = true;
    spellcheckBar.innerHTML = "";
    resultsContainer.innerHTML = "";
    paginationEl.hidden = true;

    const startTime = performance.now();

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(cleanQuery)}&page=${page}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Terjadi kesalahan saat mengambil hasil.");
      }

      if (data.spellcheckSuggestion) {
        spellcheckBar.hidden = false;
        spellcheckBar.innerHTML = `Did you mean: <button type="button" class="spellcheck-link" id="spellcheckBtn"></button>`;
        const btn = document.getElementById("spellcheckBtn");
        btn.textContent = data.spellcheckSuggestion;
        btn.addEventListener("click", () => {
          navigateToSearch(data.spellcheckSuggestion, 1);
        });
      }

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      const items = data.results || [];

      if (items.length === 0) {
        statusBar.textContent = `Tidak ditemukan hasil untuk "${cleanQuery}" (${elapsed} detik).`;
        return;
      }

      statusBar.textContent = `Menampilkan ${items.length} hasil teratas (Halaman ${page}) dalam ${elapsed} detik`;

      resultsContainer.innerHTML = items
        .map((item) => {
          const faviconHtml = item.favicon
            ? `<img src="${item.favicon}" alt="" class="result-favicon" loading="lazy" onerror="this.style.display='none'">`
            : "";
          const ageHtml = item.age ? `<span>&bull; ${item.age}</span>` : "";

          return `
            <article class="result-card">
              <div class="result-meta">
                ${faviconHtml}
                <span class="result-url">${item.siteName} — ${item.url}</span>
                ${ageHtml}
              </div>
              <a href="${item.url}" class="result-title" target="_blank" rel="noopener noreferrer">
                ${item.title}
              </a>
              <p class="result-snippet">${sanitizeSnippet(item.description)}</p>
            </article>
          `;
        })
        .join("");

      renderPagination(cleanQuery, page, data.hasMore);
    } catch (err) {
      statusBar.hidden = true;
      spellcheckBar.hidden = true;
      spellcheckBar.innerHTML = "";
      resultsContainer.innerHTML = `<div class="error-box">${err.message}</div>`;
    }
  }

  // 4. Navigasi Halaman (Pagination)
  function renderPagination(query, currentPage, hasMore) {
    paginationEl.hidden = false;
    paginationEl.innerHTML = `
      <button class="page-btn" id="prevPageBtn" ${currentPage <= 1 ? "disabled" : ""}>
        &larr; Sebelumnya
      </button>
      <span class="page-info">Halaman ${currentPage}</span>
      <button class="page-btn" id="nextPageBtn" ${!hasMore ? "disabled" : ""}>
        Berikutnya &rarr;
      </button>
    `;

    document.getElementById("prevPageBtn")?.addEventListener("click", () => {
      if (currentPage > 1) navigateToSearch(query, currentPage - 1);
    });

    document.getElementById("nextPageBtn")?.addEventListener("click", () => {
      if (hasMore) navigateToSearch(query, currentPage + 1);
    });
  }

  function navigateToSearch(query, page = 1) {
    const nextUrl = new URL(window.location.href);
    if (query) {
      nextUrl.searchParams.set("q", query);
      nextUrl.searchParams.set("page", String(page));
    } else {
      nextUrl.searchParams.delete("q");
      nextUrl.searchParams.delete("page");
    }
    history.pushState({}, "", nextUrl);
    window.scrollTo({ top: 0, behavior: "smooth" });
    runSearch(query, page);
  }

  // 5. Event Listeners
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    navigateToSearch(searchInput.value, 1);
  });

  brandHome.addEventListener("click", (e) => {
    e.preventDefault();
    navigateToSearch("", 1);
  });

  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(window.location.search);
    runSearch(params.get("q") || "", parseInt(params.get("page") || "1", 10));
  });

  // Jalankan saat pertama kali halaman dibuka (jika langsung membuka URL ?q=...)
  const initialParams = new URLSearchParams(window.location.search);
  runSearch(
    initialParams.get("q") || "",
    parseInt(initialParams.get("page") || "1", 10)
  );
})();
