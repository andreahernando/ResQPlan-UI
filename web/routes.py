from flask import Blueprint, jsonify, request, render_template, session, send_file, current_app
from uuid import uuid4
from utils.constraint_translator import extract_variables_from_context, translate_constraint_to_code
from models.shift_optimizer import ShiftOptimizer
import gurobipy as gp
from utils.result_visualizer import exportar_resultados
import os

routes = Blueprint('routes', __name__, template_folder='../web/templates')


@routes.route('/')
def index():
    return render_template('index.html')


# ─────────────────────────────────────────────────────────────────────────────
# Gestión de Proyectos
# ─────────────────────────────────────────────────────────────────────────────

@routes.route('/api/projects', methods=['GET'])
def list_projects():
    projects = list(current_app.mongo.db.projects.find({}, {"_id": 0}))
    return jsonify({"projects": projects})


@routes.route('/api/projects', methods=['POST'])
def create_project():
    data = request.get_json() or {}
    pid = str(uuid4())
    specs = session.get('variables', {})
    if not specs or "decision_variables" not in specs:
        specs = {
            "decision_variables": [],
        }
    manual = session.get('restricciones', [])

    # Tomamos el shift_store si existe, sino lista vacía
    shift = getattr(current_app, "shift_store", None)
    vc_list = []
    if shift:
        for texto, info in shift.restricciones_validadas.items():
            vc_list.append({
                "texto": texto,
                "code": info["code"],
                "activa": info["activa"]
            })

    project = {
        "id": pid,
        "name": data.get("name", "Untitled"),
        "context": data.get("context", ""),
        "detectedConstraints": data.get("detectedConstraints", []),
        "manualConstraints": manual,
        "variables": specs,
        "validatedConstraints": vc_list,
        "gurobiState": data.get("gurobiState", {"vars": [], "cons": [], "objective": "0", "sense": 1})

    }

    current_app.mongo.db.projects.insert_one(project)
    print(f"[DEBUG CREATE] Proyecto creado id={pid}, name={project['name']}, validated={vc_list}")
    return jsonify({"id": pid, "name": project["name"]}), 201



@routes.route('/api/projects/<pid>', methods=['GET'])
def load_project(pid):
    project = current_app.mongo.db.projects.find_one({"id": pid}, {"_id": 0})
    if not project:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    specs = project.get('variables', {}) or {}
    if not isinstance(specs.get("decision_variables"), str):
        specs["decision_variables"] = ""
    try:
        current_app.shift_store = ShiftOptimizer(specs)
    except Exception as e:
        current_app.logger.warning(f"No inicializar ShiftOptimizer: {e}")
        current_app.shift_store = None

    # Debug de lo que llega
    print(f"[DEBUG LOAD] Proyecto id={pid} name={project.get('name')}")
    print(f"  Variables: {project.get('variables')}")
    print(f"  ManualConstraints: {project.get('manualConstraints')}")
    print(f"  ValidatedConstraints raw: {project.get('validatedConstraints')}")

    # Restaurar sesión
    session['variables'] = project.get('variables', {})
    session['restricciones'] = project.get('manualConstraints', [])
    session.modified = True

    # Reconstruir modelo en backend
    specs = project.get('variables', {})
    current_app.shift_store = ShiftOptimizer(specs)
    print(f"[DEBUG LOAD] Modelo reseteado con {len(current_app.shift_store.decision_vars)} vars")

    # Aplicar cada validación guardada
    for entry in project.get('validatedConstraints', []):
        nl = entry["texto"]
        current_app.shift_store.restricciones_validadas[nl] = {
            "code": entry["code"],
            "activa": entry["activa"]
        }
        print(f"[DEBUG LOAD] Restaurando '{nl}' activa={entry['activa']}")
        if entry["activa"]:
            ok = current_app.shift_store.agregar_restriccion(nl)
            print(f"[DEBUG LOAD] Agregada '{nl}': {ok}")

    print(f"[DEBUG LOAD] Modelo final: {len(current_app.shift_store.model.getVars())} vars, "
          f"{len(current_app.shift_store.model.getConstrs())} constrs")
    return jsonify(project)


