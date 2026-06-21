// web/js/map.js

function makeProjection(width, height) {
  return d3.geoMercator()
    .center([10.4, 51.2])
    .scale(width * 1.55)
    .translate([width / 2, height / 2]);
}

function nodeById(graphData) {
  return Object.fromEntries(graphData.nodes.map(n => [n.id, n]));
}

function initMap(graphData) {
  const el = document.getElementById('map-overview');
  if (!el) return;
  const W = el.clientWidth || 800, H = 400;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  const svg = d3.select('#map-overview').append('svg').attr('width', W).attr('height', H);

  svg.append('g').selectAll('line')
    .data(graphData.edges).join('line')
    .attr('x1', d => { const n = byId[d.source]; return n ? proj([n.lon, n.lat])[0] : 0; })
    .attr('y1', d => { const n = byId[d.source]; return n ? proj([n.lon, n.lat])[1] : 0; })
    .attr('x2', d => { const n = byId[d.target]; return n ? proj([n.lon, n.lat])[0] : 0; })
    .attr('y2', d => { const n = byId[d.target]; return n ? proj([n.lon, n.lat])[1] : 0; })
    .attr('stroke', 'rgba(79,142,247,0.12)').attr('stroke-width', 0.5);

  svg.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r',  d => Math.max(1.5, Math.sqrt(d.population / 80000)))
    .attr('fill', '#4f8ef7').attr('opacity', 0.7);
}

function highlightPath(graphData, pathIds) {
  const el = document.getElementById('map-path');
  if (!el) return;
  const W = el.clientWidth || 800, H = 400;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  d3.select('#map-path svg').remove();
  const svg = d3.select('#map-path').append('svg').attr('width', W).attr('height', H);

  svg.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r', 1.5).attr('fill', '#1e2235');

  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = byId[pathIds[i]], b = byId[pathIds[i + 1]];
    if (!a || !b) continue;
    const [x1, y1] = proj([a.lon, a.lat]);
    const [x2, y2] = proj([b.lon, b.lat]);
    svg.append('line').attr('x1', x1).attr('y1', y1)
      .attr('x2', x2).attr('y2', y2)
      .attr('stroke', '#f7c04f').attr('stroke-width', 2);
  }

  pathIds.forEach((id, i) => {
    const n = byId[id]; if (!n) return;
    const [x, y] = proj([n.lon, n.lat]);
    const isEnd = i === 0 || i === pathIds.length - 1;
    svg.append('circle').attr('cx', x).attr('cy', y)
      .attr('r', isEnd ? 6 : 4)
      .attr('fill', isEnd ? '#f7c04f' : '#4f8ef7');
    svg.append('text').attr('x', x + 8).attr('y', y + 4)
      .attr('fill', '#e8eaf0').attr('font-size', '11px').text(n.name);
  });
}

function renderDiameterMap(graphData, pathIds) {
  const el = document.getElementById('map-diameter');
  if (!el) return;
  const W = el.clientWidth || 800, H = 400;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  d3.select('#map-diameter svg').remove();
  const svg = d3.select('#map-diameter').append('svg').attr('width', W).attr('height', H);

  svg.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r', 1.5).attr('fill', '#1e2235');

  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = byId[pathIds[i]], b = byId[pathIds[i + 1]];
    if (!a || !b) continue;
    const [x1, y1] = proj([a.lon, a.lat]);
    const [x2, y2] = proj([b.lon, b.lat]);
    svg.append('line').attr('x1', x1).attr('y1', y1)
      .attr('x2', x2).attr('y2', y2)
      .attr('stroke', '#f7c04f').attr('stroke-width', 2.5);
  }

  pathIds.forEach((id, i) => {
    const n = byId[id]; if (!n) return;
    const [x, y] = proj([n.lon, n.lat]);
    svg.append('circle').attr('cx', x).attr('cy', y).attr('r', 5)
      .attr('fill', '#f7c04f');
    // Alternate label above/below to reduce overlap on clustered stops
    const dy = i % 2 === 0 ? -8 : 14;
    svg.append('text').attr('x', x + 6).attr('y', y + dy)
      .attr('fill', '#e8eaf0').attr('font-size', '10px')
      .text(`${i + 1}. ${n.name}`);
  });
}
