const raw = sessionStorage.getItem('optimizationResult');
const container = document.getElementById('results-content');

if (!raw) {
  container.innerHTML = '<p class="no-data">No hay resultados cargados.</p>';
} else {
  const data = JSON.parse(raw);


  const resumen = {};
  const trabajadores = new Set();

  for (const [key, value] of Object.entries(data.solution)) {
    if (value > 0.5) {
      const parsed = parseKey(key);
      if (!parsed) continue;

      const { entidades, dia, franja } = parsed;

      entidades.forEach(e => trabajadores.add(e));

      resumen[franja]          = resumen[franja] || {};
      resumen[franja][dia]     = resumen[franja][dia]  || [];

      resumen[franja][dia].push(entidades.join(" / "));
    }
  }


  const turnos = Math.max(...Object.keys(resumen).map(Number), 0) + 1;
  const dias = Math.max(
    ...Object.values(resumen).flatMap(obj => Object.keys(obj).map(Number)),
    0
  ) + 1;

    const relaxed = [...new Set(JSON.parse(sessionStorage.getItem('relaxedConstraints') || '[]'))];

    let warningHtml = '';
    if (relaxed.length) {
      const items = relaxed.map(nl => `
        <li class="relaxed-list-item">${nl}</li>
      `).join('');

      const detailedExplanation = `
        <div id="relaxed-explanation" class="relaxed-explanation" style="display:none;">
          <strong>¿Qué significa “relajar” una restricción?</strong>
          <p>
            Al relajar una restricción permitimos al solver incumplir ligeramente
            la condición original (por ejemplo, desplazar turnos o reducir mínimos)
            para garantizar que se encuentre <em>alguna</em> solución factible.
            Esto evita que un conjunto de reglas demasiado rígidas bloquee totalmente
            el calendario.
          </p>
        </div>
      `;

      warningHtml = `
        <div class="relaxed-warning-panel">
          <p id="relaxed-warning-text" style="cursor:pointer;">
            ⚠️ Se han relajado las siguientes restricciones: (haz clic para más info)
          </p>
          <ul class="relaxed-list">
            ${items}
          </ul>
          ${detailedExplanation}
        </div>
      `;
    }

    container.innerHTML = `
      ${warningHtml}
      <div class="filter-container">
        <label for="worker-filter">Filtrar por trabajador:</label>
        <select id="worker-filter" class="filter-select">
          <option value="Todos">Todos</option>
          ${[...trabajadores].map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div id="tabla-container" class="table-wrapper"></div>
    `;

    if (relaxed.length) {
      const warningText = document.getElementById('relaxed-warning-text');
      const explanation  = document.getElementById('relaxed-explanation');
      warningText.addEventListener('click', () => {
        explanation.style.display =
          explanation.style.display === 'none' ? 'block' : 'none';
      });
    }


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
        const grupos = resumen[t]?.[d] || [];

        const visibles = grupos.filter(grupo => {
          if (filtro === 'Todos') return true;
          const partes = grupo.split(' / ');
          return partes.some(entidad => entidad === filtro);
        });

        const texto = visibles.length
          ? visibles.join(', ')
          : 'Descanso';

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

  const filtroSelect = document.getElementById('worker-filter');
  filtroSelect.addEventListener('change', () => {
    renderTabla(filtroSelect.value);
  });
  renderTabla('Todos');

 document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = '/';
});


  document.getElementById('download-excel-btn').addEventListener('click', () => {
    window.location.href = '/api/download_excel';
  });
}

function parseKey(key) {
  let entidades = [], dia, franja;

  if (key.startsWith("(")) {
    const regex = /^\(\s*(.+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/;
    const m = key.match(regex);
    if (!m) return null;

    entidades = m[1]
      .split(/\s*,\s*/)
      .map(s => s.replace(/^['"]|['"]$/g, ""));

    dia    = Number(m[2]);
    franja = Number(m[3]);

  } else {
    const body = key.startsWith("x_") ? key.slice(2) : key;
    const parts = body.split("_");

    franja = Number(parts.pop());
    dia    = Number(parts.pop());
    if (isNaN(dia) || isNaN(franja)) return null;

    entidades = parts;
  }

  return { entidades, dia, franja };
}



