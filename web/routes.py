from flask import Blueprint, jsonify, request, render_template, session, send_file
from uuid import uuid4  # — NUEVO —
from utils.constraint_translator import extract_variables_from_context, translate_constraint_to_code
from models.shift_optimizer import ShiftOptimizer
import gurobipy as gp
from utils.result_visualizer import exportar_resultados
import os

# Crear un Blueprint para las rutas
routes = Blueprint('routes', __name__, template_folder='../web/templates')

# Constante de sesión para proyectos          — NUEVO —
PROJECTS_KEY = "projects"

global_model = None  # Variable global para almacenar el modelo


@routes.route('/')
def index():
    return render_template('index.html')


# ─────────────────────────────────────────────────────────────────────────────
# Gestión de Proyectos                                                        — NUEVO —
# ─────────────────────────────────────────────────────────────────────────────

@routes.route('/api/projects', methods=['GET'])
def list_projects():
    """Devuelve la lista de proyectos guardados en sesión."""
    projects = session.get(PROJECTS_KEY, {})
    return jsonify({
        "projects": [
            {"id": pid, "name": info["name"]}
            for pid, info in projects.items()
        ]
    })


@routes.route('/api/projects', methods=['POST'])
def create_project():
    """Crea un nuevo proyecto con snapshot de variables y restricciones actuales."""
    data = request.get_json() or {}
    name = data.get("name", "Untitled")
    projects = session.setdefault(PROJECTS_KEY, {})
    pid = str(uuid4())
    projects[pid] = {
        "name": name,
        "variables": session.get("variables", {}),
        "restricciones": session.get("restricciones", [])
    }
    session.modified = True
    return jsonify({"id": pid, "name": name}), 201


@routes.route('/api/projects/<pid>', methods=['GET'])
def load_project(pid):
    """Carga un proyecto existente y restaura variables y restricciones en sesión."""
    projects = session.get(PROJECTS_KEY, {})
    proj = projects.get(pid)
    if not proj:
        return jsonify({"error": "Proyecto no encontrado"}), 404
    session["variables"] = proj["variables"]
    session["restricciones"] = proj["restricciones"]
    session.modified = True
    return jsonify({"id": pid, "name": proj["name"]})


@routes.route('/api/projects/<pid>', methods=['DELETE'])
def delete_project(pid):
    """Borra un proyecto de la sesión."""
    projects = session.get(PROJECTS_KEY, {})
    if projects.pop(pid, None) is None:
        return jsonify({"error": "Proyecto no encontrado"}), 404
    session.modified = True
    return jsonify({"success": True})
# ─────────────────────────────────────────────────────────────────────────────


@routes.route('/api/translate', methods=['POST'])
def translate():
    """Procesa el contexto en lenguaje natural, extrae variables y crea el modelo."""
    global global_model
    data = request.get_json()
    context = data.get('input_data')

    if not context:
        return jsonify({"error": "No se proporcionaron datos de entrada"}), 400

    variables = extract_variables_from_context(context)
    session['variables'] = variables

    global_model = ShiftOptimizer(variables)

    return jsonify({"result": variables})


@routes.route('/api/convert', methods=['POST'])
def convert():
    """Traduce una restricción en lenguaje natural a código Gurobi y la valida."""
    data = request.get_json()
    nl_constraint = data.get('constraint')

    if not nl_constraint:
        return jsonify({"error": "No se proporcionó ninguna restricción"}), 400

    variables = session.get('variables', {})

    if not variables:
        return jsonify({
            "error": "No se encontraron variables en la sesión. Traduce primero el contexto."
        }), 400

    translated_code = translate_constraint_to_code(nl_constraint, variables["variables"])

    valid = False
    if global_model:
        valid = global_model.validar_restriccion(nl_constraint, translated_code)

    return jsonify({
        "code": translated_code,
        "valid": valid
    })


@routes.route("/api/edit_constraint", methods=["POST"])
def edit_constraint():
    data = request.json
    old_nl = data["old_nl"]
    new_nl = data["new_nl"]

    if not global_model:
        return jsonify(success=False, error="No se ha inicializado el modelo"), 400

    ok = global_model.editar_restriccion(old_nl, new_nl)
    if ok:
        return jsonify(success=True)
    else:
        return jsonify(success=False, error="Validación fallida"), 400


@routes.route('/api/optimize', methods=['POST'])
def optimize():
    """Activa las restricciones seleccionadas y ejecuta la optimización."""
    global global_model
    if not global_model:
        return jsonify({"error": "No se encontró ningún modelo."}), 400

    data = request.get_json() or {}
    active_list = data.get('active_constraints', [])

    # Desactiva todas
    for nl, info in global_model.restricciones_validadas.items():
        info["activa"] = False

    # Activa solo las seleccionadas
    for nl in active_list:
        if nl in global_model.restricciones_validadas:
            global_model.restricciones_validadas[nl]["activa"] = True

    # Ejecuta la optimización
    global_model.optimizar()

    if global_model.model.status == gp.GRB.OPTIMAL:
        solution = {
            str(key): var.X
            for key, var in global_model.decision_vars.items()
            if var.X > 0.5
        }
    else:
        solution = "No se encontró una solución óptima."

    variables = session.get('variables', {})
    exportar_resultados(global_model.model, global_model.decision_vars, variables)

    return jsonify({
        "solution": solution,
        "status": global_model.model.status
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
