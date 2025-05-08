document.addEventListener("DOMContentLoaded", function () {
    let procesandoRestricciones = false;
    let originalText  = "";
    const okButton = document.getElementById("ok-button");
    const contextInput = document.getElementById("context");
    const wrapper      = document.querySelector(".textarea-with-button");
    const loadingOverlay = document.getElementById("loading-overlay");

    let btnContainer = wrapper.querySelector('.context-btns');
    if (!btnContainer) {
      btnContainer = document.createElement('div');
      btnContainer.className = 'context-btns';
      wrapper.appendChild(btnContainer);
    }
    function showToast(type, message, duration = 3000) {
      const container = document.getElementById('toast-container');
      if (!container) return;

      // Crear elemento
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;

      // Icono
      const icon = document.createElement('span');
      icon.className = 'icon';
      if (type === 'success') icon.textContent = '✔️';
      else if (type === 'error') icon.textContent = '❌';
      else if (type === 'warning') icon.textContent = '⚠️';

      // Mensaje
      const msg = document.createElement('div');
      msg.className = 'message';
      msg.textContent = message;

      // Botón cerrar
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', 'Cerrar');
      closeBtn.style.marginLeft = '0.75rem';
      closeBtn.style.background = 'transparent';
      closeBtn.style.border = 'none';
      closeBtn.style.color = 'inherit';
      closeBtn.style.fontSize = '1.2rem';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.lineHeight = '1';
      closeBtn.addEventListener('click', () => hideToast(toast));

      // Montar y mostrar
      toast.append(icon, msg, closeBtn);
      container.appendChild(toast);

      // Forzar reflow y animar entrada
      requestAnimationFrame(() => toast.classList.add('show'));

      // Auto-ocultar tras duration
      const hideTimeout = setTimeout(() => hideToast(toast), duration);

      // Función de cierre
      function hideToast(el) {
        clearTimeout(hideTimeout);
        el.classList.remove('show');
        el.classList.add('hide');
        el.addEventListener('transitionend', () => el.remove(), { once: true });
      }
    }


    if (loadingOverlay) loadingOverlay.style.display = "none";
    function mostrarPantallaCarga() {
        if (loadingOverlay) loadingOverlay.style.display = "flex";
    }

    function continuar() {
        const ctx = contextInput.value.trim();
        if (!ctx) {
        showToast("warning", "Por favor ingresa algún contexto.");
        return;
        }

        // ── Limpieza de botones previos ──
        ['edit-context', 'summary-context', 'cancel-edit', 'ok-button'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.remove();
        });

        mostrarPantallaCarga();

        fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_data: ctx }),
        })
        .then(res =>
        res.json()
           .then(p => ({ status: res.status, ok: res.ok, p }))
        )
        .then(({ ok, status, p }) => {
        // 1) Ocultar spinner
        if (loadingOverlay) loadingOverlay.style.display = "none";

        if (!ok) throw new Error(p.error || `HTTP ${status}`);

        // 2) Guardar variables
        sessionStorage.setItem("variables", JSON.stringify(p.result));

        // 3) Desactivar edición del textarea
        contextInput.disabled = true;

        // 4) Guardar texto para posible "Cancelar"
        originalText = ctx;

        // 5) Crear y añadir botones "Editar" y "Ver resumen"
        const btnEdit    = document.createElement("button");
        btnEdit.type     = "button";
        btnEdit.id       = "edit-context";
        btnEdit.textContent = "✏️ Editar";

        const btnSummary = document.createElement("button");
        btnSummary.type  = "button";
        btnSummary.id    = "summary-context";
        btnSummary.textContent = "📄 Ver resumen";

        btnContainer.append(btnEdit, btnSummary);

        // 6) Mostrar panel de restricciones
        const restrSection = document.querySelector(".container");
        if (restrSection) restrSection.style.display = "flex";

        showToast("success", "Contexto procesado correctamente.");

        // ── Handler de “✏️ Editar” ──
        btnEdit.addEventListener("click", () => {
          // eliminar ambos botones
          btnEdit.remove();
          btnSummary.remove();

          // reactivar textarea
          contextInput.disabled = false;
          contextInput.focus();

          // crear "Subir" y "Cancelar"
          const btnSave = document.createElement("button");
          btnSave.type = "button";
          btnSave.id = "ok-button";
          btnSave.innerHTML = '<i class="fas fa-arrow-up"></i> Subir';

          const btnCancel = document.createElement("button");
          btnCancel.type = "button";
          btnCancel.id = "cancel-edit";
          btnCancel.textContent = "✖️ Cancelar";

          btnContainer.append(btnSave, btnCancel);

          // Cancelar edición: restaurar valor y volver a Editar/Resumen
          btnCancel.addEventListener("click", () => {
            contextInput.value    = originalText;
            contextInput.disabled = true;
            btnSave.remove();
            btnCancel.remove();
            btnContainer.append(btnEdit, btnSummary);
          });

          // Subir nuevo contexto: limpiar variables previas y reejecutar
          btnSave.addEventListener("click", () => {
            sessionStorage.removeItem("variables");
            continuar();
          });

          // Enter para guardar nuevo contexto
          contextInput.addEventListener("keypress", onEnterSave);
        });

        // ── Handler de “📄 Ver resumen” ──
        btnSummary.addEventListener("click", () => {
          const data = JSON.parse(sessionStorage.getItem("variables") || "{}");
          const { resources = {}, variables = {} } = data;

          // Construye la tabla como antes
          const table = document.createElement("table");
          table.style.width = "100%";
          table.style.borderCollapse = "collapse";
          const thStyle = "border:1px solid #ccc;padding:6px;background:#e9f9ff;text-align:left;";
          const tdStyle = "border:1px solid #ccc;padding:6px;";

          const thead = document.createElement("thead");
          thead.innerHTML = `
            <tr>
              <th style="${thStyle}">Clave</th>
              <th style="${thStyle}">Valores</th>
            </tr>`;
          table.appendChild(thead);

          const tbody = document.createElement("tbody");
          [resources, variables].forEach(obj => {
            Object.entries(obj).forEach(([key, vals]) => {
              const tr = document.createElement("tr");
              tr.innerHTML = `
                <td style="${tdStyle}">${key}</td>
                <td style="${tdStyle}">${Array.isArray(vals) ? vals.join(", ") : vals}</td>
              `;
              tbody.appendChild(tr);
            });
          });
          table.appendChild(tbody);

          // Inserta en el popup
          const popup = document.getElementById("summary-popup");
          const content = document.getElementById("summary-popup-content");
          content.innerHTML = "";
          content.appendChild(table);
          popup.style.display = "flex";

          // Cierre
          const closeBtn = popup.querySelector(".close-summary-popup");
          closeBtn.onclick = () => popup.style.display = "none";
          window.addEventListener("click", e => {
            if (e.target === popup) popup.style.display = "none";
          }, { once: true });
        });


        })
        .catch(err => {
        // ocultar spinner en error
        if (loadingOverlay) loadingOverlay.style.display = "none";
        console.error(err);
        showToast("error", err.message);
        });
        }


      function onEnterSave(e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          document.getElementById("ok-button")?.click();
        }
      }

    if (okButton) okButton.addEventListener("click", continuar);
    if (contextInput) {
        contextInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                continuar();
            }
        });
    }

    function guardarRestricciones() {
        const items = document.querySelectorAll(".restriccion-item");
        const arr = [];
        items.forEach((li) => {
            const chk = li.querySelector(".chk-rest");
            const txt = li.querySelector("label")?.innerText;
            if (txt != null) arr.push({ texto: txt, activa: chk.checked });
        });
        sessionStorage.setItem("restricciones", JSON.stringify(arr));
    }

    function attachInlineEditor(li, label, guardarRestricciones, showToast) {
      // Contenedor para los controles de edición (alineados a la derecha)
      const controlsWrapper = document.createElement("div");
      controlsWrapper.classList.add("edit-controls");
      controlsWrapper.style.display = "flex";
      controlsWrapper.style.alignItems = "center";
      controlsWrapper.style.marginLeft = "auto";

      // Botón ✏️
      const editButton = document.createElement("button");
      editButton.textContent = "✏️";
      editButton.classList.add("edit-btn");
      editButton.title = "Editar"

      controlsWrapper.appendChild(editButton);
      li.appendChild(controlsWrapper);

      editButton.addEventListener("click", () => {
        const oldText = label.textContent;

        // Input de edición (más ancho)
        const inputEdit = document.createElement("input");
        inputEdit.type = "text";
        inputEdit.value = oldText;
        inputEdit.classList.add("edit-input");

        inputEdit.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveBtn.click();
          }
          // Escape para cancelar:
          if (e.key === "Escape") {
            e.preventDefault();
            cancelBtn.click();
          }
        });

        // Contenedor para guardar/cancelar
        const inlineControls = document.createElement("div");
        inlineControls.classList.add("inline-controls");
        inlineControls.style.display = "flex";
        inlineControls.style.alignItems = "center";
        inlineControls.style.marginLeft = "auto";

        // Botón 💾
        const saveBtn = document.createElement("button");
        saveBtn.textContent = "💾";
        saveBtn.classList.add("save-btn");
        saveBtn.title = "Guardar";

        // Botón ✖️
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "✖️";
        cancelBtn.classList.add("cancel-btn");
        cancelBtn.title = "Cancelar";

        inlineControls.append(saveBtn, cancelBtn);

        // Reemplazar label y controles
        label.replaceWith(inputEdit);
        controlsWrapper.replaceWith(inlineControls);

        // Focus al input
        inputEdit.focus();
        inputEdit.select();

        // Cancelar edición
        cancelBtn.addEventListener("click", () => {
          inputEdit.replaceWith(label);
          inlineControls.replaceWith(controlsWrapper);
        });

        // Guardar edición
        saveBtn.addEventListener("click", async () => {
          const newText = inputEdit.value.trim();
          if (!newText || newText === oldText) return cancelBtn.click();
          // --- 1) Mostrar spinner y desactivar botones ---
          const originalContent = saveBtn.textContent;
          saveBtn.textContent = "";                 // vacío para meter spinner
            cancelBtn.style.display = "none";
          saveBtn.disabled = true;
          cancelBtn.disabled = true;

          const spinner = document.createElement("span");
          spinner.classList.add("save-spinner");         // definiremos estilos CSS abajo
          saveBtn.appendChild(spinner);

          try {
            const res = await fetch("/api/edit_constraint", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ old_nl: oldText, new_nl: newText })
            });
            const result = await res.json();

            if (res.ok && result.success) {
              label.textContent = newText;
              inputEdit.replaceWith(label);
              inlineControls.replaceWith(controlsWrapper);
              guardarRestricciones();
              showToast("success", "Restricción editada correctamente.");
            } else {
              throw new Error(result.error || "Server error");
            }
          } catch (e) {
            showToast("error", "Error al editar restricción.");
            console.error(e);

            // --- 4) Si falla, restauramos el botón para reintentar o cancelar ---
            saveBtn.removeChild(spinner);
            saveBtn.textContent = originalContent;
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
          }
        });
      });
    }



    async function intentarConvertir(constraint, intentos = 3) {
        try {
            const res = await fetch("/api/convert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ constraint }),
            });
            if (!res.ok) throw new Error("Respuesta no ok");
            await res.json(); // no usamos el resultado visual aquí

            const lista = document.querySelector(".restricciones-list");
            if (!lista) return;

            // evitar duplicados
            if (
                Array.from(lista.children).some(
                    (li) => li.querySelector("label")?.innerText === constraint
                )
            ) return;

            const li = document.createElement("li");
            li.classList.add("restriccion-item");

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;
            checkbox.classList.add("chk-rest");
            checkbox.addEventListener("change", guardarRestricciones);

            const label = document.createElement("label");
            label.textContent = constraint;
            label.style.marginLeft = "8px";


            li.append(checkbox, label);
            attachInlineEditor(li, label, guardarRestricciones, showToast);
            lista.appendChild(li);
            guardarRestricciones();
            showToast("success", "Restricción añadida correctamente.");
        } catch (err) {
            if (intentos > 1) {
                await new Promise((r) => setTimeout(r, 1000));
                return intentarConvertir(constraint, intentos - 1);
            } else {
                showToast("error", "No se pudo añadir la restricción.");
                const resDiv = document.getElementById("constraint-result");
                if (resDiv) resDiv.innerText = "Error al contactar con la API.";
            }
        }
    }

    const convertButton = document.getElementById("convert-button");
    if (convertButton) {
      convertButton.addEventListener("click", async () => {
        const inp = document.getElementById("constraint");
        if (!inp) return;

        const raw = inp.value.trim();
        if (!raw) {
          showToast("warning", "Por favor ingresa al menos una restricción.");
          return;
        }

        // Preparo lista de restricciones
        const constraints = raw
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);

        // Limpio textarea y pongo foco
        inp.value = "";
        inp.focus();

        // Mostrar y configurar barra de progreso
        const progressContainer = document.getElementById("progress-container");
        const progressBar       = document.getElementById("progress-bar");
        const progressLabel     = document.getElementById("progress-label");
        progressBar.max   = constraints.length;
        progressBar.value = 0;
        progressLabel.textContent = `Procesando 0 de ${constraints.length}…`;
        progressContainer.style.display = "block";

        // Deshabilito botón y marco estado
        procesandoRestricciones = true;
        convertButton.disabled  = true;

        // Itero y actualizo progreso
        for (let i = 0; i < constraints.length; i++) {
          const c = constraints[i];
          await intentarConvertir(c);
          progressBar.value = i + 1;
          progressLabel.textContent = `Procesando ${i + 1} de ${constraints.length}…`;
        }

        // Restauro estado inicial
        procesandoRestricciones = false;
        convertButton.disabled   = false;
        progressContainer.style.display = "none";

        showToast("success", "Todas las restricciones se han añadido.");
      });
    }


    function cargarRestricciones() {
        const lista = document.querySelector(".restricciones-list");
        if (!lista) return;
        const guardadas = JSON.parse(sessionStorage.getItem("restricciones") || "[]");
        guardadas.forEach(({ texto, activa }) => {
            const li = document.createElement("li");
            li.classList.add("restriccion-item");

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = activa;
            checkbox.classList.add("chk-rest");
            checkbox.addEventListener("change", guardarRestricciones);

            const label = document.createElement("label");
            label.textContent = texto;
            label.style.marginLeft = "8px";

            li.append(checkbox, label);
            attachInlineEditor(li, label, guardarRestricciones, showToast);
            lista.appendChild(li);
        });
    }

    // cargar al inicio
    cargarRestricciones();

    const resultadoModal = document.getElementById("resultado-modal");
    const resultadoContenido = document.getElementById("resultado-contenido");
    const closeResultadoBtn = resultadoModal?.querySelector(".close-btn");
    const downloadExcelBtn = document.getElementById("download-excel-btn");

    function showResultadoModal() {
        resultadoModal.style.display = "flex";
    }

    function closeResultadoModal() {
        resultadoModal.style.display = "none";
    }

    if (closeResultadoBtn) {
        closeResultadoBtn.addEventListener("click", closeResultadoModal);
    }

    window.addEventListener("click", (event) => {
        if (event.target === resultadoModal) closeResultadoModal();
    });

    if (downloadExcelBtn) {
        downloadExcelBtn.addEventListener("click", () => {
            window.location.href = "/api/download_excel";
        });
    }

    function parseKey(key) {
        const regex = /\(\s*['"]?([^,'"]+)['"]?\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/;
        const match = key.match(regex);
        if (match) {
            const entidad = match[1];
            const dia = parseInt(match[2], 10);
            const franja = parseInt(match[3], 10);
            return { entidad, dia, franja };
        } else {
            return null;
        }
    }

    const optimizeButton = document.getElementById('optimize-button');
    if (optimizeButton) {
        optimizeButton.addEventListener('click', function () {
            if (procesandoRestricciones) {
                showToast("warning", "Espera a que se terminen de procesar las restricciones antes de optimizar.");
                return;
            }
            const restricciones = document.querySelector('.restricciones-list').children;
            if (restricciones.length === 0) {
                showToast("warning", "Por favor ingresa al menos una restricción antes de optimizar.");
                return;
            }

            mostrarPantallaCarga();

            const items = document.querySelectorAll('.restriccion-item');
            const activeConstraints = [];

            items.forEach(li => {
              const chk = li.querySelector('.chk-rest');
              const texto = li.querySelector('label').innerText;
              if (chk.checked) {
                activeConstraints.push(texto);
              }
            });

            // luego lo envías en el body:
            fetch('/api/optimize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ active_constraints: activeConstraints })
            })


                .then(response => response.json())
                .then(data => {
                    loadingOverlay.style.display = "none";
                    showResultadoModal();

                    const resultDiv = document.getElementById('optimization-result');
                    resultDiv.style.display = 'block';
                    resultDiv.innerHTML = '';

                    if (typeof data.solution === 'object') {
                        const resumen = {};
                        const trabajadores = new Set();

                        for (const [key, value] of Object.entries(data.solution)) {
                            if (value > 0.5) {
                                const parsed = parseKey(key);
                                if (!parsed) continue;
                                const { entidad, dia, franja } = parsed;
                                trabajadores.add(entidad);

                                if (!resumen[franja]) resumen[franja] = {};
                                if (!resumen[franja][dia]) resumen[franja][dia] = [];
                                resumen[franja][dia].push(entidad);
                            }
                        }

                        const turnos = Math.max(...Object.keys(resumen).map(Number), 0) + 1;
                        const dias = Math.max(...Object.values(resumen).flatMap(obj => Object.keys(obj).map(Number)), 0) + 1;

                        // Filtro por trabajador
                        const filtroContainer = document.createElement('div');
                        filtroContainer.innerHTML = `
                            <label for="worker-filter">Filtrar por trabajador:</label>
                            <select id="worker-filter">
                                <option value="Todos">Todos</option>
                                ${[...trabajadores].map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select><br><br>`;
                        resultDiv.appendChild(filtroContainer);

                        const tablaContainer = document.createElement('div');
                        resultDiv.appendChild(tablaContainer);

                        function renderTabla(filtro) {
                            const table = document.createElement('table');
                            table.classList.add('resultado-grid');
                            table.innerHTML = '<thead><tr><th>Turno \\ Día</th>' +
                                Array.from({ length: dias }, (_, d) => `<th>Día ${d + 1}</th>`).join('') +
                                '</tr></thead><tbody>';

                            for (let t = 0; t < turnos; t++) {
                                let row = `<tr><td><b>Turno ${t}</b></td>`;
                                for (let d = 0; d < dias; d++) {
                                    const entidades = resumen[t]?.[d] || [];
                                    const filtradas = filtro === 'Todos' ? entidades : entidades.filter(e => e === filtro);
                                    const texto = filtradas.length > 0 ? filtradas.join(' / ') : 'Descanso';
                                    const color = texto === 'Descanso' ? '#f4cccc' : '#d9ead3';
                                    row += `<td style="background:${color};text-align:center">${texto}</td>`;
                                }
                                row += '</tr>';
                                table.innerHTML += row;
                            }

                            table.innerHTML += '</tbody>';
                            tablaContainer.innerHTML = '';
                            tablaContainer.appendChild(table);
                        }

                        const filtroSelect = filtroContainer.querySelector('#worker-filter');
                        filtroSelect.addEventListener('change', () => renderTabla(filtroSelect.value));
                        renderTabla('Todos');

                        showToast("success", "Optimización completada.");
                    } else {
                        resultDiv.innerText = data.solution;
                        showToast("success", "Resultado de la optimización disponible.");
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showToast("error", "Error al contactar con la API.");
                    document.getElementById('optimization-result').innerText = "Error al contactar con la API.";
                });
        });
    }

    if (contextInput) contextInput.focus();
    const constraintInput = document.getElementById('constraint');
    if (constraintInput) constraintInput.focus();
});