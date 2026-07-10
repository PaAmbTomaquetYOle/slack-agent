/**
 * Self-contained knowledge graph visualization page: inline CSS/JS, no CDN dependencies
 * (the D3 force-simulation and zoom/drag logic are hand-rolled to avoid an external script tag).
 */
export const KNOWLEDGE_GRAPH_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OffboardMe Knowledge Graph</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0b0e14; color: #e6e8ee; height: 100vh; overflow: hidden;
  }
  @media (prefers-color-scheme: light) {
    body { background: #f6f7fb; color: #1a1d24; }
  }
  #toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    display: flex; gap: 12px; align-items: center; padding: 10px 16px;
    background: rgba(20, 23, 32, 0.85); backdrop-filter: blur(6px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  @media (prefers-color-scheme: light) {
    #toolbar { background: rgba(255,255,255,0.85); border-bottom-color: rgba(0,0,0,0.08); }
  }
  #toolbar input[type="text"] {
    flex: 1; max-width: 320px; padding: 6px 10px; border-radius: 6px;
    border: 1px solid rgba(128,128,128,0.4); background: transparent; color: inherit;
  }
  #toolbar label { display: flex; align-items: center; gap: 4px; font-size: 13px; }
  #toolbar h1 { font-size: 15px; margin: 0 12px 0 0; white-space: nowrap; }
  #status { position: fixed; top: 52px; left: 16px; font-size: 12px; opacity: 0.7; z-index: 10; }
  svg { width: 100vw; height: 100vh; display: block; }
  .node-person circle { fill: #4c8dff; }
  .node-topic circle { fill: #35c979; }
  .node-label { font-size: 10px; fill: currentColor; pointer-events: none; }
  .link { stroke: currentColor; stroke-opacity: 0.25; }
  #sidebar {
    position: fixed; top: 52px; right: 0; bottom: 0; width: 280px;
    background: rgba(20, 23, 32, 0.92); border-left: 1px solid rgba(255,255,255,0.08);
    padding: 16px; overflow-y: auto; display: none; font-size: 13px;
  }
  @media (prefers-color-scheme: light) {
    #sidebar { background: rgba(255,255,255,0.92); border-left-color: rgba(0,0,0,0.08); }
  }
  #sidebar.open { display: block; }
  #sidebar h2 { font-size: 14px; margin: 0 0 8px; }
  #sidebar .close { float: right; cursor: pointer; opacity: 0.6; }
</style>
</head>
<body>
  <div id="toolbar">
    <h1>&#128202; Knowledge Graph</h1>
    <input type="text" id="search" placeholder="Search person or topic..." />
    <label><input type="checkbox" id="filter-person" checked /> People</label>
    <label><input type="checkbox" id="filter-topic" checked /> Topics</label>
  </div>
  <div id="status">Loading...</div>
  <svg id="graph"></svg>
  <div id="sidebar"><span class="close" id="sidebar-close">&#10005;</span><div id="sidebar-content"></div></div>

<script>
(function () {
  var svg = document.getElementById('graph');
  var ns = 'http://www.w3.org/2000/svg';
  var status = document.getElementById('status');
  var sidebar = document.getElementById('sidebar');
  var sidebarContent = document.getElementById('sidebar-content');
  document.getElementById('sidebar-close').onclick = function () { sidebar.classList.remove('open'); };

  var width = window.innerWidth, height = window.innerHeight;

  fetch('/api/knowledge-graph/data')
    .then(function (r) { return r.json(); })
    .then(function (data) { init(data); })
    .catch(function (err) {
      status.textContent = 'Failed to load knowledge graph: ' + err;
    });

  function init(data) {
    status.textContent = data.nodes.length + ' nodes, ' + data.edges.length + ' relationships';

    var nodesById = {};
    data.nodes.forEach(function (n) {
      n.x = width / 2 + (Math.random() - 0.5) * 200;
      n.y = height / 2 + (Math.random() - 0.5) * 200;
      n.vx = 0; n.vy = 0;
      nodesById[n.id] = n;
    });
    var edges = data.edges
      .map(function (e) { return { source: nodesById[e.source], target: nodesById[e.target], weight: e.weight }; })
      .filter(function (e) { return e.source && e.target; });

    var g = document.createElementNS(ns, 'g');
    svg.appendChild(g);
    var linkGroup = document.createElementNS(ns, 'g');
    var nodeGroup = document.createElementNS(ns, 'g');
    g.appendChild(linkGroup);
    g.appendChild(nodeGroup);

    var linkEls = edges.map(function (e) {
      var line = document.createElementNS(ns, 'line');
      line.setAttribute('class', 'link');
      line.setAttribute('stroke-width', Math.max(1, e.weight * 3));
      linkGroup.appendChild(line);
      return line;
    });

    var nodeEls = data.nodes.map(function (n) {
      var el = document.createElementNS(ns, 'g');
      el.setAttribute('class', 'node-' + n.type);
      var circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('r', n.type === 'person' ? 8 : 6);
      var label = document.createElementNS(ns, 'text');
      label.setAttribute('class', 'node-label');
      label.setAttribute('dx', 10);
      label.setAttribute('dy', 4);
      label.textContent = n.label;
      el.appendChild(circle);
      el.appendChild(label);
      el.style.cursor = 'pointer';
      el.addEventListener('click', function () { showDetails(n); });
      makeDraggable(el, n);
      nodeGroup.appendChild(el);
      return el;
    });

    function showDetails(n) {
      sidebarContent.innerHTML = '<h2>' + escapeHtml(n.label) + '</h2>' +
        '<p>Type: ' + n.type + '</p>' +
        (n.department ? '<p>Department: ' + escapeHtml(n.department) + '</p>' : '') +
        '<p>Connections: ' + edges.filter(function (e) { return e.source === n || e.target === n; }).length + '</p>';
      sidebar.classList.add('open');
    }

    function escapeHtml(s) {
      var div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    }

    // Minimal force simulation: repulsion between all nodes, attraction along edges, centering.
    function tick() {
      for (var i = 0; i < data.nodes.length; i++) {
        for (var j = i + 1; j < data.nodes.length; j++) {
          var a = data.nodes[i], b = data.nodes[j];
          var dx = b.x - a.x, dy = b.y - a.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var force = 800 / (dist * dist);
          var fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }
      edges.forEach(function (e) {
        var dx = e.target.x - e.source.x, dy = e.target.y - e.source.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var force = (dist - 100) * 0.02;
        var fx = (dx / dist) * force, fy = (dy / dist) * force;
        e.source.vx += fx; e.source.vy += fy;
        e.target.vx -= fx; e.target.vy -= fy;
      });
      data.nodes.forEach(function (n) {
        if (n.fixed) return;
        n.vx += (width / 2 - n.x) * 0.002;
        n.vy += (height / 2 - n.y) * 0.002;
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
      });
      render();
    }

    function render() {
      linkEls.forEach(function (line, i) {
        var e = edges[i];
        line.setAttribute('x1', e.source.x); line.setAttribute('y1', e.source.y);
        line.setAttribute('x2', e.target.x); line.setAttribute('y2', e.target.y);
      });
      nodeEls.forEach(function (el, i) {
        var n = data.nodes[i];
        el.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
      });
    }

    var simInterval = setInterval(tick, 30);
    window.addEventListener('beforeunload', function () { clearInterval(simInterval); });

    function makeDraggable(el, n) {
      var dragging = false;
      el.addEventListener('mousedown', function (ev) {
        dragging = true; n.fixed = true; ev.preventDefault();
      });
      window.addEventListener('mousemove', function (ev) {
        if (!dragging) return;
        var rect = svg.getBoundingClientRect();
        n.x = ev.clientX - rect.left; n.y = ev.clientY - rect.top;
      });
      window.addEventListener('mouseup', function () { dragging = false; });
    }

    // Pan + zoom
    var scale = 1, tx = 0, ty = 0, panning = false, lastX = 0, lastY = 0;
    function applyTransform() {
      g.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
    }
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      scale = Math.min(4, Math.max(0.2, scale * (ev.deltaY < 0 ? 1.1 : 0.9)));
      applyTransform();
    }, { passive: false });
    svg.addEventListener('mousedown', function (ev) {
      if (ev.target === svg) { panning = true; lastX = ev.clientX; lastY = ev.clientY; }
    });
    window.addEventListener('mousemove', function (ev) {
      if (!panning) return;
      tx += ev.clientX - lastX; ty += ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;
      applyTransform();
    });
    window.addEventListener('mouseup', function () { panning = false; });

    // Filters
    function applyFilters() {
      var showPerson = document.getElementById('filter-person').checked;
      var showTopic = document.getElementById('filter-topic').checked;
      nodeEls.forEach(function (el, i) {
        var n = data.nodes[i];
        var visible = (n.type === 'person' && showPerson) || (n.type === 'topic' && showTopic);
        el.style.display = visible ? '' : 'none';
      });
      linkEls.forEach(function (line, i) {
        var e = edges[i];
        var visible = nodeVisible(e.source) && nodeVisible(e.target);
        line.style.display = visible ? '' : 'none';
      });
      function nodeVisible(n) {
        return (n.type === 'person' && showPerson) || (n.type === 'topic' && showTopic);
      }
    }
    document.getElementById('filter-person').addEventListener('change', applyFilters);
    document.getElementById('filter-topic').addEventListener('change', applyFilters);

    // Search highlight
    document.getElementById('search').addEventListener('input', function (ev) {
      var q = ev.target.value.trim().toLowerCase();
      nodeEls.forEach(function (el, i) {
        var n = data.nodes[i];
        var match = q.length > 0 && n.label.toLowerCase().indexOf(q) !== -1;
        el.querySelector('circle').setAttribute('stroke', match ? '#ffd23f' : 'none');
        el.querySelector('circle').setAttribute('stroke-width', match ? '3' : '0');
      });
    });
  }
})();
</script>
</body>
</html>
`;
