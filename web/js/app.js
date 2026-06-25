// web/js/app.js
let graphData = null;
let statsData = null;

async function loadData() {
  [graphData, statsData] = await Promise.all([
    fetch('data/graph.json').then(r => r.json()),
    fetch('data/stats.json').then(r => r.json()),
  ]);
}

function populateStats() {
  document.getElementById('stat-nodes').textContent = statsData.node_count.toLocaleString('de-DE');
  document.getElementById('stat-edges').textContent = statsData.edge_count.toLocaleString('de-DE');

  document.getElementById('stat-connectivity').innerHTML = `
    <p>${statsData.wcc_count} weakly connected component${statsData.wcc_count !== 1 ? 's' : ''}</p>
    <p>Largest: <strong>${statsData.largest_wcc_size}</strong> cities</p>
    <p>${statsData.scc_count} strongly connected components</p>
    <p>Largest SCC: <strong>${statsData.largest_scc_size}</strong> cities</p>
  `;

  const byId = Object.fromEntries(graphData.nodes.map(n => [n.id, n.name]));
  const pathNames = statsData.diameter_path.map(id => byId[id] ?? id).join(' → ');
  const diameterEl = document.getElementById('stat-diameter');
  diameterEl.replaceChildren();
  const hopsP = document.createElement('p');
  hopsP.textContent = `${statsData.diameter_length} hops`;
  const namesP = document.createElement('p');
  namesP.className = 'muted';
  namesP.textContent = pathNames;
  diameterEl.append(hopsP, namesP);
  renderDiameterMap(graphData, statsData.diameter_path);

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
  renderDisconnectedMap(graphData, [disc[0].id, disc[1].id]);

  renderBarChart('#chart-betweenness', statsData.top_betweenness.slice(0, 10),
    d => d.name, d => d.score);
  renderBarChart('#chart-indegree',    statsData.top_in_degree.slice(0, 10),
    d => d.name, d => d.count);
  renderBarChart('#chart-outdegree',   statsData.top_out_degree.slice(0, 10),
    d => d.name, d => d.count);
}

function renderBarChart(selector, data, labelFn, valueFn) {
  if (!data || data.length === 0) return;
  const el = document.querySelector(selector);
  if (!el) return;
  const W = el.clientWidth || 800, H = 320;

  // Measure labels and values to set margins dynamically
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '11px sans-serif';
  const maxLabelW = Math.ceil(Math.max(...data.map(d => ctx.measureText(labelFn(d)).width))) + 12;

  const maxVal = d3.max(data, valueFn);
  const isFloat = maxVal < 1;
  const fmtVal = isFloat ? d3.format('.4f') : d => d3.format(',')(Math.round(d));
  const maxValW = Math.ceil(Math.max(...data.map(d => ctx.measureText(fmtVal(valueFn(d))).width))) + 10;

  const m = { top: 8, right: Math.max(50, maxValW), bottom: 30, left: Math.max(140, maxLabelW) };

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

  // Value labels at end of each bar
  svg.selectAll('.bar-val').data(data).join('text')
    .attr('class', 'bar-val')
    .attr('x', d => x(valueFn(d)) + 5)
    .attr('y', d => y(labelFn(d)) + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .text(d => fmtVal(valueFn(d)));

  // X-axis with tick labels
  const xAxis = d3.axisBottom(x)
    .ticks(5)
    .tickFormat(isFloat ? d3.format('.3f') : d => d3.format(',')(Math.round(d)));
  svg.append('g').attr('class', 'x-axis')
    .attr('transform', `translate(0,${H - m.bottom})`)
    .call(xAxis);
}

const isMobile = window.innerWidth <= 768;

if (isMobile) {
  // Scrollable single-page layout — Reveal.js is NOT initialized.
  // CSS overrides in style.css convert the slide sections into stacked cards.
  const sections = Array.from(document.querySelectorAll('.reveal .slides > section'));

  function getActiveIndex() {
    const mid = window.innerHeight * 0.4;
    let best = 0;
    sections.forEach((s, i) => {
      if (s.getBoundingClientRect().top <= mid) best = i;
    });
    return best;
  }

  document.getElementById('nav-prev').addEventListener('click', () => {
    const i = getActiveIndex();
    if (i > 0) sections[i - 1].scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('nav-next').addEventListener('click', () => {
    const i = getActiveIndex();
    if (i < sections.length - 1) sections[i + 1].scrollIntoView({ behavior: 'smooth' });
  });
} else {
  Reveal.initialize({
    hash: true,
    transition: 'fade',
    backgroundTransition: 'fade',
    controls: false,
  });
  document.getElementById('nav-prev').addEventListener('click', () => Reveal.prev());
  document.getElementById('nav-next').addEventListener('click', () => Reveal.next());
}

loadData().then(() => {
  initMap(graphData);
  populateStats();
  initPathfinder(graphData);
  initExplorer(graphData);
}).catch(err => console.error('Data load failed:', err));
