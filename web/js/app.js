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
  const W = el.clientWidth || 720, H = 280;
  const m = { top: 8, right: 16, bottom: 24, left: 130 };
  const svg = d3.select(selector).append('svg').attr('width', W).attr('height', H);
  const x = d3.scaleLinear().domain([0, d3.max(data, valueFn)]).range([m.left, W - m.right]);
  const y = d3.scaleBand().domain(data.map(labelFn)).range([m.top, H - m.bottom]).padding(0.22);
  svg.selectAll('rect').data(data).join('rect')
    .attr('class', 'bar-rect')
    .attr('x', m.left).attr('y', d => y(labelFn(d)))
    .attr('width', d => x(valueFn(d)) - m.left)
    .attr('height', y.bandwidth());
  svg.selectAll('.lbl').data(data).join('text')
    .attr('class', 'bar-label')
    .attr('x', m.left - 6).attr('y', d => y(labelFn(d)) + y.bandwidth() / 2)
    .attr('dy', '0.35em').attr('text-anchor', 'end').text(labelFn);
}

Reveal.initialize({ hash: true, transition: 'fade', backgroundTransition: 'fade' });

loadData().then(() => {
  initMap(graphData);
  populateStats();
  initPathfinder(graphData);
  initExplorer(graphData);
}).catch(err => console.error('Data load failed:', err));
