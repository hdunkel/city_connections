// web/js/pathfinder.js

function bfs(edges, sourceId, targetId) {
  if (sourceId === targetId) return [sourceId];
  const adj = {};
  for (const { source, target } of edges) {
    if (!adj[source]) adj[source] = [];
    adj[source].push(target);
  }
  const visited = new Set([sourceId]);
  const queue = [[sourceId]];
  while (queue.length) {
    const path = queue.shift();
    const node = path[path.length - 1];
    for (const nbr of (adj[node] ?? [])) {
      if (nbr === targetId) return [...path, nbr];
      if (!visited.has(nbr)) {
        visited.add(nbr);
        queue.push([...path, nbr]);
      }
    }
  }
  return null;
}

function attachAutocomplete(input, names) {
  const listId = input.id + '-list';
  const dl = document.createElement('datalist');
  dl.id = listId;
  input.setAttribute('list', listId);
  input.parentNode.appendChild(dl);
  input.addEventListener('input', () => {
    const val = input.value.toLowerCase();
    dl.innerHTML = names
      .filter(n => n.toLowerCase().startsWith(val))
      .slice(0, 10)
      .map(n => `<option value="${n}">`)
      .join('');
  });
}

function initPathfinder(graphData) {
  const nodeNames = graphData.nodes.map(n => n.name);
  const nameToId  = Object.fromEntries(graphData.nodes.map(n => [n.name, n.id]));
  const idToName  = Object.fromEntries(graphData.nodes.map(n => [n.id,   n.name]));

  const inputFrom = document.getElementById('input-from');
  const inputTo   = document.getElementById('input-to');
  const btn       = document.getElementById('btn-find');
  const result    = document.getElementById('path-result');

  attachAutocomplete(inputFrom, nodeNames);
  attachAutocomplete(inputTo,   nodeNames);

  btn.addEventListener('click', () => {
    const fromId = nameToId[inputFrom.value];
    const toId   = nameToId[inputTo.value];
    if (!fromId || !toId) {
      result.textContent = 'City not found — check spelling.';
      return;
    }
    const path = bfs(graphData.edges, fromId, toId);
    if (!path) {
      result.textContent = 'No path found between these cities.';
      d3.select('#map-path svg').remove();
      return;
    }
    result.textContent = path.map(id => idToName[id]).join(' → ');
    highlightPath(graphData, path);
  });
}
