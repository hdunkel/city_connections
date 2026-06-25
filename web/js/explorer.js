function initExplorer(graphData) {
  const nodeById    = Object.fromEntries(graphData.nodes.map(n => [n.id, n]));
  const nodeNames   = graphData.nodes.map(n => n.name).sort();
  const nameToIdLow = Object.fromEntries(graphData.nodes.map(n => [n.name.toLowerCase(), n.id]));
  const nameToId    = v => nameToIdLow[v.trim().toLowerCase()];

  // Index edges by target (incoming) and source (outgoing)
  const incoming = {};
  const outgoing = {};
  for (const e of graphData.edges) {
    if (!incoming[e.target]) incoming[e.target] = [];
    incoming[e.target].push(e);
    if (!outgoing[e.source]) outgoing[e.source] = [];
    outgoing[e.source].push(e);
  }

  const input     = document.getElementById('explorer-input');
  const container = document.getElementById('explorer-result');

  const dl = document.createElement('datalist');
  dl.id = 'explorer-list';
  input.setAttribute('list', 'explorer-list');
  input.parentNode.appendChild(dl);

  input.addEventListener('input', () => {
    const val = input.value.toLowerCase();
    const matches = nodeNames.filter(n => n.toLowerCase().startsWith(val)).slice(0, 10);
    dl.replaceChildren(...matches.map(n => {
      const o = document.createElement('option');
      o.value = n;
      return o;
    }));
  });

  const exBtn = document.getElementById('btn-example-explorer');
  if (exBtn) {
    exBtn.addEventListener('click', () => {
      input.value = 'Berlin';
      input.dispatchEvent(new Event('change'));
    });
  }

  input.addEventListener('change', () => {
    const id = nameToId(input.value);
    if (!id) { container.replaceChildren(); return; }
    const node = nodeById[id];
    renderExplorer(graphData, node, incoming[id] ?? [], outgoing[id] ?? [], nodeById, container);
  });
}

function _osmLink(street, lat, lon) {
  const a = document.createElement('a');
  a.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=17`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.className = 'street-link';
  a.textContent = street + ' ↗';
  return a;
}

function renderExplorer(graphData, node, inEdges, outEdges, nodeById, container) {
  container.replaceChildren();

  const header = document.createElement('p');
  header.className = 'explorer-header';
  header.textContent =
    `${node.name}  ·  ${node.population.toLocaleString('de-DE')} Einw.  ·  ` +
    `${inEdges.length} cities point here  ·  ${outEdges.length} outgoing streets`;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'explorer-grid';

  // --- INCOMING ---
  const inCol = document.createElement('div');
  const inH = document.createElement('h4');
  inH.textContent = `↙ Cities with a street named after ${node.name}`;
  inCol.appendChild(inH);

  const inSorted = [...inEdges].sort((a, b) =>
    (nodeById[a.source]?.name ?? '').localeCompare(nodeById[b.source]?.name ?? ''));

  for (const e of inSorted) {
    const src = nodeById[e.source];
    if (!src) continue;
    const row = document.createElement('div');
    row.className = 'explorer-row';
    const city = document.createElement('span');
    city.className = 'explorer-city-name';
    city.textContent = src.name;
    row.append(city, _osmLink(e.street, e.lat, e.lon));
    inCol.appendChild(row);
  }

  // --- OUTGOING ---
  const outCol = document.createElement('div');
  const outH = document.createElement('h4');
  outH.textContent = `↗ Streets in ${node.name} leading to other cities`;
  outCol.appendChild(outH);

  const outSorted = [...outEdges].sort((a, b) =>
    (nodeById[a.target]?.name ?? '').localeCompare(nodeById[b.target]?.name ?? ''));

  for (const e of outSorted) {
    const tgt = nodeById[e.target];
    if (!tgt) continue;
    const row = document.createElement('div');
    row.className = 'explorer-row';
    row.append(_osmLink(e.street, e.lat, e.lon), (() => {
      const s = document.createElement('span');
      s.className = 'explorer-city-name';
      s.textContent = tgt.name;
      return s;
    })());
    outCol.appendChild(row);
  }

  grid.append(inCol, outCol);
  container.appendChild(grid);

  // Maps row
  const mapsRow = document.createElement('div');
  mapsRow.className = 'explorer-maps';

  const inMapWrap = document.createElement('div');
  inMapWrap.className = 'explorer-map-wrap';
  const inMapLabel = document.createElement('p');
  inMapLabel.className = 'explorer-map-label';
  inMapLabel.textContent = `Cities with a ${node.name}er Straße`;
  const inMapDiv = document.createElement('div');
  inMapDiv.className = 'explorer-map';
  inMapDiv.id = 'map-expl-in';
  inMapWrap.append(inMapLabel, inMapDiv);

  const outMapWrap = document.createElement('div');
  outMapWrap.className = 'explorer-map-wrap';
  const outMapLabel = document.createElement('p');
  outMapLabel.className = 'explorer-map-label';
  outMapLabel.textContent = `Cities that ${node.name} streets lead to`;
  const outMapDiv = document.createElement('div');
  outMapDiv.className = 'explorer-map';
  outMapDiv.id = 'map-expl-out';
  outMapWrap.append(outMapLabel, outMapDiv);

  mapsRow.append(inMapWrap, outMapWrap);
  container.appendChild(mapsRow);

  const inNeighborIds  = inEdges.map(e => e.source);
  const outNeighborIds = outEdges.map(e => e.target);
  renderExplorerMap(graphData, node.id, inNeighborIds,  '#map-expl-in',  'var(--accent)', 'in');
  renderExplorerMap(graphData, node.id, outNeighborIds, '#map-expl-out', 'var(--gold)',   'out');
}
