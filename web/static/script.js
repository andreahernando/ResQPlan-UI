document.addEventListener("DOMContentLoaded", function () {
    const okButton = document.getElementById('ok-button');
    const contextInput = document.getElementById('context');
    const loadingOverlay = document.getElementById('loading-overlay');

    // Función para mostrar notificaciones
    function showNotification(type, message) {
        const notification = document.createElement('div');
        notification.classList.add('notification', 'show', type);

        const icon = document.createElement('span');
        icon.classList.add('icon');
        if (type === 'success') icon.textContent = '✔️';
        else if (type === 'error') icon.textContent = '❌';
        else if (type === 'warning') icon.textContent = '⚠️';

        const text = document.createElement('span');
        text.textContent = message;

        notification.appendChild(icon);
        notification.appendChild(text);
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Ocultar la pantalla de carga al iniciar
    if (loadingOverlay) loadingOverlay.style.display = "none";

    function mostrarPantallaCarga() {
        loadingOverlay.style.display = "flex";
    }

    function continuar() {
        const context = contextInput.value.trim();
        if (!context) {
            showNotification("warning", "Por favor ingresa algún contexto.");
            return;
        }

        mostrarPantallaCarga();
        sessionStorage.setItem("cargando", "true");

        fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input_data: context })
        })
        .then(response => response.json())
        .then(data => {
            sessionStorage.setItem("variables", JSON.stringify(data.result));
            window.location.href = "/restricciones";
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification("error", "Error al contactar con la API.");
            sessionStorage.setItem("cargando", "error");
        });

        //setTimeout(() => {
        //    window.location.href = "/restricciones";
        //}, 5000);
    }

    if (okButton) {
        okButton.addEventListener("click", continuar);
    }

    if (contextInput) {
        contextInput.addEventListener("keypress", function (event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                continuar();
            }
        });
    }

    const convertButton = document.getElementById('convert-button');
    if (convertButton) {
        convertButton.addEventListener('click', function () {
        const constraint = document.getElementById('constraint').value.trim();
        if (!constraint) {
            showNotification("warning", "Por favor ingresa una restricción.");
            return;
        }

        async function intentarConvertir(constraint, intentos = 3) {
            try {
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ constraint })
                });

                if (!response.ok) {
                    throw new Error("Error en la respuesta del servidor");
                }

                const data = await response.json();

                // Solo si fue exitoso, la añadimos
                const lista = document.querySelector('.restricciones-list');
                const item = document.createElement('p');
                item.innerText = constraint;
                lista.appendChild(item);

                showNotification("success", "Restricción añadida correctamente.");
            } catch (error) {
                if (intentos > 1) {
                    console.warn(`Intento fallido. Reintentando... (${4 - intentos}º intento fallido)`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // espera 1 segundo antes de reintentar
                    intentarConvertir(constraint, intentos - 1);
                } else {
                    console.error("Fallo tras varios intentos:", error);
                    showNotification("error", "No se pudo añadir la restricción. Revisa el contexto o inténtalo de nuevo.");
                    document.getElementById('constraint-result').innerText = "Error al contactar con la API.";
                }
            }
        }

        intentarConvertir(constraint);
});

    }

    // Modal de resultados
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

    // Función para parsear la clave de solución y evitar que aparezcan "NA" en la visualización
    function parseKey(key) {
        // Expresión regular que extrae tres números (empleado, día y turno) ignorando espacios y paréntesis
        const regex = /\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)?/;
        const match = key.match(regex);
        if (match) {
            return [Number(match[1]), Number(match[2]), Number(match[3])];
        } else {
            return null; // Si la clave no se puede parsear, se ignora
        }
    }

    const optimizeButton = document.getElementById('optimize-button');
    if (optimizeButton) {
        optimizeButton.addEventListener('click', function () {
            const restricciones = document.querySelector('.restricciones-list').children;
            if (restricciones.length === 0) {
                showNotification("warning", "Por favor ingresa al menos una restricción antes de optimizar.");
                return;
            }

            fetch('/api/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            .then(response => response.json())
            .then(data => {
                showResultadoModal();
                const resultDiv = document.getElementById('optimization-result');
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '';

                if (typeof data.solution === 'object') {
                    const resumen = {};

                    for (const [key, value] of Object.entries(data.solution)) {
                        if (value > 0.5) {
                            const parsed = parseKey(key);
                            if (!parsed) continue; // Ignorar claves mal formateadas
                            const [e, d, t] = parsed;
                            if (!resumen[t]) resumen[t] = {};
                            if (!resumen[t][d]) resumen[t][d] = [];
                            resumen[t][d].push(e);
                        }
                    }

                    // ✅ CORREGIDO: determinar valores máximos seguros
                    const turnos = Math.max(...Object.keys(resumen).map(Number), 0) + 1;
                    const dias = Math.max(
                        ...Object.values(resumen).flatMap(obj => Object.keys(obj).map(Number)),
                        0
                    ) + 1;

                    // ✅ CORREGIDO: asegurar que resumen[t][d] siempre existe
                    for (let t = 0; t < turnos; t++) {
                        if (!resumen[t]) resumen[t] = {};
                        for (let d = 0; d < dias; d++) {
                            if (!resumen[t][d]) resumen[t][d] = [];
                        }
                    }

                    const table = document.createElement('table');
                    table.classList.add('resultado-grid');
                    table.innerHTML = '<thead><tr><th>Turno \\ Día</th>' +
                        Array.from({ length: dias }, (_, d) => `<th>Día ${d + 1}</th>`).join('') +
                        '</tr></thead><tbody>';

                    for (let t = 0; t < turnos; t++) {
                        const row = document.createElement('tr');
                        row.innerHTML = `<td><b>Turno ${t}</b></td>`;

                        for (let d = 0; d < dias; d++) {
                            const entidades = resumen[t][d];
                            const texto = entidades.length > 0 ? entidades.join(' / ') : 'Descanso';
                            const color = texto === 'Descanso' ? '#f4cccc' : '#d9ead3';
                            row.innerHTML += `<td style="background:${color};text-align:center">${texto}</td>`;
                        }

                        table.appendChild(row);
                    }

                    table.innerHTML += '</tbody>';
                    resultDiv.innerHTML = '';
                    resultDiv.appendChild(table);
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
