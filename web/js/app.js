// web/js/app.js
let graphData = null;
let statsData = null;

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadData() {
  // Load stats first (tiny file) so text content appears immediately.
  statsData = await fetch('data/stats.json').then(r => r.json());
  populateTextStats();

  // Load graph data (5+ MB) for maps and interactive features.
  graphData = await fetch('data/graph.json').then(r => r.json());
  initPathfinder(graphData);
  initExplorer(graphData);

  // Flush any slides that became visible before graphData was ready
  const pending = [..._pending];
  _pending.clear();
  pending.forEach(renderSlide);

  document.getElementById('loading-overlay').hidden = true;
}

// ── Text statistics (no graphData needed) ───────────────────────────────────

function populateTextStats() {
  document.getElementById('stat-nodes').textContent =
    statsData.node_count.toLocaleString('de-DE');
  document.getElementById('stat-edges').textContent =
    statsData.edge_count.toLocaleString('de-DE');

  document.getElementById('stat-connectivity').innerHTML = `
    <p>${statsData.wcc_count} weakly connected component${statsData.wcc_count !== 1 ? 's' : ''}</p>
    <p>Largest: <strong>${statsData.largest_wcc_size.toLocaleString('de-DE')}</strong> cities</p>
    <p>${statsData.scc_count} strongly connected components</p>
    <p>Largest SCC: <strong>${statsData.largest_scc_size.toLocaleString('de-DE')}</strong> cities</p>
  `;

  const diameterEl = document.getElementById('stat-diameter');
  diameterEl.replaceChildren();
  const hopsP = document.createElement('p');
  hopsP.textContent = `${statsData.diameter_length} hops`;
  diameterEl.appendChild(hopsP);
  // City names for the path are rendered lazily (needs graphData)

  const disc = statsData.largest_disconnected;
  document.getElementById('stat-disconnected').innerHTML = `
    <p>
      <span style="color:var(--accent);font-weight:600">${disc[0].name}</span>
      <span class="muted"> (${disc[0].population.toLocaleString('de-DE')} Einw.)</span>
      &nbsp;↔&nbsp;
      <span style="color:var(--gold);font-weight:600">${disc[1].name}</span>
      <span class="muted"> (${disc[1].population.toLocaleString('de-DE')} Einw.)</span>
    </p>
    <p class="muted">No street-name path exists between these two cities in either direction.</p>
  `;
}

// ── Lazy rendering ───────────────────────────────────────────────────────────
// Maps and charts render only when their slide/section becomes visible.

const _rendered = new Set();
const _pending  = new Set(); // slides that need rendering but graphData isn't ready yet

function renderSlide(slideId) {
  if (_rendered.has(slideId)) return;
  if (!graphData) { _pending.add(slideId); return; }
  _rendered.add(slideId);

  switch (slideId) {
    case 'slide-overview':
      initMap(graphData);
      break;

    case 'slide-diameter': {
      const byId = Object.fromEntries(graphData.nodes.map(n => [n.id, n]));
      const pathNames = statsData.diameter_path.map(id => byId[id]?.name ?? id).join(' → ');
      const p = document.createElement('p');
      p.className = 'muted'; p.textContent = pathNames;
      document.getElementById('stat-diameter').appendChild(p);
      renderDiameterMap(graphData, statsData.diameter_path);
      break;
    }

    case 'slide-disconnected': {
      const disc = statsData.largest_disconnected;
      renderDisconnectedMap(graphData, [disc[0].id, disc[1].id]);
      break;
    }

    case 'slide-betweenness':
      renderBarChart('#chart-betweenness', statsData.top_betweenness.slice(0, 10),
        d => d.name, d => d.score);
      break;

    case 'slide-indegree':
      renderBarChart('#chart-indegree', statsData.top_in_degree.slice(0, 10),
        d => d.name, d => d.count);
      break;

    case 'slide-outdegree':
      renderBarChart('#chart-outdegree', statsData.top_out_degree.slice(0, 10),
        d => d.name, d => d.count);
      break;
  }
}

// ── Bar charts ───────────────────────────────────────────────────────────────