@routes.route('/api/projects/<pid>', methods=['PUT'])
def update_project(pid):
    data = request.get_json() or {}

    # Reconstruir la lista para almacenar
    vc_list = [
        {"texto": t, "code": info["code"], "activa": info["activa"]}
        for t, info in current_app.shift_store.restricciones_validadas.items()
    ]
    print(f"[DEBUG UPDATE] Antes de grabar validatedConstraints={vc_list}")

    update = {
        "name": data.get("name"),
        "context": data.get("context"),
        "detectedConstraints": data.get("detectedConstraints"),
        "manualConstraints": data.get("manualConstraints"),
        "variables": data.get("variables"),
        "validatedConstraints": vc_list,
        "gurobiState": data.get("gurobiState")
    }
    result = current_app.mongo.db.projects.update_one({"id": pid}, {"$set": update})
    if result.matched_count == 0:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    print(f"[DEBUG UPDATE] Proyecto id={pid} actualizado")
    return jsonify({"success": True})


@routes.route('/api/projects/<pid>', methods=['DELETE'])
def delete_project(pid):
    result = current_app.mongo.db.projects.delete_one({"id": pid})
    if result.deleted_count == 0:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    print(f"[DEBUG DELETE] Proyecto id={pid} eliminado")
    return jsonify({"success": True})


# ─────────────────────────────────────────────────────────────────────────────
# Otras rutas existentes (translate, convert, edit_constraint, optimize…)
# ─────────────────────────────────────────────────────────────────────────────

@routes.route('/api/translate', methods=['POST'])
def translate():
    data = request.get_json() or {}
    context = data.get('input_data', '').strip()
    if not context:
        return jsonify({"message": "No se proporcionaron datos de entrada"}), 400

    try:
        variables = extract_variables_from_context(context)
        # Si tu función devuelve {"error": "..."} lo tratamos también como fallo
        if isinstance(variables, dict) and variables.get("error"):
            return jsonify({"message": variables["error"]}), 400

    except Exception as e:
        # Aquí cogemos TANTO tu RuntimeError de múltiples intentos
        # como cualquier otro ValueError o JSONDecodeError
        return jsonify({"message": str(e)}), 400

    # Si todo fue bien…
    session['variables'] = variables
    detected = variables.get('detected_constraints', [])
    pid = session.get('current_project_id')
    if pid:
        current_app.mongo.db.projects.update_one(
            {"id": pid},
            {"$set": {"manualConstraints": detected}}
        )
    current_app.shift_store = ShiftOptimizer(variables)
    return jsonify({"result": variables}), 200



@routes.route("/api/edit_constraint", methods=["POST"])
def edit_constraint():
    data = request.json
    old_nl = data["old_nl"]
    new_nl = data["new_nl"]

    if not hasattr(current_app, 'shift_store'):
        return jsonify(success=False, error="No se ha inicializado el modelo"), 400

    optimizer: ShiftOptimizer = current_app.shift_store
    ok = optimizer.editar_restriccion(old_nl, new_nl)
    if ok:
        return jsonify(success=True)
    else:
        return jsonify(success=False, error="Validación fallida"), 400

@routes.route("/api/delete_constraint", methods=["POST"])
def delete_constraint():
    data = request.json or {}
    nl = data.get("nl")

    if not nl:
        return jsonify(success=False, error="No se especificó la restricción."), 400
    if not hasattr(current_app, 'shift_store'):
        return jsonify(success=False, error="No se ha inicializado el modelo"), 400

    optimizer: ShiftOptimizer = current_app.shift_store
    if nl in optimizer.restricciones_validadas:
        # 1) Eliminar de memoria
        del optimizer.restricciones_validadas[nl]

        # 2) Persistir en MongoDB
        pid = session.get('current_project_id')
        if pid:
            # 2a) validatedConstraints
            vc_list = [
                {"texto": t, "code": info["code"], "activa": info["activa"]}
                for t, info in optimizer.restricciones_validadas.items()
            ]
            # 2b) manualConstraints
            manual = session.get('restricciones', [])
            manual = [m for m in manual if m["texto"] != nl]

            current_app.mongo.db.projects.update_one(
                {"id": pid},
                {"$set": {
                    "validatedConstraints": vc_list,
                    "manualConstraints": manual
                }}
            )
            # mantener en sesión
            session['restricciones'] = manual

        return jsonify(success=True)
    else:
        return jsonify(success=False, error="Restricción no encontrada."), 404


