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

function _addZoom(svg, g) {
  svg.call(
    d3.zoom()
      .scaleExtent([0.5, 20])
      .on('zoom', e => g.attr('transform', e.transform))
  );
}

function _addMapHint(parentSelector) {
  d3.select(parentSelector).append('p')
    .attr('class', 'map-hint')
    .text('scroll to zoom · drag to pan');
}

function initMap(graphData) {
  const el = document.getElementById('map-overview');
  if (!el) return;
  const W = el.clientWidth || 800, H = 400;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  const svg = d3.select('#map-overview').append('svg').attr('width', W).attr('height', H);
  svg.append('defs').append('clipPath').attr('id', 'clip-overview')
    .append('rect').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('clip-path', 'url(#clip-overview)');

  g.append('g').selectAll('line')
    .data(graphData.edges).join('line')
    .attr('x1', d => { const n = byId[d.source]; return n ? proj([n.lon, n.lat])[0] : 0; })
    .attr('y1', d => { const n = byId[d.source]; return n ? proj([n.lon, n.lat])[1] : 0; })
    .attr('x2', d => { const n = byId[d.target]; return n ? proj([n.lon, n.lat])[0] : 0; })
    .attr('y2', d => { const n = byId[d.target]; return n ? proj([n.lon, n.lat])[1] : 0; })
    .attr('stroke', 'rgba(79,142,247,0.12)').attr('stroke-width', 0.5);

  g.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r',  d => Math.max(1.5, Math.sqrt(d.population / 80000)))
    .attr('fill', '#4f8ef7').attr('opacity', 0.7);

  _addZoom(svg, g);
  _addMapHint('#map-overview');
}

function highlightPath(graphData, pathIds) {
  const el = document.getElementById('map-path');
  if (!el) return;
  const W = el.clientWidth || 800, H = 400;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  d3.select('#map-path svg').remove();
  d3.select('#map-path p.map-hint').remove();

  const svg = d3.select('#map-path').append('svg').attr('width', W).attr('height', H);
  svg.append('defs').append('clipPath').attr('id', 'clip-path')
    .append('rect').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('clip-path', 'url(#clip-path)');

  g.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r', 1.5).attr('fill', '#1e2235');

  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = byId[pathIds[i]], b = byId[pathIds[i + 1]];
    if (!a || !b) continue;
    const [x1, y1] = proj([a.lon, a.lat]);
    const [x2, y2] = proj([b.lon, b.lat]);
    g.append('line').attr('x1', x1).attr('y1', y1)
      .attr('x2', x2).attr('y2', y2)
      .attr('stroke', '#f7c04f').attr('stroke-width', 2);
  }

  pathIds.forEach((id, i) => {
    const n = byId[id]; if (!n) return;
    const [x, y] = proj([n.lon, n.lat]);
    const isEnd = i === 0 || i === pathIds.length - 1;
    g.append('circle').attr('cx', x).attr('cy', y)
      .attr('r', isEnd ? 6 : 4)
      .attr('fill', isEnd ? '#f7c04f' : '#4f8ef7');
    g.append('text').attr('x', x + 8).attr('y', y + 4)
      .attr('fill', '#e8eaf0').attr('font-size', '11px').text(n.name);
  });

  _addZoom(svg, g);
  _addMapHint('#map-path');
}

function renderDisconnectedMap(graphData, nodeIds) {
  const el = document.getElementById('map-disconnected');
  if (!el) return;
  const W = el.clientWidth || 800, H = 340;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  const svg = d3.select('#map-disconnected').append('svg').attr('width', W).attr('height', H);
  svg.append('defs').append('clipPath').attr('id', 'clip-disconnected')
    .append('rect').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('clip-path', 'url(#clip-disconnected)');

  g.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r', 1.5).attr('fill', '#1e2235');

  const colors = ['#4f8ef7', '#f7c04f'];
  nodeIds.forEach((id, i) => {
    const n = byId[id]; if (!n) return;
    const [x, y] = proj([n.lon, n.lat]);
    g.append('circle').attr('cx', x).attr('cy', y).attr('r', 8).attr('fill', colors[i]);
    const anchor = x > W / 2 ? 'end' : 'start';
    const dx = x > W / 2 ? -12 : 12;
    g.append('text').attr('x', x + dx).attr('y', y + 4)
      .attr('fill', '#e8eaf0').attr('font-size', '12px').attr('font-weight', '600')
      .attr('text-anchor', anchor).text(n.name);
  });

  _addZoom(svg, g);
  _addMapHint('#map-disconnected');
}

