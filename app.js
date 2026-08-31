const LABELS = {
  ai: 'AI', software: 'Software', hardware: 'Hardware', 'data-centers': 'Data centers',
  networking: 'Networking', 'energy-economy': 'Energy + economy', 'security-policy': 'Security + policy',
  social: 'Social radar', other: 'Other'
};

const state = { data: null, category: '', query: '' };
const $ = (selector) => document.querySelector(selector);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch (_) {
    return '';
  }
}

function dateLabel(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 16) : date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function shortDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 16) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function itemText(item) {
  return [item.title, item.publisher, item.category, item.description, item.evidence_excerpt, item.learning_text].filter(Boolean).join(' ').toLowerCase();
}

function matching(item) {
  return (!state.category || item.category === state.category) && (!state.query || itemText(item).includes(state.query));
}

function filteredItems() {
  return (state.data.items || []).filter(matching);
}

function renderStats() {
  const data = state.data;
  const categoryCount = Object.keys(data.categories || {}).length;
  $('#stats').innerHTML = [
    ['editions', data.editions_count ?? (data.editions || []).length, 'daily editions'],
    ['items', data.items_count ?? (data.items || []).length, 'saved research notes'],
    ['social', data.social_checks_count ?? (data.social_checks || []).length, 'social checks'],
    ['categories', categoryCount, 'research categories']
  ].map(([_, value, label]) => `<div class="stat"><span class="stat-value">${esc(value)}</span><span class="stat-label">${esc(label)}</span></div>`).join('');
}

function renderFilters() {
  const counts = state.data.categories || {};
  const categories = ['', ...Object.keys(counts).sort()];
  $('#filters').innerHTML = categories.map((category) => {
    const text = category ? `${LABELS[category] || category} (${counts[category] || 0})` : 'All research';
    return `<button class="filter ${state.category === category ? 'active' : ''}" type="button" data-category="${esc(category)}">${esc(text)}</button>`;
  }).join('');
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => {
    state.category = button.dataset.category || '';
    renderFilters();
    renderLibrary();
  }));
}

function media(item) {
  const image = safeUrl(item.image_url);
  if (!image) return '<div class="card-media"><div class="card-fallback">No publisher preview image was provided</div></div>';
  return `<div class="card-media"><img src="${esc(image)}" alt="Publisher image for ${esc(item.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;card-fallback&quot;>Publisher image unavailable</div>'"></div>`;
}

function learningText(item) {
  const text = String(item.learning_text || '').trim();
  if (!text) return '';
  const lines = text.split(/\n+/).filter(Boolean).slice(0, 12);
  return `<details class="card-details"><summary>Open the learning notes</summary><div class="learning-notes">${lines.map((line) => `<p>${esc(line)}</p>`).join('')}</div></details>`;
}

function card(item) {
  const source = safeUrl(item.source_url);
  const video = safeUrl(item.video_url) || safeUrl(item.video_search_url);
  const evidence = item.evidence_excerpt || item.description || 'No evidence excerpt was captured.';
  const category = LABELS[item.category] || item.category || 'Research';
  return `<article class="card">${media(item)}<div class="card-body"><div class="card-meta"><span class="badge">${esc(category)}</span><span>${esc(shortDate(item.published || item.edition_captured))}</span></div><h3>${esc(item.title)}</h3><div class="evidence"><span class="evidence-label">Evidence anchor</span>${esc(evidence.slice(0, 650))}</div>${learningText(item)}<div class="actions">${source ? `<a class="source" href="${esc(source)}" target="_blank" rel="noopener">Read original source</a>` : ''}${video ? `<a class="video" href="${esc(video)}" target="_blank" rel="noopener">Watch / explore video</a>` : ''}</div></div></article>`;
}

function renderLibrary() {
  const all = filteredItems();
  const byEdition = new Map();
  (state.data.editions || []).forEach((edition) => byEdition.set(edition.edition_id, { ...edition, items: [] }));
  all.forEach((item) => {
    if (!byEdition.has(item.edition_id)) byEdition.set(item.edition_id, { edition_id: item.edition_id, captured_at: item.edition_captured, items: [] });
    byEdition.get(item.edition_id).items.push(item);
  });
  const sections = [...byEdition.values()].filter((edition) => edition.items.length).sort((a, b) => String(b.captured_at || '').localeCompare(String(a.captured_at || '')));
  $('#library').innerHTML = sections.length ? sections.map((edition) => `<section class="day-section"><div class="day-heading"><div><div class="section-label">Daily edition</div><h2>${esc(dateLabel(edition.captured_at))}</h2></div><a href="${esc('/edition/' + encodeURIComponent(edition.edition_id))}" target="_blank" rel="noopener">Open full edition →</a></div><div class="cards">${edition.items.map(card).join('')}</div></section>`).join('') : '<div class="empty">No research matches this filter yet.</div>';
  $('#resultCount').textContent = `${all.length} saved notes`;
}

function renderSocial() {
  const social = state.data.social || {};
  const checks = social.checks || [];
  const leads = social.leads || [];
  const byPlatform = checks.reduce((result, item) => { result[item.platform] = (result[item.platform] || 0) + 1; return result; }, {});
  const chips = Object.entries(byPlatform).sort().map(([platform, count]) => `<span class="radar-chip">${esc(platform)} · ${esc(count)} checked</span>`).join('');
  const rows = checks.slice().sort((a, b) => `${a.platform}${a.target}`.localeCompare(`${b.platform}${b.target}`)).map((item) => `<div class="radar-row"><span>${esc(item.platform)} · ${esc(item.target)}</span><span>${esc(item.status)}</span></div>`).join('');
  const leadRows = leads.slice(0, 5).map((lead) => { const url = safeUrl(lead.source_url || lead.url); return `<div class="social-lead"><strong>${esc(String(lead.platform || 'social').toUpperCase())} · ${esc(lead.account_query || 'target')}</strong><span>${esc(lead.title || 'Discovery lead')}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Open lead</a>` : ''}<small>Discovery only. Verify the original post before using it as evidence.</small></div>`; }).join('');
  $('#socialMeta').textContent = `${checks.length} checks · ${leads.length} leads`;
  $('#socialRadar').innerHTML = `<div class="radar-summary">${chips || '<span class="radar-chip">No checks stored yet</span>'}</div>${leadRows || '<p class="muted">No public discovery leads were found. That is not proof that no posts exist.</p>'}<div class="radar-grid">${rows || '<div class="radar-row"><span>No social checks stored yet</span></div>'}</div>`;
}

async function boot() {
  try {
    const response = await fetch('/data/research.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Data request returned ${response.status}`);
    state.data = await response.json();
    renderStats(); renderFilters(); renderLibrary(); renderSocial();
  } catch (error) {
    $('#error').hidden = false;
    $('#error').textContent = `The research snapshot could not be loaded: ${error.message}`;
  }
}

$('#search').addEventListener('input', (event) => { state.query = event.target.value.trim().toLowerCase(); renderLibrary(); });
$('#clearSearch').addEventListener('click', () => { $('#search').value = ''; state.query = ''; renderLibrary(); $('#search').focus(); });
boot();