function renderBarChart(selector, data, labelFn, valueFn) {
  if (!data || data.length === 0) return;
  const el = document.querySelector(selector);
  if (!el) return;
  const W = el.clientWidth || 800, H = 320;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '11px sans-serif';
  const maxLabelW = Math.ceil(Math.max(...data.map(d => ctx.measureText(labelFn(d)).width))) + 12;

  const maxVal = d3.max(data, valueFn);
  const isFloat = maxVal < 1;
  const fmtVal = isFloat ? d3.format('.4f') : d => d3.format(',')(Math.round(d));
  const maxValW = Math.ceil(Math.max(...data.map(d => ctx.measureText(fmtVal(valueFn(d))).width))) + 10;

  const m = { top: 8, right: Math.max(50, maxValW), bottom: 30, left: Math.max(isMobile ? 90 : 140, maxLabelW) };

  const svg = d3.select(selector).append('svg').attr('width', W).attr('height', H);
  const x = d3.scaleLinear().domain([0, maxVal]).range([m.left, W - m.right]);
  const y = d3.scaleBand().domain(data.map(labelFn)).range([m.top, H - m.bottom]).padding(0.22);

  svg.selectAll('rect').data(data).join('rect')
    .attr('class', 'bar-rect')
    .attr('x', m.left).attr('y', d => y(labelFn(d)))
    .attr('width', d => Math.max(0, x(valueFn(d)) - m.left))
    .attr('height', y.bandwidth());

  svg.selectAll('.lbl').data(data).join('text')
    .attr('class', 'bar-label')
    .attr('x', m.left - 6).attr('y', d => y(labelFn(d)) + y.bandwidth() / 2)
    .attr('dy', '0.35em').attr('text-anchor', 'end').text(labelFn);

  svg.selectAll('.bar-val').data(data).join('text')
    .attr('class', 'bar-val')
    .attr('x', d => x(valueFn(d)) + 5)
    .attr('y', d => y(labelFn(d)) + y.bandwidth() / 2)
    .attr('dy', '0.35em').text(d => fmtVal(valueFn(d)));

  const xAxis = d3.axisBottom(x)
    .ticks(5)
    .tickFormat(isFloat ? d3.format('.3f') : d => d3.format(',')(Math.round(d)));
  svg.append('g').attr('class', 'x-axis')
    .attr('transform', `translate(0,${H - m.bottom})`)
    .call(xAxis);
}

// ── Navigation ───────────────────────────────────────────────────────────────

const isMobile = window.innerWidth <= 768;
const btnPrev  = document.getElementById('nav-prev');
const btnNext  = document.getElementById('nav-next');

if (isMobile) {
  const sections = Array.from(document.querySelectorAll('.reveal .slides > section'));

  function getActiveIndex() {
    const mid = window.innerHeight * 0.4;
    let best = 0;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= mid) best = i; });
    return best;
  }

  function updateMobileNav() {
    const i = getActiveIndex();
    btnPrev.disabled = (i === 0);
    btnNext.disabled = (i === sections.length - 1);
  }

  btnPrev.addEventListener('click', () => {
    const i = getActiveIndex();
    if (i > 0) sections[i - 1].scrollIntoView({ behavior: 'smooth' });
  });
  btnNext.addEventListener('click', () => {
    const i = getActiveIndex();
    if (i < sections.length - 1) sections[i + 1].scrollIntoView({ behavior: 'smooth' });
  });

  // Lazy rendering via IntersectionObserver
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) renderSlide(e.target.id); });
  }, { threshold: 0.15 });
  sections.forEach(s => observer.observe(s));

  window.addEventListener('scroll', updateMobileNav, { passive: true });
  updateMobileNav();

} else {
  const sections = document.querySelectorAll('.reveal .slides > section');
  const lastIdx  = sections.length - 1;

  function updateDesktopNav() {
    const idx = Reveal.getIndices().h;
    btnPrev.disabled = (idx === 0);
    btnNext.disabled = (idx === lastIdx);
  }

  Reveal.initialize({
    hash: true,
    transition: 'fade',
    backgroundTransition: 'fade',
    controls: false,
  });

  Reveal.on('ready',        e => { updateDesktopNav(); renderSlide(e.currentSlide.id); });
  Reveal.on('slidechanged', e => { updateDesktopNav(); renderSlide(e.currentSlide.id); });

  btnPrev.addEventListener('click', () => Reveal.prev());
  btnNext.addEventListener('click', () => Reveal.next());
}

// ── Boot ─────────────────────────────────────────────────────────────────────

loadData().catch(err => {
  console.error('Data load failed:', err);
  document.getElementById('loading-overlay').textContent = 'Failed to load data.';
});
