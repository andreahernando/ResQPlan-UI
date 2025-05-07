document.addEventListener("DOMContentLoaded", function () {
    let procesandoRestricciones = false;
    const okButton = document.getElementById("ok-button");
    const contextInput = document.getElementById("context");
    const loadingOverlay = document.getElementById("loading-overlay");

    function showNotification(type, message) {
        const notification = document.createElement("div");
        notification.classList.add("notification", "show", type);

        const icon = document.createElement("span");
        icon.classList.add("icon");
        if (type === "success") icon.textContent = "✔️";
        else if (type === "error") icon.textContent = "❌";
        else if (type === "warning") icon.textContent = "⚠️";

        const text = document.createElement("span");
        text.textContent = message;

        notification.appendChild(icon);
        notification.appendChild(text);
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    if (loadingOverlay) loadingOverlay.style.display = "none";
    function mostrarPantallaCarga() {
        if (loadingOverlay) loadingOverlay.style.display = "flex";
    }

    function continuar() {
        if (!contextInput) return;
        const context = contextInput.value.trim();
        if (!context) {
            showNotification("warning", "Por favor ingresa algún contexto.");
            return;
        }
        mostrarPantallaCarga();
        sessionStorage.setItem("cargando", "true");
        fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input_data: context }),
        })
            .then((res) => res.json())
            .then((data) => {
                sessionStorage.setItem("variables", JSON.stringify(data.result));
                window.location.href = "/restricciones";
            })
            .catch((_) => {
                showNotification("error", "Error al contactar con la API.");
                sessionStorage.setItem("cargando", "error");
            });
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

            // botón editar
            const editButton = document.createElement("button");
            editButton.textContent = "✏️";
            editButton.classList.add("edit-btn");
            editButton.style.marginLeft = "8px";
            editButton.addEventListener("click", async () => {
              const oldNl = label.textContent;
              const newNl = prompt("Editar restricción:", oldNl);
              if (!newNl || !newNl.trim() || newNl === oldNl) return;
              try {
                const res = await fetch("/api/edit_constraint", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ old_nl: oldNl, new_nl: newNl.trim() })
                });
                const result = await res.json();
                if (res.ok && result.success) {
                  label.textContent = newNl.trim();
                  guardarRestricciones();
                  showNotification("success", "Restricción editada correctamente.");
                } else {
                  throw new Error(result.error || "Fallo en servidor");
                }
              } catch (err) {
                showNotification("error", "No se pudo editar la restricción.");
                console.error(err);
              }
            });
            li.append(checkbox, label, editButton);
            lista.appendChild(li);
            guardarRestricciones();
            showNotification("success", "Restricción añadida correctamente.");
        } catch (err) {
            if (intentos > 1) {
                await new Promise((r) => setTimeout(r, 1000));
                return intentarConvertir(constraint, intentos - 1);
            } else {
                showNotification("error", "No se pudo añadir la restricción.");
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
                showNotification("warning", "Por favor ingresa al menos una restricción.");
                return;
            }
            inp.value = "";
            inp.focus();
            procesandoRestricciones = true;
            for (const c of raw.split("\n").map((x) => x.trim()).filter(Boolean)) {
                await intentarConvertir(c);
            }
            procesandoRestricciones = false;
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

            const editButton = document.createElement("button");
            editButton.textContent = "✏️";
            editButton.classList.add("edit-btn");
            editButton.style.marginLeft = "8px";
            editButton.addEventListener("click", async () => {
              const oldNl = label.textContent;
              const newNl = prompt("Editar restricción:", oldNl);
              if (!newNl || !newNl.trim() || newNl === oldNl) return;
              // idéntico fetch a /api/edit_constraint…
            });
            li.append(checkbox, label, editButton);
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
                showNotification("warning", "Espera a que se terminen de procesar las restricciones antes de optimizar.");
                return;
            }
            const restricciones = document.querySelector('.restricciones-list').children;
            if (restricciones.length === 0) {
                showNotification("warning", "Por favor ingresa al menos una restricción antes de optimizar.");
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

                        showNotification("success", "Optimización completada.");
                    } else {
                        resultDiv.innerText = data.solution;
                        showNotification("success", "Resultado de la optimización disponible.");
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showNotification("error", "Error al contactar con la API.");
                    document.getElementById('optimization-result').innerText = "Error al contactar con la API.";
                });
        });
    }

    if (contextInput) contextInput.focus();
    const constraintInput = document.getElementById('constraint');
    if (constraintInput) constraintInput.focus();
});