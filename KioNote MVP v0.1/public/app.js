const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]);

async function loadDashboard() {
  const data = await fetch("/api/dashboard").then((response) => response.json());
  $("#stats").innerHTML = Object.entries(data.stats)
    .map(([label, value]) => `<div class="stat"><b>${value}</b><span>${escapeHtml(label)}</span></div>`).join("");
  $("#summary").textContent = data.summary;
  $("#topics").innerHTML = data.topics.map((topic) => `<span class="topic">${escapeHtml(topic.name)} · ${topic.count}</span>`).join("");
  $("#experts").className = "list";
  $("#experts").innerHTML = data.experts.length ? data.experts.map((expert) => `
    <div class="list-item"><span><span class="avatar">${escapeHtml(expert.name[0])}</span>${escapeHtml(expert.name)}</span><span class="score">${expert.score} signal</span></div>
  `).join("") : "No contributors yet.";
  $("#faqs").className = "faq-grid";
  $("#faqs").innerHTML = data.faqs.length ? data.faqs.map((faq) => `
    <section class="faq"><h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></section>
  `).join("") : "No FAQs generated yet.";
  $("#articles").className = "article-grid";
  $("#articles").innerHTML = data.articles.length ? data.articles.map((article) => `
    <section class="article"><h3>${escapeHtml(article.topic)}</h3><p>${escapeHtml(article.overview)}</p><p><b>Contributors:</b> ${escapeHtml(article.contributors.join(", "))}</p></section>
  `).join("") : "No articles generated yet.";
}

$("#import-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = $("#file").files[0];
  const status = $("#import-status");
  status.textContent = "Reading and indexing messages…";
  try {
    const exportData = JSON.parse(await file.text());
    const response = await fetch("/api/import/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: exportData.name, export: exportData })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    status.textContent = `Imported ${result.imported} messages from ${result.community.name}.`;
    await loadDashboard();
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("#query").value.trim();
  if (!query) return;
  const data = await fetch(`/api/search?q=${encodeURIComponent(query)}`).then((response) => response.json());
  const target = $("#search-results");
  target.classList.remove("hidden");
  target.innerHTML = `<p><b>${escapeHtml(data.answer)}</b></p>` + data.results.map((result) => `
    <div class="result"><strong>${escapeHtml(result.author)}</strong> · ${Math.round(result.score * 100)}% match<br>${escapeHtml(result.text)}</div>
  `).join("");
});

loadDashboard();
