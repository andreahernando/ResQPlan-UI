// 1) Leer el resultado
const raw = sessionStorage.getItem('optimizationResult');
const container = document.getElementById('results-content');

if (!raw) {
  container.innerHTML = '<p class="no-data">No hay resultados cargados.</p>';
} else {
  const data = JSON.parse(raw);

  // 2) Procesar la solución en un objeto 'resumen'
  const resumen = {};
  const trabajadores = new Set();
  for (const [key, value] of Object.entries(data.solution)) {
    if (value > 0.5) {
      const parsed = parseKey(key);
      if (!parsed) continue;
      const { entidad, dia, franja } = parsed;
      trabajadores.add(entidad);
      resumen[franja] = resumen[franja] || {};
      resumen[franja][dia] = resumen[franja][dia] || [];
      resumen[franja][dia].push(entidad);
    }
  }

  // 3) Calcular dimensiones
  const turnos = Math.max(...Object.keys(resumen).map(Number), 0) + 1;
  const dias = Math.max(
    ...Object.values(resumen).flatMap(obj => Object.keys(obj).map(Number)),
    0
  ) + 1;

  // 4) Inyectar filtro + contenedor de tabla
  container.innerHTML = `
    <div class="filter-container">
      <label for="worker-filter">Filtrar por trabajador:</label>
      <select id="worker-filter" class="filter-select">
        <option value="Todos">Todos</option>
        ${[...trabajadores].map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <div id="tabla-container" class="table-wrapper"></div>
  `;

  // 5) Función para renderizar la tabla según el filtro
  function renderTabla(filtro) {
    let html = `
      <table class="resultado-grid">
        <thead>
          <tr>
            <th>Turno \\ Día</th>
            ${Array.from({ length: dias }, (_, d) => `<th>Día ${d + 1}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    for (let t = 0; t < turnos; t++) {
      html += `<tr><td><strong>Turno ${t}</strong></td>`;
      for (let d = 0; d < dias; d++) {
        const entidades = resumen[t]?.[d] || [];
        const visibles = filtro === 'Todos'
          ? entidades
          : entidades.filter(e => e === filtro);
        const texto = visibles.length ? visibles.join(' / ') : 'Descanso';
        const clase = visibles.length ? 'active-cell' : 'rest-cell';
        html += `<td class="${clase}">${texto}</td>`;
      }
      html += `</tr>`;
    }

    html += `
        </tbody>
      </table>
    `;

    document.getElementById('tabla-container').innerHTML = html;
  }

  // 6) Listener del select + primera renderización
  const filtroSelect = document.getElementById('worker-filter');
  filtroSelect.addEventListener('change', () => {
    renderTabla(filtroSelect.value);
  });
  renderTabla('Todos');

  // 7) Botón “Volver”
  document.getElementById('back-btn').addEventListener('click', () => {
    window.history.back();
  });

  // 8) Botón “Descargar Excel”
  document.getElementById('download-excel-btn').addEventListener('click', () => {
    window.location.href = '/api/download_excel';
  });
}

// --- Función auxiliar para parsear la clave ---
function parseKey(key) {
  const regex = /\(\s*['"]?([^,'"]+)['"]?\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/;
  const m = key.match(regex);
  if (!m) return null;
  return { entidad: m[1], dia: +m[2], franja: +m[3] };
}