@routes.route("/api/view_constraint", methods=["POST"])
def view_constraint():
    """Devuelve el código Gurobi de una restricción validada a partir de su texto."""
    data = request.get_json()
    nl = data.get("nl")

    if not nl:
        return jsonify(success=False, error="No se especificó la restricción."), 400

    if not hasattr(current_app, 'shift_store'):
        return jsonify(success=False, error="No se ha inicializado el modelo"), 400

    optimizer: ShiftOptimizer = current_app.shift_store
    restr = optimizer.restricciones_validadas.get(nl)

    if restr:
        return jsonify(success=True, code=restr["code"])
    else:
        return jsonify(success=False, error="Restricción no encontrada."), 404

@routes.route('/api/convert', methods=['POST'])
def convert():
    data = request.get_json() or {}
    nl = (data.get('constraint') or "").strip()

    # 1) Validación de entrada
    if not nl:
        return jsonify({"message": "No se especificó ninguna restricción."}), 400

    # 2) Comprobar que hay variables en sesión
    translate_vars = session.get('variables')
    if not translate_vars:
        return jsonify({"message": "No hay variables en sesión. Sube un contexto primero."}), 400

    try:
        # 3) Traducción a código Gurobi
        result = translate_constraint_to_code(nl, translate_vars)
        if isinstance(result, dict) and result.get("error"):
            return jsonify({"message": result["error"]}), 400
        code = result

        valid = False
        if hasattr(current_app, 'shift_store'):
            # 4) Validar en memoria (esto llenará ShiftOptimizer.name_to_nl)
            valid = current_app.shift_store.validar_restriccion(nl, code)
            # 4.1) Inyectar en el modelo real para que name_to_nl se consolide
            if valid:
                current_app.shift_store.agregar_restriccion(nl)

            # 5) Persistir estado en MongoDB
            pid = session.get('current_project_id')
            if pid:
                # 5a) validatedConstraints
                vc_list = [
                    {"texto": t, "code": info["code"], "activa": info["activa"]}
                    for t, info in current_app.shift_store.restricciones_validadas.items()
                ]
                # 5b) manualConstraints (añadir si es nuevo)
                manual = session.get('restricciones', [])
                if not any(m['texto'] == nl for m in manual):
                    manual.append({"texto": nl, "activa": True})
                # actualización conjunta
                current_app.mongo.db.projects.update_one(
                    {"id": pid},
                    {"$set": {
                        "validatedConstraints": vc_list,
                        "manualConstraints": manual
                    }}
                )
                # mantener en sesión
                session['restricciones'] = manual

        # 6) Respuesta
        return jsonify({
            "code": code,
            "valid": valid,
            # <— añadimos aquí el mapeo nombre Gurobi → frase NL
            "mapping": current_app.shift_store.name_to_nl
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("Error interno en /api/convert")
        return jsonify({"message": f"Error interno: {e}"}), 500


@routes.route('/api/optimize', methods=['POST'])
def optimize():
    """Activa las restricciones seleccionadas y ejecuta la optimización."""
    # Verificar que el optimizador esté inicializado
    if not hasattr(current_app, 'shift_store'):
        return jsonify({"error": "No se encontró ningún modelo."}), 400
    optimizer: ShiftOptimizer = current_app.shift_store

    data = request.get_json() or {}
    active_list = data.get('active_constraints', [])

    # Desactivar todas las restricciones
    for nl, info in optimizer.restricciones_validadas.items():
        info["activa"] = False

    # Activar solo las seleccionadas
    for nl in active_list:
        if nl in optimizer.restricciones_validadas:
            optimizer.restricciones_validadas[nl]["activa"] = True

    # Ejecutar la optimización
    optimization_info = optimizer.optimizar() or {}

    # Construir la solución
    if optimizer.model.status == gp.GRB.OPTIMAL:
        solution = {
            str(key): var.X
            for key, var in optimizer.decision_vars.items()
            if var.X > 0.5
        }
    else:
        solution = "No se encontró una solución óptima."

    # Exportar resultados a Excel
    variables = session.get('variables', {})
    exportar_resultados(optimizer.model, optimizer.decision_vars, variables)

    return jsonify({
        "solution": solution,
        "status": optimizer.model.status,
        "relaxed_constraints": optimization_info.get("relaxed_constraints", [])
    })



@routes.route('/api/download_excel')
def download_excel():
    """Devuelve el archivo de resultados generado tras la optimización."""
    excel_path = os.path.join(os.getcwd(), 'resultados_turnos.xlsx')

    if os.path.exists(excel_path):
        return send_file(excel_path, as_attachment=True)
    else:
        return jsonify({"error": "Archivo no encontrado"}), 404


@routes.route('/results')
def results_page():
    """Página que muestra los resultados de la optimización."""
    return render_template('results.html')