// Greedy label placement: tries candidate offsets in order, picks first non-overlapping slot.
function _placeLabels(items, proj, fontSize) {
  const CHAR_W = fontSize * 0.58;
  const BOX_H  = fontSize + 4;
  const PAD    = 3;

  const CANDIDATES = [
    { dx:  8, dy: -6, anchor: 'start' },
    { dx:  8, dy: 13, anchor: 'start' },
    { dx: -8, dy: -6, anchor: 'end'   },
    { dx: -8, dy: 13, anchor: 'end'   },
    { dx:  8, dy:-18, anchor: 'start' },
    { dx:  8, dy: 24, anchor: 'start' },
    { dx:-12, dy:-18, anchor: 'end'   },
    { dx:-12, dy: 24, anchor: 'end'   },
    { dx: 22, dy:  4, anchor: 'start' },
    { dx:-22, dy:  4, anchor: 'end'   },
  ];

  const placed = [];

  return items.map(({ node, label }) => {
    const [cx, cy] = proj([node.lon, node.lat]);
    const tw = label.length * CHAR_W;

    for (const { dx, dy, anchor } of CANDIDATES) {
      const lx = anchor === 'end' ? cx + dx - tw : cx + dx;
      const ly = cy + dy - BOX_H;
      const box = { x: lx - PAD, y: ly - PAD, w: tw + PAD * 2, h: BOX_H + PAD * 2 };

      const hit = placed.some(r =>
        box.x < r.x + r.w && box.x + box.w > r.x &&
        box.y < r.y + r.h && box.y + box.h > r.y
      );

      if (!hit) {
        placed.push(box);
        return { cx, cy, label, dx, dy, anchor };
      }
    }

    // All candidates overlap — fall back to first
    const { dx, dy, anchor } = CANDIDATES[0];
    return { cx, cy, label, dx, dy, anchor };
  });
}

function renderDiameterMap(graphData, pathIds) {
  const el = document.getElementById('map-diameter');
  if (!el) return;
  const W = el.clientWidth || 800, H = 400;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  d3.select('#map-diameter svg').remove();
  d3.select('#map-diameter p.map-hint').remove();

  const svg = d3.select('#map-diameter').append('svg').attr('width', W).attr('height', H);
  svg.append('defs').append('clipPath').attr('id', 'clip-diameter')
    .append('rect').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('clip-path', 'url(#clip-diameter)');

  g.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r', 1.5).attr('fill', '#1e2235');

  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = byId[pathIds[i]], b = byId[pathIds[i + 1]];
    if (!a || !b) continue;
    const [x1, y1] = proj([a.lon, a.lat]);
    const [x2, y2] = proj([b.lon, b.lat]);
    g.append('line').attr('x1', x1).attr('y1', y1)
      .attr('x2', x2).attr('y2', y2)
      .attr('stroke', '#f7c04f').attr('stroke-width', 2.5);
  }

  pathIds.forEach((id) => {
    const n = byId[id]; if (!n) return;
    const [x, y] = proj([n.lon, n.lat]);
    g.append('circle').attr('cx', x).attr('cy', y).attr('r', 5).attr('fill', '#f7c04f');
  });

  const endpoints = [
    { id: pathIds[0], label: byId[pathIds[0]]?.name ?? '' },
    { id: pathIds[pathIds.length - 1], label: byId[pathIds[pathIds.length - 1]]?.name ?? '' },
  ];

  endpoints.forEach(({ id, label }) => {
    const n = byId[id]; if (!n) return;
    const [x, y] = proj([n.lon, n.lat]);
    g.append('text')
      .attr('x', x + 8).attr('y', y + 4)
      .attr('fill', '#e8eaf0').attr('font-size', '11px').attr('font-weight', '600')
      .text(label);
  });

  _addZoom(svg, g);
  _addMapHint('#map-diameter');
}
