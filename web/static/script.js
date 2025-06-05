document.addEventListener("DOMContentLoaded", function () {
  let contextReady = false;
  const constraintInput = document.getElementById("constraint");
  const convertButton   = document.getElementById("convert-button");

  if (constraintInput) {
    constraintInput.addEventListener("mousedown", e => {
      if (!contextReady) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showToast("warning", "Primero ingresa un contexto y pulsa “Subir”.");
      }
    });
  }

  if (convertButton) {
    convertButton.addEventListener("click", e => {
      if (!contextReady) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showToast("warning", "Primero ingresa un contexto y pulsa “Subir”.");
      }
    });
  }

  let procesandoRestricciones = false;
  let originalText = "";

  const okButton = document.getElementById("ok-button");
  const contextInput = document.getElementById("context");
  const wrapper = document.querySelector(".textarea-with-button");
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) loadingOverlay.style.display = "none";


  const detectedPanel = document.getElementById('detected-panel');
  const detectedList = document.getElementById('detected-constraints');

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

  const deleteProjectBtn = document.getElementById("delete-project");
  if (deleteProjectBtn) deleteProjectBtn.style.display = "none";
  const newPrompt = document.getElementById("new-project-prompt");
  const newNameInput = document.getElementById("new-project-name");
  const createProjectBtn = document.getElementById("create-project");
  const cancelCreateBtn = document.getElementById("cancel-create");
  const projectList = document.getElementById("project-list");

  const newProjectBtn   = document.getElementById("new-project-btn");

  newProjectBtn.addEventListener("click", () => {
    newPrompt.style.display = "flex";
    newNameInput.value = "";
    newNameInput.focus();
  });
  const contextWarning = document.getElementById('context-warning');


  let currentProjectId = null;
  let currentProjectName = "";
  let currentGurobiModel = null;

  const storedId = sessionStorage.getItem('currentProjectId');
  const storedName = sessionStorage.getItem('currentProjectName');

  if (storedId) {
    currentProjectId = storedId;
    currentProjectName = storedName;
  }

  setupEditProjectName();
  renderContextControls();

  document.querySelectorAll('.info-icon').forEach(icon => {
    const helpText = {
      'info-context': 'Aquí debes escribir el contexto: información general y datos relevantes para la optimización.',
      'info-constraints': 'Aquí introduces las restricciones en lenguaje natural, una por línea, que tu modelo debe cumplir.'
    }[icon.id];

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.innerText = helpText;
    document.body.appendChild(tooltip);

    icon.addEventListener('mouseenter', e => {
      const rect = icon.getBoundingClientRect();
      tooltip.style.top  = (rect.bottom + window.scrollY + 6) + 'px';
      tooltip.style.left = (rect.left + window.scrollX) + 'px';
      tooltip.style.display = 'block';
    });
    icon.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });


  function setupEditProjectName() {
    const editBtn = document.getElementById("edit-project-name");
    const titleSpan = document.getElementById("project-title");

    if (!editBtn || !titleSpan) return;

    editBtn.onclick = () => {
      editBtn.style.display = "none";
      titleSpan.style.display = "none";

      const input = document.createElement("input");
      input.type = "text";
      input.value = currentProjectName;
      input.id = "project-name-input";

      const saveBtn = document.createElement("button");
      saveBtn.id = "save-project-inline";
      saveBtn.innerText = "💾";
      saveBtn.title = "Guardar nombre";

      const cancelBtn = document.createElement("button");
      cancelBtn.id = "cancel-project-inline";
      cancelBtn.innerText = "✖️";
      cancelBtn.title = "Cancelar";

      titleSpan.parentNode.insertBefore(input, editBtn);
      input.after(saveBtn, cancelBtn);

      input.focus();
      input.select();

      cancelBtn.onclick = () => {
        input.remove();
        saveBtn.remove();
        cancelBtn.remove();
        titleSpan.style.display = "";
        editBtn.style.display = "";
      };

      saveBtn.onclick = async () => {
        const newName = input.value.trim();
        if (!newName || newName === currentProjectName) return cancelBtn.click();

        try {
          await fetch(`/api/projects/${currentProjectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName })
          });
          currentProjectName = newName;
          sessionStorage.setItem('currentProjectName', newName);
          titleSpan.textContent = currentProjectName;

          document.querySelectorAll("#project-list li").forEach(li => {
            if (li.dataset.id === currentProjectId) {
              li.firstChild.textContent = currentProjectName;
            }
          });

          showToast("success", `Proyecto renombrado a “${currentProjectName}”`);
        } catch (err) {
          console.error(err);
          showToast("error", "No se pudo renombrar el proyecto.");
        } finally {
          input.remove();
          saveBtn.remove();
          cancelBtn.remove();
          titleSpan.style.display = "";
          editBtn.style.display = "";
        }
      };
    };
  }

  function parseLinExpr(exprStr, varsMap) {
    const expr = new Gurobi.LinExpr();
    exprStr.replace(/\s+/g, '').split('+').forEach(term => {
      const [coefStr, varName] = term.split('*');
      const coef = parseFloat(coefStr);
      if (varsMap[varName]) expr.addTerm(coef, varsMap[varName]);
    });
    return expr;
  }

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

  async function refreshProjectOptions() {
    const headerDiv = document.getElementById("project-header");
    const titleSpan  = document.getElementById("project-title");
    if (currentProjectId) {
      headerDiv.style.display = "flex";
      titleSpan.textContent  = currentProjectName;
    } else {
      headerDiv.style.display = "none";
    }

    const saveControls = document.getElementById("save-controls");
    if (currentProjectId) {
      saveControls.style.display = "flex";
    } else {
      saveControls.style.display = "none";
    }

    let prevNote = document.getElementById('relaxed-note');
    if (prevNote) prevNote.remove();

    if (contextWarning) {
      contextWarning.style.visibility = 'hidden';
    }
    if (detectedPanel) {
      detectedPanel.style.display = 'none';
    }
      projectList.innerHTML = "";
      const projects = await listProjects();
      projects.forEach(p => {
        const li = document.createElement("li");
        li.textContent = p.name;
        li.dataset.id = p.id;

        const duplicateBtn = document.createElement("button");
        duplicateBtn.classList.add("duplicate-btn");
        duplicateBtn.innerHTML = `<i class="fas fa-clone"></i>`; // Icono de duplicar
        duplicateBtn.title = "Duplicar proyecto";

        duplicateBtn.addEventListener("click", async (e) => {
          e.stopPropagation();

          const orig = await loadProject(p.id);
          if (orig.error) return showToast("error", "No se pudo cargar el proyecto original.");

          let newName = `${orig.name}1`;

          const allNames = (await listProjects()).map(x => x.name);
          let suffix = 1;
          while (allNames.includes(newName)) {
            newName = `${orig.name} ${++suffix}`;
          }

          const clonePayload = {
            name: newName,
            context: orig.context,
            detectedConstraints: orig.detectedConstraints,
            manualConstraints: orig.manualConstraints,
            variables: orig.variables,
            gurobiState: orig.gurobiState
          };

          try {
            const res = await fetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(clonePayload)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);

            showToast("success", `Proyecto duplicado como “${newName}”`);
            await refreshProjectOptions();
          } catch (err) {
            console.error(err);
            showToast("error", "Error al duplicar el proyecto.");
          }
        });

        li.appendChild(duplicateBtn);



        const deleteBtn = document.createElement("button");
        deleteBtn.classList.add("delete-btn");
        deleteBtn.innerHTML = `<i class="fas fa-trash-alt"></i>`;
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`¿Borrar el proyecto “${p.name}”?`)) return;
          await deleteProject(p.id);
          showToast("warning", `Proyecto “${p.name}” eliminado`);
          await refreshProjectOptions();
        });

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

          currentProjectId = proj.id;
          currentProjectName = proj.name;
          sessionStorage.setItem('currentProjectId', proj.id);
          sessionStorage.setItem('currentProjectName', proj.name);
          contextInput.innerText = proj.context || "";
          originalText = contextInput.innerText;
          if (proj.context && proj.context.trim().length > 0) {
            contextReady = true;
          } else {
            contextReady = false;
          }


          sessionStorage.setItem('savedContext', contextInput.innerText);
          renderContextControls();
          if (window.currentGurobiModel) {
            showToast("success", `Modelo Gurobi de “${proj.name}” reconstruido`);
          }

          const headerDiv = document.getElementById("project-header");
          const titleSpan = document.getElementById("project-title");

          if (proj.id) {
            headerDiv.style.display = "flex";
            titleSpan.textContent = proj.name;
          } else {
            headerDiv.style.display = "none";
          }

          const saveControls = document.getElementById("save-controls");
          saveControls.style.display = "flex";

          setupEditProjectName()



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
            sense: currentGurobiModel.get(GRB.IntAttr.ModelSense)
          }
        : { vars: [], cons: [], objective: "0", sense: 1 }
    };

    await updateProject(proje);
    console.log(`Guardado automático del proyecto “${currentProjectName}”`);
  }


  document.getElementById("new-project-btn").addEventListener("click", () => {
    newPrompt.style.display = "block";
  });

  createProjectBtn.addEventListener("click", async () => {
    const name = newNameInput.value.trim();
    if (!name) return showToast("warning", "Ponle un nombre al proyecto");
    const proj = await createProject(name);

    contextReady = false;
    if (constraintInput) {
      constraintInput.readOnly = true;
      constraintInput.value = "";
    }
    renderContextControls();


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
        if (!ctx) return showToast("warning", "Por favor ingresa algún contexto.");

        ['edit-context', 'summary-context', 'cancel-edit', 'ok-button'].forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.remove();
        });
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

          if (!res.ok) {
            const errMsg = data.message ?? data.error ?? `Error HTTP ${res.status}`;
            throw new Error(errMsg);
          }

          return data;
        })

        .then(p => {

          if (loadingOverlay) loadingOverlay.style.display = "none";

          sessionStorage.setItem("variables", JSON.stringify(p.result));
          contextReady = true;
          if (constraintInput) constraintInput.readOnly = false;

          if (p.result.detected_constraints && p.result.detected_constraints.length) {
            contextWarning.style.visibility = 'visible';

            let html = contextInput.innerText;

            p.result.detected_constraints.forEach(nl => {
              const esc = nl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const regex = new RegExp(`(${esc})`, 'g');
              html = html.replace(
                regex,
                `<mark class="highlight clickable" data-nl="${nl}">$1</mark>`
              );
            });
            contextInput.innerHTML = html;
            detectedPanel.style.display = 'none';

            contextInput.querySelectorAll('mark.highlight.clickable').forEach(mark => {
              mark.style.cursor = 'pointer';
              mark.title = 'Haz clic para agregar esta restricción';

              mark.addEventListener('click', async () => {
                const nl = mark.dataset.nl;
                if (mark.classList.contains('added')) return;  // ya agregado

                const confirmar = confirm(`¿Quieres agregar la restricción:\n\n“${nl}”?`);
                if (!confirmar) return;

                const progressContainer = document.getElementById('progress-container');
                const progressBar       = document.getElementById('progress-bar');
                const progressLabel     = document.getElementById('progress-label');
                progressBar.max   = 1;
                progressBar.value = 0;
                progressLabel.textContent = `Procesando 0 de 1…`;
                progressContainer.style.display = 'block';

                mark.classList.add('adding');
                mark.textContent = '';

                try {
                  await intentarConvertir(nl);

                  const textoPlano = contextInput.innerText;
                  contextInput.innerHTML = textoPlano;
                  sessionStorage.setItem('savedContext', contextInput.innerText);

                  await autoSaveProject();
                  showToast('success', `“${nl}” agregada correctamente.`);

                } catch (err) {
                  console.error(err);
                  mark.classList.remove('adding');
                  mark.textContent = nl;
                  alert('Error al agregar la restricción. Por favor, inténtalo de nuevo.');

                } finally {
                  progressContainer.style.display = 'none';
                }
              });
            });



          } else {
            contextWarning.style.visibility = 'hidden';
          }

          originalText = ctx;
          contextInput.setAttribute('contenteditable', 'false');
          sessionStorage.setItem('savedContext', contextInput.innerText);

          showToast("success", "Contexto procesado correctamente.");

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
        const inputEdit = document.createElement("input");
        inputEdit.type = "text";
        inputEdit.value = oldText;
        inputEdit.classList.add("edit-input");

        inputEdit.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveBtn.click();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelBtn.click();
          }
        });

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

        label.replaceWith(inputEdit);
        controlsWrapper.replaceWith(inlineControls);

        inputEdit.focus();
        inputEdit.select();

        cancelBtn.addEventListener("click", () => {
          inputEdit.replaceWith(label);
          inlineControls.replaceWith(controlsWrapper);
        });

        saveBtn.addEventListener("click", async () => {
          const newText = inputEdit.value.trim();
          if (!newText || newText === oldText) return cancelBtn.click();
          const originalContent = saveBtn.textContent;
          saveBtn.textContent = "";
            cancelBtn.style.display = "none";
          saveBtn.disabled = true;
          cancelBtn.disabled = true;

          const spinner = document.createElement("span");
          spinner.classList.add("save-spinner");
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
              markDirty();
              showToast("success", "Restricción editada correctamente.");
            } else {
              throw new Error(result.error || "Server error");
            }
          } catch (e) {
            showToast("error", "Error al editar restricción.");
            console.error(e);

            saveBtn.removeChild(spinner);
            saveBtn.textContent = originalContent;
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
          }
        });
      });

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
          li.remove();
          markDirty()
          guardarRestricciones();
          updateManualConstraintsInfo()
          showToast("success", "Restricción eliminada correctamente.");

          await autoSaveProject();
          const anyRelaxed = !!document.querySelector(".restriccion-item.relaxed-highlight");

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
            document.querySelectorAll(".code-popup").forEach(p => p.remove());

            const popup = document.createElement("div");
            popup.classList.add("code-popup");
            popup.innerHTML = `
              <button class="close-popup">&times;</button>
              <pre>${result.code}</pre>
            `;
            document.body.appendChild(popup);

            const buttonRect = e.target.getBoundingClientRect();
            const popupWidth = popup.offsetWidth;
            const spacing = 8;

            const panel = e.target.closest(".panel");
            const panelRect = panel.getBoundingClientRect();

            let left = buttonRect.left + window.scrollX - popupWidth - spacing;
            let top = buttonRect.top + window.scrollY;

            const minLeft = panelRect.left + window.scrollX + 10;
            if (left < minLeft) left = minLeft;

            popup.style.position = "absolute";
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;

            popup.querySelector(".close-popup").addEventListener("click", () => {
              popup.remove();
            });

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

        const data = await res.json().catch(() => {
          throw new Error("Respuesta no válida del servidor");
        });

        if (!res.ok) {
          const msg = data.message ?? `Error HTTP ${res.status}`;
          throw new Error(msg);
        }

        if (data.valid === false) {
          const msg = data.message ?? "La restricción no aplica al contexto proporcionado.";
          showToast("error", msg);
          const resDiv = document.getElementById("constraint-result");
          if (resDiv) resDiv.innerText = msg;
          return;
        }

        const lista = document.querySelector(".restricciones-list");
        if (!lista) return;

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
        updateManualConstraintsInfo()
        markDirty();
        showToast("success", "Restricción añadida correctamente.");

      } catch (err) {
        const msg = err.message ?? String(err);

        showToast("error", msg);
        const resDiv = document.getElementById("constraint-result");
        if (resDiv) resDiv.innerText = msg;

        if (intentos > 1 && !["La restricción no aplica al contexto proporcionado."].includes(msg)) {
          await new Promise(r => setTimeout(r, 1000));
          return intentarConvertir(constraint, intentos - 1);
        }

      }
    }


    if (convertButton) {
      convertButton.addEventListener("click", async () => {
        const inp = document.getElementById("constraint");
        if (!inp) return;

        const raw = inp.value.trim();
        if (!raw) {
          showToast("warning", "Por favor ingresa al menos una restricción.");
          return;
        }

        const constraints = raw
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);

        inp.value = "";
        inp.focus();

        const progressContainer = document.getElementById("progress-container");
        const progressBar       = document.getElementById("progress-bar");
        const progressLabel     = document.getElementById("progress-label");
        progressBar.max   = constraints.length;
        progressBar.value = 0;
        progressLabel.textContent = `Procesando 0 de ${constraints.length}…`;
        progressContainer.style.display = "block";

        procesandoRestricciones = true;
        convertButton.disabled  = true;

        for (let i = 0; i < constraints.length; i++) {
          const c = constraints[i];
          await intentarConvertir(c);
          progressBar.value = i + 1;
          progressLabel.textContent = `Procesando ${i + 1} de ${constraints.length}…`;
        }

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

      btnContainer.innerHTML = '';

      const hasCtx = contextInput.innerText.trim().length > 0;

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

        btnEdit.addEventListener('click', () => {
          let prevNote = document.getElementById('relaxed-note');
          if (prevNote) prevNote.remove();
          contextInput.innerText    = originalText;
          contextInput.disabled     = true;
          contextInput.setAttribute('contenteditable', 'true');
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
            contextInput.innerHTML     = originalText;
            contextInput.setAttribute('contenteditable', 'false')
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

        btnSummary.addEventListener('click', () => {
          const data = JSON.parse(sessionStorage.getItem('variables') || '{}');
          const { resources = {}, variables = {} } = data;

          const maxLen = 500;
          function truncate(str) {
            if (str.length <= maxLen) return str;
            const extra = str.length - maxLen;
            return str.slice(0, maxLen) + `… [+${extra} caracteres]`;
          }

          function formatArray(arr) {
            const n = arr.length;
            if (n === 0) {
              return '';
            } else if (n <= 20) {
              return '[' + arr.map(v => JSON.stringify(v)).join(', ') + ']';
            } else {
              const firstTwo = arr.slice(0, 15).map(v => JSON.stringify(v)).join(', ');
              const lastOne  = JSON.stringify(arr[n - 1]);
              return `[${firstTwo}, ..., ${lastOne}]`;
            }
          }

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
              let disp;
              if (Array.isArray(vals)) {
                disp = formatArray(vals);
              } else {
                disp = truncate(String(vals));
              }

              const cellContent = disp || '';

              const tr = document.createElement('tr');
              tr.innerHTML = `
                <td style="${tdStyle}">${key}</td>
                <td style="${tdStyle}">${cellContent}</td>
              `;
              tbody.appendChild(tr);
            });
          });
          table.appendChild(tbody);

          const popup   = document.getElementById('summary-popup');
          const content = document.getElementById('summary-popup-content');
          content.innerHTML = '';

          const title = document.createElement('h2');
          title.textContent  = 'Variables identificadas';


          content.appendChild(title);
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
        updateManualConstraintsInfo()
    }

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

          loadingOverlay.style.display = "none";

          sessionStorage.setItem('optimizationResult', JSON.stringify(data));
          sessionStorage.setItem('relaxedConstraints', JSON.stringify(data.relaxed_constraints || []));

          sessionStorage.setItem('savedContext', contextInput.innerText);

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
      sessionStorage.setItem('savedContext', contextInput.innerText.trim());
    });
    if (contextInput) contextInput.focus();

    window.addEventListener('pageshow', () => {
      const contextInput = document.getElementById('context');
      const savedCtx = sessionStorage.getItem('savedContext');
      if (savedCtx !== null && contextInput) {
        contextInput.innerText = savedCtx;
        contextInput.setAttribute('contenteditable', 'false');
        originalText = savedCtx;
        renderContextControls();
      }

      if (savedCtx && savedCtx.trim().length > 0) {
        contextReady = true;
      } else {
        contextReady = false;
      }

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

      let prevNote = document.getElementById('relaxed-note');
      if (prevNote) prevNote.remove();

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

      setupSaveHandlers()

    });

    let isSaved = true;

    const saveStatusElem = document.getElementById("save-status");
    let saveButtonElem  = document.getElementById("save-button");

    function updateSaveUI() {
      if (!saveStatusElem || !saveButtonElem) return;
      if (isSaved) {
        saveStatusElem.textContent = "Todo guardado ✔️";
        saveButtonElem.disabled    = true;
      } else {
        saveStatusElem.textContent = "Cambios sin guardar ⚠️";
        saveButtonElem.disabled    = false;
      }
    }

    function markDirty() {
      if (isSaved) {
        isSaved = false;
        updateSaveUI();
      }
    }

    function setupSaveHandlers() {
      const contextInput = document.getElementById("context");
      const restrList    = document.querySelector(".restricciones-list");

      saveButtonElem   = document.getElementById("save-button");
      if (!saveStatusElem || !saveButtonElem) {
        console.warn("No encontré #save-status o #save-button");
        return;
      }

      if (contextInput) {
        contextInput.addEventListener("input", markDirty);
      }
      if (restrList) {
        restrList.addEventListener("change", markDirty);
        restrList.addEventListener("click", markDirty);
      }

      const newSaveBtn = saveButtonElem.cloneNode(true);
      saveButtonElem.parentNode.replaceChild(newSaveBtn, saveButtonElem);
      saveButtonElem = newSaveBtn;

      saveButtonElem.addEventListener("click", async () => {
        saveStatusElem.textContent = "Guardando…";
        saveButtonElem.disabled    = true;
        try {
          await autoSaveProject();
          isSaved = true;
          updateSaveUI();
          showToast("success", "Todos los cambios se han guardado.");
        } catch (err) {
          console.error(err);
          saveStatusElem.textContent = "Error al guardar ❌";
          saveButtonElem.disabled    = false;
          showToast("error", "No se pudo guardar manualmente.");
        }
      });

      updateSaveUI();
    }


    function updateManualConstraintsInfo() {
      const info = document.getElementById('no-constraints-info');
      const lista = document.querySelector('.restricciones-list');
      if (!lista) return;
      if (lista.children.length === 0) {
        info.style.display = 'block';
      } else {
        info.style.display = 'none';
      }
    }

});
