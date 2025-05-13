document.addEventListener("DOMContentLoaded", function () {
  let procesandoRestricciones = false;
  let originalText = "";
  const okButton = document.getElementById("ok-button");
  const contextInput = document.getElementById("context");
  const wrapper = document.querySelector(".textarea-with-button");
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) loadingOverlay.style.display = "none";

  // Panel y lista de restricciones detectadas
  const detectedPanel = document.getElementById('detected-panel');
  const detectedList = document.getElementById('detected-constraints');

  // Toggle sidebar
  const sidebar = document.getElementById("project-sidebar");
  const btnToggle = document.getElementById("toggle-sidebar");
  const btnClose = document.getElementById("close-sidebar");
  btnToggle.addEventListener("click", () => sidebar.classList.add("open"));
  btnClose.addEventListener("click", () => sidebar.classList.remove("open"));
  window.addEventListener("click", (e) => {
    if (!sidebar.contains(e.target) && !btnToggle.contains(e.target)) {
      sidebar.classList.remove("open");
    }
  });

  // Referencias a los elementos de la UI
  const deleteProjectBtn = document.getElementById("delete-project");
  // Oculta el botón global
  if (deleteProjectBtn) deleteProjectBtn.style.display = "none";
  const newPrompt = document.getElementById("new-project-prompt");
  const newNameInput = document.getElementById("new-project-name");
  const createProjectBtn = document.getElementById("create-project");
  const cancelCreateBtn = document.getElementById("cancel-create");
  const projectList = document.getElementById("project-list");

  const contextWarning = document.getElementById('context-warning');


  let currentProjectId = null;
  let currentProjectName = "";
  let currentGurobiModel = null;

  renderContextControls();

  // — Función auxiliar para parsear expresiones lineales —
  function parseLinExpr(exprStr, varsMap) {
    const expr = new Gurobi.LinExpr();
    exprStr.replace(/\s+/g, '').split('+').forEach(term => {
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


  // ——— API calls ———
  async function listProjects() {
    const res = await fetch("/api/projects");
    const { projects } = await res.json();
    return projects;
  }

  async function createProject(name) {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        context: "",
        detectedConstraints: [],
        manualConstraints: [],
        variables: {},
        gurobiState: { vars: [], cons: [], objective: "0", sense: 1 }
      })
    });
    return res.json();
  }

  async function loadProject(id) {
    const res = await fetch(`/api/projects/${id}`);
    return res.json();
  }

  async function updateProject(proj) {
    await fetch(`/api/projects/${proj.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proj)
    });
  }

  async function deleteProject(id) {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
  }

  // ——— Refrescar la lista de proyectos en la UI ———
  async function refreshProjectOptions() {
  const prevNote = document.getElementById('relaxed-note');
  if (prevNote) prevNote.remove();

  if (contextWarning) {
    contextWarning.style.visibility = 'hidden';
  }
  // Oculta el panel de restricciones detectadas
  if (detectedPanel) {
    detectedPanel.style.display = 'none';
  }
    projectList.innerHTML = "";
    const projects = await listProjects();
    projects.forEach(p => {
      const li = document.createElement("li");
      li.textContent = p.name;
      li.dataset.id = p.id;

      // Crear el botón de borrar con un icono
      const deleteBtn = document.createElement("button");
      deleteBtn.classList.add("delete-btn");
      deleteBtn.innerHTML = `<i class="fas fa-trash-alt"></i>`; // Icono de papelera
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation(); // Evita que el clic se propague al li
        if (!confirm(`¿Borrar el proyecto “${p.name}”?`)) return;
        await deleteProject(p.id);
        showToast("warning", `Proyecto “${p.name}” eliminado`);
        await refreshProjectOptions(); // Refrescar la lista después de borrar
      });

      // Añadir el botón de borrar al li
      li.appendChild(deleteBtn);

      li.addEventListener("click", async () => {
        const prevNote = document.getElementById('relaxed-note');
        if (prevNote) prevNote.remove()
        if (contextWarning) contextWarning.style.visibility = 'hidden';
        if (detectedPanel) detectedPanel.style.display = 'none';
        if (currentProjectId) {
          try {
            await autoSaveProject();
          } catch (err) {
            console.warn("Guardado automático fallido (pero seguimos):", err);
          }
        }

        document.querySelectorAll("#project-list li").forEach(el => el.classList.remove("active"));
        li.classList.add("active");

        const proj = await loadProject(p.id);
        if (proj.error) return showToast("error", "Error cargando proyecto");

        // ——— Recarga de la UI —————————————————————————————————————
        currentProjectId = proj.id;
        currentProjectName = proj.name;
        contextInput.innerText = proj.context || "";
        renderContextControls();
        if (window.currentGurobiModel) {
          showToast("success", `Modelo Gurobi de “${proj.name}” reconstruido`);
        }


        detectedList.innerHTML = "";
        (proj.detectedConstraints || []).forEach(nl => {
          const item = document.createElement("li");
          item.textContent = nl;
          detectedList.appendChild(item);
        });
        detectedPanel.style.display = proj.detectedConstraints?.length ? "block" : "none";

        sessionStorage.setItem("restricciones", JSON.stringify(proj.manualConstraints || []));
        document.querySelector(".restricciones-list").innerHTML = "";
        cargarRestricciones();

        sessionStorage.setItem("variables", JSON.stringify(proj.variables || {}));

        deleteProjectBtn.disabled = false;
        showToast("success", `Proyecto “${proj.name}” cargado`);
        sidebar.classList.remove("open");

        currentGurobiModel = rebuildGurobiModel(proj.gurobiState);
        window.currentGurobiModel = currentGurobiModel;
        showToast("success", `Modelo Gurobi de “${proj.name}” reconstruido`);
      });

      projectList.appendChild(li);
    });
  }

  async function autoSaveProject() {
    if (!currentProjectId) return;

    const proje = {
      id: currentProjectId,
      name: currentProjectName,
      context: contextInput.innerText,
      detectedConstraints: Array.from(detectedList.children).map(li => li.textContent),
      manualConstraints: JSON.parse(sessionStorage.getItem("restricciones") || "[]"),
      variables: JSON.parse(sessionStorage.getItem("variables") || "{}"),
      gurobiState: currentGurobiModel
        ? {
            vars: currentGurobiModel.getVars().map(v => ({
              name: v.varName,
              lb: v.lb,
              ub: v.ub,
              type: v.vType
            })),
            cons: currentGurobiModel.getConstrs().map(c => ({
              expr: currentGurobiModel.getRow(c).toString(),
              sense: c.sense,
              rhs: c.rhs
            })),
            objective: currentGurobiModel.getObjective().toString(),
            sense: currentGurobiModel.get(gp.GRB.IntAttr.ModelSense)
          }
        : { vars: [], cons: [], objective: "0", sense: 1 }
    };

    await updateProject(proje);
    console.log(`Guardado automático del proyecto “${currentProjectName}”`);
  }


  // ——— Botones y eventos ———
  document.getElementById("new-project-btn").addEventListener("click", () => {
    newPrompt.style.display = "block";
  });

  createProjectBtn.addEventListener("click", async () => {
    const name = newNameInput.value.trim();
    if (!name) return showToast("warning", "Ponle un nombre al proyecto");
    const proj = await createProject(name);
    currentProjectId = proj.id;
    currentProjectName = proj.name;
    newPrompt.style.display = "none";
    // Limpiar estado previo
    contextInput.innerText = "";
    renderContextControls();
    detectedList.innerHTML = "";
    document.querySelector(".restricciones-list").innerHTML = "";
    detectedPanel.style.display = "none";
    sessionStorage.setItem("restricciones", JSON.stringify([]));
    sessionStorage.setItem("variables", JSON.stringify({}));

    await refreshProjectOptions();
    showToast("success", `Proyecto “${proj.name}” creado`);
  });

  cancelCreateBtn.addEventListener("click", () => {
    newPrompt.style.display = "none";
  });


  deleteProjectBtn.addEventListener("click", async () => {
    if (!currentProjectId) return showToast("warning", "No hay proyecto activo");
    if (!confirm(`¿Borrar el proyecto “${currentProjectName}”?`)) return;
    await deleteProject(currentProjectId);
    showToast("warning", `Proyecto eliminado`);
    currentProjectId = null;
    await refreshProjectOptions();
  });

  // ——— Inicializar ———
  refreshProjectOptions();




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
        const ctx = contextInput.innerText.trim();
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
        .then(async res => {
          if (loadingOverlay) loadingOverlay.style.display = "none";

          let data;
          try {
            data = await res.json();
          } catch (_) {
            throw new Error(`Error al parsear JSON de respuesta`);
          }

          // si hubo error HTTP, extraemos el mensaje y abortamos
          if (!res.ok) {
            // tu backend devuelve { message: "…"} o { error: "…"}
            const errMsg = data.message ?? data.error ?? `Error HTTP ${res.status}`;
            throw new Error(errMsg);
          }

          // éxito: devolvemos el JSON completo
          return data;
        })

        .then(p => {

          if (loadingOverlay) loadingOverlay.style.display = "none";

          // 1) Guardar variables
          sessionStorage.setItem("variables", JSON.stringify(p.result));


          // Resaltar restricciones detectadas inline en el contexto
          if (p.result.detected_constraints && p.result.detected_constraints.length) {
            contextWarning.style.visibility = 'visible';

            // 1) Coger el texto plano original
            let html = contextInput.innerText;

            // 2) Para cada NL detectada, escapamos y envolvemos en <mark>
            p.result.detected_constraints.forEach(nl => {
              const esc = nl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const regex = new RegExp(`(${esc})`, 'g');
              html = html.replace(regex, `<mark class="highlight">$1</mark>`);
            });

            // 3) Inyectar el HTML con los <mark> dentro del div editable
            contextInput.innerHTML = html;

            // 4) Ocultamos el panel de lista porque ya no lo usamos
            detectedPanel.style.display = 'none';
          } else {
            // Ocultar el warning si no hay restricciones
            contextWarning.style.visibility = 'hidden';
          }

          originalText = ctx;
          contextInput.setAttribute('contenteditable', 'false');

          // 4) Mostramos el panel de restricciones manuales
          const restrSection = document.querySelector(".container");
          if (restrSection) restrSection.style.display = "flex";

          showToast("success", "Contexto procesado correctamente.");

          // 6) Y solo invocamos renderizado de botones + bloqueo
          renderContextControls();


        })
        .catch(err => {
          if (loadingOverlay) loadingOverlay.style.display = "none";
          console.error(err);
          showToast("error", err.message);

          const btnSave = document.createElement("button");
          btnSave.type = "button";
          btnSave.id   = "ok-button";
          btnSave.innerHTML = '<i class="fas fa-arrow-up"></i> Subir';
          btnContainer.append(btnSave);

          // Vuelve a enlazar el listener
          btnSave.addEventListener("click", continuar);
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

      // Botón 🗑️ (Eliminar)
      const deleteButton = document.createElement("button");
      deleteButton.textContent = "🗑️";
      deleteButton.classList.add("delete-button");
      deleteButton.title = "Eliminar";

      // Botón </> (Mostrar código)
      const viewButton = document.createElement("button");
      viewButton.textContent = "</>";
      viewButton.classList.add("view-button");
      viewButton.title = "Ver código generado";



      controlsWrapper.appendChild(editButton);
      controlsWrapper.appendChild(deleteButton);
      controlsWrapper.appendChild(viewButton);
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

      // Acción eliminar
    deleteButton.addEventListener("click", async () => {
      const confirmDelete = confirm("¿Estás seguro de que quieres eliminar esta restricción?");
      if (!confirmDelete) return;

      try {
        const res = await fetch("/api/delete_constraint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nl: label.textContent })
        });
        const result = await res.json();

        if (res.ok && result.success) {
          // 1) Elimino el <li> de la restricción
          li.remove();
          guardarRestricciones();
          showToast("success", "Restricción eliminada correctamente.");

          // 2) Compruebo si queda alguna relajada
          const anyRelaxed = !!document.querySelector(".restriccion-item.relaxed-highlight");

          // 3) Si no queda ninguna, quito también la nota de warning
          if (!anyRelaxed) {
            const note = document.getElementById("relaxed-note");
            if (note) note.remove();
          }
        } else {
          throw new Error(result.error || "Error del servidor");
        }
      } catch (e) {
        showToast("error", "Error al eliminar restricción.");
        console.error(e);
      }
    });


      viewButton.addEventListener("click", async (e) => {
        const constraintText = label.textContent;

        try {
          const res = await fetch("/api/view_constraint", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nl: constraintText })
          });

          const result = await res.json();

          if (res.ok && result.code) {
            // Quitar popups anteriores
            document.querySelectorAll(".code-popup").forEach(p => p.remove());

            const popup = document.createElement("div");
            popup.classList.add("code-popup");
            popup.innerHTML = `
              <button class="close-popup">&times;</button>
              <pre>${result.code}</pre>
            `;
            document.body.appendChild(popup);

            // Dimensiones
            const buttonRect = e.target.getBoundingClientRect();
            const popupWidth = popup.offsetWidth;
            const spacing = 8;

            // Encontrar contenedor panel
            const panel = e.target.closest(".panel");
            const panelRect = panel.getBoundingClientRect();

            // Coordenadas base
            let left = buttonRect.left + window.scrollX - popupWidth - spacing;
            let top = buttonRect.top + window.scrollY;

            // Evitar que se salga del panel por la izquierda
            const minLeft = panelRect.left + window.scrollX + 10;
            if (left < minLeft) left = minLeft;

            popup.style.position = "absolute";
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;

            // Botón cerrar
            popup.querySelector(".close-popup").addEventListener("click", () => {
              popup.remove();
            });

            // Cerrar si se hace clic fuera
            const closeOnOutsideClick = (evt) => {
              if (!popup.contains(evt.target) && evt.target !== viewButton) {
                popup.remove();
                document.removeEventListener("click", closeOnOutsideClick);
              }
            };
            setTimeout(() => document.addEventListener("click", closeOnOutsideClick), 0);
          } else {
            throw new Error(result.error || "Error al obtener código");
          }
        } catch (e) {
          showToast("error", "No se pudo mostrar el código.");
          console.error(e);
        }
      });

    }

    async function intentarConvertir(constraint, intentos = 3) {
      try {
        const res = await fetch("/api/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ constraint }),
        });

        // 1) Parseamos siempre el JSON de respuesta
        const data = await res.json().catch(() => {
          throw new Error("Respuesta no válida del servidor");
        });

        // 2) Si la respuesta NO es 2xx, lanzamos con el mensaje de error
        if (!res.ok) {
          const msg = data.message ?? `Error HTTP ${res.status}`;
          throw new Error(msg);
        }

        // 3) Si la restricción no es válida según el backend, lo notificamos y salimos
        if (data.valid === false) {
          const msg = data.message ?? "La restricción no aplica al contexto proporcionado.";
          showToast("error", msg);
          const resDiv = document.getElementById("constraint-result");
          if (resDiv) resDiv.innerText = msg;
          return;
        }

        // 4) ¡La restricción es válida! → añadimos a la lista
        const lista = document.querySelector(".restricciones-list");
        if (!lista) return;

        // Evitar duplicados
        if (
          Array.from(lista.children).some(
            li => li.querySelector("label")?.innerText === constraint
          )
        ) {
          return;
        }

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
        const msg = err.message ?? String(err);

        // Errores de fetch o status ≠ 2xx
        showToast("error", msg);
        const resDiv = document.getElementById("constraint-result");
        if (resDiv) resDiv.innerText = msg;

        // Reintentos automáticos si es un error distinto de “no aplica”
        if (intentos > 1 && !["La restricción no aplica al contexto proporcionado."].includes(msg)) {
          await new Promise(r => setTimeout(r, 1000));
          return intentarConvertir(constraint, intentos - 1);
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

      });
    }

    function renderContextControls() {
      const wrapper      = document.querySelector('.textarea-with-button');
      const btnContainer = wrapper.querySelector('.context-btns') || (() => {
        const div = document.createElement('div');
        div.className = 'context-btns';
        wrapper.appendChild(div);
        return div;
      })();

      // 1) Limpio el contenedor de botones
      btnContainer.innerHTML = '';

      // 2) Compruebo si hay texto en el contexto
      const hasCtx = contextInput.innerText.trim().length > 0;

      // 3) Habilito o deshabilito el textarea según corresponda
      if (hasCtx) {
        contextInput.setAttribute('contenteditable', 'false');
      } else {
        contextInput.setAttribute('contenteditable', 'true');
      }

      if (!hasCtx) {
        // — Sólo botón “Subir” —
        let okBtn = document.getElementById('ok-button');
        if (okBtn) {
          okBtn.remove();
        }
        okBtn = document.createElement('button');
        okBtn.type      = 'button';
        okBtn.id        = 'ok-button';
        okBtn.innerHTML = '<i class="fas fa-arrow-up"></i> Subir';
        okBtn.addEventListener('click', continuar);
        btnContainer.appendChild(okBtn);

      } else {
        // — Botones “Editar” y “Ver resumen” —
        const btnEdit    = document.createElement('button');
        btnEdit.type     = 'button';
        btnEdit.id       = 'edit-context';
        btnEdit.textContent = '✏️ Editar';

        const btnSummary = document.createElement('button');
        btnSummary.type  = 'button';
        btnSummary.id    = 'summary-context';
        btnSummary.textContent = '📄 Ver resumen';

        btnContainer.append(btnEdit, btnSummary);

        // Callback para “Editar”
        btnEdit.addEventListener('click', () => {
          contextInput.setAttribute('contenteditable', 'true');
          contextInput.focus();

          contextInput.disabled = false;
          contextInput.focus();
          btnContainer.innerHTML = '';

          const btnSave = document.createElement('button');
          btnSave.type      = 'button';
          btnSave.id        = 'ok-button';
          btnSave.innerHTML = '<i class="fas fa-arrow-up"></i> Subir';

          const btnCancel = document.createElement('button');
          btnCancel.type = 'button';
          btnCancel.id   = 'cancel-edit';
          btnCancel.textContent = '✖️ Cancelar';

          btnContainer.append(btnSave, btnCancel);

          // Cancelar edición
          btnCancel.addEventListener('click', () => {
            contextInput.innerText    = originalText;
            contextInput.disabled     = true;
            renderContextControls();
          });

          // Guardar edición
          btnSave.addEventListener('click', () => {
            sessionStorage.removeItem('variables');
            sessionStorage.removeItem('restricciones');
            document.querySelectorAll('.restricciones-list .restriccion-item')
                    .forEach(li => li.remove());
            guardarRestricciones();
            continuar();
          });
        });

        // Callback para “Ver resumen”
        btnSummary.addEventListener('click', () => {
          const data = JSON.parse(sessionStorage.getItem('variables') || '{}');
          const { resources = {}, variables = {} } = data;

          const table = document.createElement('table');
          table.style.width = '100%';
          table.style.borderCollapse = 'collapse';
          const thStyle = 'border:1px solid #ccc;padding:6px;background:#e9f9ff;text-align:left;';
          const tdStyle = 'border:1px solid #ccc;padding:6px;';

          const thead = document.createElement('thead');
          thead.innerHTML = `
            <tr>
              <th style="${thStyle}">Clave</th>
              <th style="${thStyle}">Valores</th>
            </tr>`;
          table.appendChild(thead);

          const tbody = document.createElement('tbody');
          [resources, variables].forEach(obj => {
            Object.entries(obj).forEach(([key, vals]) => {
              const tr = document.createElement('tr');
              tr.innerHTML = `
                <td style="${tdStyle}">${key}</td>
                <td style="${tdStyle}">${
                  Array.isArray(vals) ? vals.join(', ') : vals
                }</td>`;
              tbody.appendChild(tr);
            });
          });
          table.appendChild(tbody);

          const popup = document.getElementById('summary-popup');
          const content = document.getElementById('summary-popup-content');
          content.innerHTML = '';
          content.appendChild(table);
          popup.style.display = 'flex';

          const closeBtn = popup.querySelector('.close-summary-popup');
          closeBtn.onclick = () => popup.style.display = 'none';
          window.addEventListener('click', e => {
            if (e.target === popup) popup.style.display = 'none';
          }, { once: true });
        });
      }
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
          sessionStorage.setItem('relaxedConstraints', JSON.stringify(data.relaxed_constraints || []));

          sessionStorage.setItem('savedContext', contextInput.innerText);

          // 3) Redirigimos a la página de resultados
          window.location.href = '/results';
        } catch (error) {
          loadingOverlay.style.display = "none";
          console.error(error);
          showToast("error", "Error al contactar con la API.");
        }
      });
    }


    window.addEventListener("beforeunload", async (e) => {
      if (currentProjectId) await autoSaveProject();
    });
    if (contextInput) contextInput.focus();

    // ——— Al volver con history.back(), restaurar contexto, reaplicar highlight y mostrar aviso ———
    window.addEventListener('pageshow', () => {
      // 0) Restaurar contexto si lo teníamos guardado
      const contextInput = document.getElementById('context');
      const savedCtx = sessionStorage.getItem('savedContext');
      if (savedCtx !== null && contextInput) {
        contextInput.innerText = savedCtx;
        contextInput.setAttribute('contenteditable', 'false');
        renderContextControls();
      }

      // 1) Reaplicar highlight de restricciones relajadas
      const relaxed = JSON.parse(sessionStorage.getItem('relaxedConstraints') || '[]');
      const items   = document.querySelectorAll('.restriccion-item');
      let hasRelaxed = false;

      items.forEach(li => {
        const texto = li.querySelector('label')?.innerText;
        if (texto && relaxed.includes(texto)) {
          li.classList.add('relaxed-highlight');
          hasRelaxed = true;
        } else {
          li.classList.remove('relaxed-highlight');
        }
      });

      // 2) Eliminamos aviso previo si existía
      const prevNote = document.getElementById('relaxed-note');
      if (prevNote) prevNote.remove();

      // 3) Si hay al menos una relajada, insertamos el aviso
      if (hasRelaxed) {
        const note = document.createElement('div');
        note.id = 'relaxed-note';
        note.className = 'relaxed-note';
        note.innerHTML = '⚠️ <strong>Nota:</strong> Las casillas resaltadas indican restricciones que se han relajado para hallar una solución factible.';
        const lista = document.querySelector('.restricciones-list');
        if (lista && lista.parentNode) {
          lista.parentNode.insertBefore(note, lista.nextSibling);
        }
      }
    });


});


