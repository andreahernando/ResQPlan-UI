document.addEventListener("DOMContentLoaded", function () {
    let procesandoRestricciones = false;
    let originalText  = "";
    const okButton = document.getElementById("ok-button");
    const contextInput = document.getElementById("context");
    const wrapper      = document.querySelector(".textarea-with-button");
    const loadingOverlay = document.getElementById("loading-overlay");
    if (loadingOverlay) loadingOverlay.style.display = "none";

    // Panel y lista de restricciones detectadas
    const detectedPanel = document.getElementById('detected-panel');
    const detectedList  = document.getElementById('detected-constraints');

    // Toggle sidebar
    const sidebar   = document.getElementById("project-sidebar");
    const btnToggle = document.getElementById("toggle-sidebar");
    const btnClose  = document.getElementById("close-sidebar");

    btnToggle.addEventListener("click", () => {
      sidebar.classList.add("open");
    });

    btnClose.addEventListener("click", () => {
      sidebar.classList.remove("open");
    });

    // También puedes cerrar al hacer click fuera del sidebar:
    window.addEventListener("click", (e) => {
      if (!sidebar.contains(e.target) && !btnToggle.contains(e.target)) {
        sidebar.classList.remove("open");
      }
    });


    // ————— Gestión de Proyectos (localStorage) —————

    // Helpers para localStorage
    function listProjects() {
      return JSON.parse(localStorage.getItem("resqplan_projects") || "[]");
    }
    function saveProjectList(list) {
      localStorage.setItem("resqplan_projects", JSON.stringify(list));
    }
    function saveProjectData(project) {
      localStorage.setItem(`resqplan_project_${project.id}`, JSON.stringify(project));
    }
    function loadProjectData(id) {
      const raw = localStorage.getItem(`resqplan_project_${id}`);
      if (!raw) return {
        id,
        name: listProjects().find(p=>p.id===id)?.name||"",
        context: "",
        detectedConstraints: [],
        manualConstraints: [],
        variables: {}
      };
      return JSON.parse(raw);
    }

    function deleteProject(id) {
      localStorage.removeItem(`resqplan_project_${id}`);
      const list = listProjects().filter(p => p.id !== id);
      saveProjectList(list);
    }

    // Referencias a los elementos de la UI
    const saveProjectBtn = document.getElementById("save-project");
    const deleteProjectBtn = document.getElementById("delete-project");
    const newPrompt = document.getElementById("new-project-prompt");
    const newNameInput = document.getElementById("new-project-name");
    const createProjectBtn = document.getElementById("create-project");
    const cancelCreateBtn = document.getElementById("cancel-create");

    let currentProjectId = null;
    let currentProjectName = "";
    let currentGurobiModel    = null;

    // — Función auxiliar para parsear expresiones lineales —
    function parseLinExpr(exprStr, varsMap) {
      const expr = new Gurobi.LinExpr();
      exprStr
        .replace(/\s+/g, '')
        .split('+')
        .forEach(term => {
          const [coefStr, varName] = term.split('*');
          const coef = parseFloat(coefStr);
          if (varsMap[varName]) expr.addTerm(coef, varsMap[varName]);
        });
      return expr;
    }

    // — Reconstruir modelo Gurobi desde el estado serializado —
    function rebuildGurobiModel(state) {
      const model = new Gurobi.Model();
      const varsMap = {};

      // 1) Variables
      state.vars.forEach(vs => {
        const v = model.addVar(vs.lb, vs.ub, 0, vs.type, vs.name);
        varsMap[vs.name] = v;
      });

      // 2) Restricciones
      state.cons.forEach(cs => {
        const lin = parseLinExpr(cs.expr, varsMap);
        model.addConstr(lin, cs.sense, cs.rhs);
      });

      // 3) Objetivo
      const obj = parseLinExpr(state.objective, varsMap);
      model.setObjective(obj, state.sense);

      model.update();
      return model;
    }


    function refreshProjectOptions() {
      const projectList = document.getElementById("project-list");
      projectList.innerHTML = "";

      listProjects().forEach(p => {
        const li = document.createElement("li");
        li.textContent = p.name;
        li.dataset.id = p.id;
        li.addEventListener("click", () => {
          const proj = loadProjectData(p.id);
          if (!proj) return showToast("error", "Error cargando proyecto");

          // ——— Recarga de la UI —————————————————————————————————————
          currentProjectId   = proj.id;
          currentProjectName = proj.name;
          contextInput.value = proj.context || "";

          // restricciones detectadas
          detectedList.innerHTML = "";
          (proj.detectedConstraints || []).forEach(nl => {
            const item = document.createElement("li");
            item.textContent = nl;
            detectedList.appendChild(item);
          });
          detectedPanel.style.display = proj.detectedConstraints?.length ? "block" : "none";

          // restricciones manuales
          sessionStorage.setItem("restricciones", JSON.stringify(proj.manualConstraints || []));
          document.querySelector(".restricciones-list").innerHTML = "";
          cargarRestricciones();

          // variables
          sessionStorage.setItem("variables", JSON.stringify(proj.variables || {}));

          saveProjectBtn.disabled   = false;
          deleteProjectBtn.disabled = false;
          showToast("info", `Proyecto “${proj.name}” cargado`);
          sidebar.classList.remove("open");

          currentGurobiModel = rebuildGurobiModel(proj.gurobiState);
          window.currentGurobiModel = currentGurobiModel;
          showToast("success", `Modelo Gurobi de “${proj.name}” reconstruido`);


          // Restricciones
          proj.gurobiState.cons.forEach(cs => {
            const linExpr = parseLinExpr(cs.expr, varsMap);
            model.addConstr(linExpr, cs.sense, cs.rhs);
          });

          // Objetivo
          const objExpr = parseLinExpr(proj.gurobiState.objective, varsMap);
          model.setObjective(objExpr, proj.gurobiState.sense);

          // Actualizar modelo
          model.update();
          currentGurobiModel = model;
          window.currentGurobiModel = model;
          showToast("success", `Modelo Gurobi de “${proj.name}” reconstruido`);
        });

        projectList.appendChild(li);
      });
    }

    // Inicializar opciones
    refreshProjectOptions();

    document.getElementById("new-project-btn").addEventListener("click", () => {
      newPrompt.style.display = "block";
    });

    createProjectBtn.addEventListener("click", () => {
      const name = newNameInput.value.trim();
      if (!name) return showToast("warning", "Ponle un nombre al proyecto");

      const id = Date.now().toString();
      const list = listProjects();
      list.push({ id, name });
      saveProjectList(list);

      saveProjectData({
        id,
        name,
        context: "",
        detectedConstraints: [],
        manualConstraints: [],
        variables: {},
        gurobiState: { vars: [], cons: [], objective: "0", sense: 1 }
      });

      // Limpia UI…
      currentProjectId   = id;
      currentProjectName = name;
      contextInput.value = "";
      detectedList.innerHTML = "";
      document.querySelector(".restricciones-list").innerHTML = "";
      sessionStorage.clear();
      newPrompt.style.display = "none";

      // 1) Primero refresca la lista y abre el panel
      refreshProjectOptions();
      sidebar.classList.add("open");
      showToast("success", `Proyecto “${name}” creado`);

      // 2) Después, inicializa el modelo Gurobi (fuera del hilo crítico)
      setTimeout(() => {
        currentGurobiModel = new Gurobi.Model();
        // si necesitas notificar:
        showToast("info", `Modelo Gurobi inicializado para “${name}”`);
      }, 0);

      // 3) Habilita botones
      saveProjectBtn.disabled   = false;
      deleteProjectBtn.disabled = false;
    });



    cancelCreateBtn.addEventListener("click", () => {
      newPrompt.style.display = "none";
    });

    saveProjectBtn.addEventListener("click", () => {
      if (!currentProjectId) {
        showToast("warning", "No hay proyecto activo");
        return;
      }

      // Carga el proyecto anterior para recuperar su gurobiState si no hay modelo vivo
      const existing = loadProjectData(currentProjectId);
      let gurobiState;

      if (currentGurobiModel) {
        // Serializamos el estado actual del modelo
        gurobiState = {
          vars: currentGurobiModel.getVars().map(v => ({
            name: v.varName, lb: v.lb, ub: v.ub, type: v.vType
          })),
          cons: currentGurobiModel.getConstrs().map(c => ({
            expr: currentGurobiModel.getRow(c).toString(),
            sense: c.sense, rhs: c.rhs
          })),
          objective: currentGurobiModel.getObjective().toString(),
          sense: currentGurobiModel.get(GRB.IntAttr.ModelSense)
        };
      } else if (existing && existing.gurobiState) {
        // Sin modelo nuevo, reutilizamos el anterior
        gurobiState = existing.gurobiState;
      } else {
        // Ni antiguo ni nuevo: creamos un estado vacío
        gurobiState = { vars: [], cons: [], objective: "0", sense: 1 };
      }

      // Ahora guardamos TODO el proyecto
      const proj = {
        id: currentProjectId,
        name: currentProjectName,
        context: contextInput.value,
        detectedConstraints: Array.from(detectedList.children).map(li => li.textContent),
        manualConstraints: JSON.parse(sessionStorage.getItem("restricciones") || "[]"),
        variables: JSON.parse(sessionStorage.getItem("variables") || "{}"),
        gurobiState
      };

      saveProjectData(proj);
      showToast("success", `Proyecto “${proj.name}” guardado`);

      // (Opcional) refrescar la lista para mantener todo sincronizado
      refreshProjectOptions();
    });


    deleteProjectBtn.addEventListener("click", () => {
      if (!currentProjectId) return showToast("warning", "No hay proyecto activo");
      if (!confirm(`¿Borrar el proyecto “${currentProjectName}”?`)) return;

      deleteProject(currentProjectId);
      refreshProjectOptions();

      currentProjectId = null;
      currentProjectName = "";

      contextInput.value = "";
      detectedList.innerHTML = "";
      document.querySelector(".restricciones-list").innerHTML = "";
      sessionStorage.clear();

      saveProjectBtn.disabled = true;
      deleteProjectBtn.disabled = true;

      showToast("warning", `Proyecto eliminado`);
    });


    let btnContainer = wrapper.querySelector('.context-btns');
    if (!btnContainer) {
      btnContainer = document.createElement('div');
      btnContainer.className = 'context-btns';
      wrapper.appendChild(btnContainer);
    }

    function showToast(type, message, duration = 3000) {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      const icon = document.createElement('span');
      icon.className = 'icon';
      if (type === 'success') icon.textContent = '✔️';
      else if (type === 'error') icon.textContent = '❌';
      else if (type === 'warning') icon.textContent = '⚠️';
      const msg = document.createElement('div');
      msg.className = 'message';
      msg.textContent = message;
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', 'Cerrar');
      closeBtn.addEventListener('click', () => hideToast(toast));
      toast.append(icon, msg, closeBtn);
      container.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('show'));
      const hideTimeout = setTimeout(() => hideToast(toast), duration);
      function hideToast(el) {
        clearTimeout(hideTimeout);
        el.classList.remove('show');
        el.classList.add('hide');
        el.addEventListener('transitionend', () => el.remove(), { once: true });
      }
    }


    function mostrarPantallaCarga() {
        if (loadingOverlay) loadingOverlay.style.display = "flex";
    }

    function continuar() {
        const ctx = contextInput.value.trim();
        if (!ctx) {
          showToast("warning", "Por favor ingresa algún contexto.");
          return;
        }

        // ── Reinicio de UI previa ──
        ['edit-context', 'summary-context', 'cancel-edit', 'ok-button'].forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.remove();
        });
        // Oculta sección de detecciones y lista limpia
        if (detectedPanel) {
          detectedPanel.style.display = 'none';
          detectedList.innerHTML = '';
        }

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
          if (loadingOverlay) loadingOverlay.style.display = "none";
          if (!ok) throw new Error(p.error || `HTTP ${status}`);

          // 1) Guardar variables
          sessionStorage.setItem("variables", JSON.stringify(p.result));

          // 2) Mostrar restricciones detectadas (nuevo)
          if (p.result.detected_constraints && p.result.detected_constraints.length) {
            p.result.detected_constraints.forEach(nl => {
              const li = document.createElement('li');
              li.textContent = nl;
              detectedList.appendChild(li);
            });
            detectedPanel.style.display = 'block';
          }

          // 3) Desactivar textarea
          contextInput.disabled = true;
          originalText = ctx;

          // 4) Crear botones Editar / Resumen
          const btnEdit    = document.createElement("button");
          btnEdit.type     = "button";
          btnEdit.id       = "edit-context";
          btnEdit.textContent = "✏️ Editar";
          const btnSummary = document.createElement("button");
          btnSummary.type  = "button";
          btnSummary.id    = "summary-context";
          btnSummary.textContent = "📄 Ver resumen";
          btnContainer.append(btnEdit, btnSummary);

          // 5) Mostrar panel de restricciones manuales
          const restrSection = document.querySelector(".container");
          if (restrSection) restrSection.style.display = "flex";
          showToast("success", "Contexto procesado correctamente.");

          // ✏️ Editar
          btnEdit.addEventListener("click", () => {
            btnEdit.remove();
            btnSummary.remove();
            contextInput.disabled = false;
            contextInput.focus();
            const btnSave = document.createElement("button");
            btnSave.type = "button";
            btnSave.id = "ok-button";
            btnSave.innerHTML = '<i class="fas fa-arrow-up"></i> Subir';
            const btnCancel = document.createElement("button");
            btnCancel.type = "button";
            btnCancel.id = "cancel-edit";
            btnCancel.textContent = "✖️ Cancelar";
            btnContainer.append(btnSave, btnCancel);
            btnCancel.addEventListener("click", () => {
              contextInput.value    = originalText;
              contextInput.disabled = true;
              btnSave.remove(); btnCancel.remove();
              btnContainer.append(btnEdit, btnSummary);
            });
            btnSave.addEventListener("click", () => {
              sessionStorage.removeItem("variables");
              sessionStorage.removeItem("restricciones");
              document.querySelectorAll(".restricciones-list .restriccion-item")
                      .forEach(li => li.remove());
              guardarRestricciones();
              continuar();
            });
          });

          // 📄 Ver resumen
          btnSummary.addEventListener("click", () => {
            const data = JSON.parse(sessionStorage.getItem("variables") || "{}");
            const { resources = {}, variables = {} } = data;
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
            const popup = document.getElementById("summary-popup");
            const content = document.getElementById("summary-popup-content");
            content.innerHTML = "";
            content.appendChild(table);
            popup.style.display = "flex";
            const closeBtn = popup.querySelector(".close-summary-popup");
            closeBtn.onclick = () => popup.style.display = "none";
            window.addEventListener("click", e => {
              if (e.target === popup) popup.style.display = "none";
            }, { once: true });
          });

        })
        .catch(err => {
          if (loadingOverlay) loadingOverlay.style.display = "none";
          console.error(err);
          showToast("error", err.message);
        });
    }

    if (okButton) okButton.addEventListener("click", continuar);




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


    const optimizeButton = document.getElementById('optimize-button');
    if (optimizeButton) {
      optimizeButton.addEventListener('click', async function () {
        if (procesandoRestricciones) {
          showToast("warning", "Espera a que terminen de procesar las restricciones antes de optimizar.");
          return;
        }
        const items = document.querySelectorAll('.restriccion-item');
        if (items.length === 0) {
          showToast("warning", "Por favor ingresa al menos una restricción antes de optimizar.");
          return;
        }

        mostrarPantallaCarga();

        // Preparamos el array de restricciones activas
        const activeConstraints = Array.from(items)
          .filter(li => li.querySelector('.chk-rest').checked)
          .map(li => li.querySelector('label').innerText);

        try {
          const res = await fetch('/api/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active_constraints: activeConstraints })
          });
          const data = await res.json();

          // 1) Ocultamos overlay
          loadingOverlay.style.display = "none";

          // 2) Guardamos resultado en sessionStorage
          sessionStorage.setItem('optimizationResult', JSON.stringify(data));

          // 3) Redirigimos a la página de resultados
          window.location.href = '/results';
        } catch (error) {
          loadingOverlay.style.display = "none";
          console.error(error);
          showToast("error", "Error al contactar con la API.");
        }
      });
    }


    if (contextInput) contextInput.focus();
    const constraintInput = document.getElementById('constraint');
    if (constraintInput) constraintInput.focus();
});