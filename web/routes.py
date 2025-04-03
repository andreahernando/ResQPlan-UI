from flask import Blueprint, jsonify, request, render_template, session, redirect, url_for
from utils.constraint_translator import extract_variables_from_context, translate_constraint_to_code
from models.shift_optimizer import ShiftOptimizer
import gurobipy as gp
from utils.result_visualizer import exportar_resultados

# Crear un Blueprint para las rutas
routes = Blueprint('routes', __name__, template_folder='../web/templates')

global_model = None  # Variable global para almacenar el modelo

@routes.route('/')
def index():
    return render_template('index.html')

@routes.route('/restricciones')
def restricciones():
    """ Página donde se configuran y editan las restricciones. """
    variables = session.get('variables', {})  # Recuperar variables de la sesión
    return render_template('restricciones.html', variables=variables)

@routes.route('/api/translate', methods=['POST'])
def translate():
    global global_model
    data = request.get_json()
    context = data.get('input_data')

    if not context:
        return jsonify({"error": "No input data provided"}), 400

    variables = extract_variables_from_context(context)

    # Guardar en la sesión
    session['variables'] = variables

    global_model = ShiftOptimizer(variables)

    # Redirigir a la página de restricciones después de procesar el contexto
    return jsonify({"result": variables, "redirect": url_for('routes.restricciones')})

@routes.route('/api/convert', methods=['POST'])
def convert():
    """ Traduce una restricción en lenguaje natural a código Gurobi. """
    data = request.get_json()
    nl_constraint = data.get('constraint')

    if not nl_constraint:
        return jsonify({"error": "No constraint provided"}), 400

    variables = session.get('variables', {})

    if not variables:
        return jsonify({"error": "No variables found in session. Translate context first."}), 400

    translated_code = translate_constraint_to_code(nl_constraint, variables["variables"])

    global global_model
    if global_model:
        global_model.agregar_restriccion(nl_constraint, translated_code)

    return jsonify({"result": translated_code})

@routes.route('/api/optimize', methods=['POST'])
def optimize():
    global global_model

    if not global_model:
        return jsonify({"error": "No model found. Provide context and constraints first."}), 400

    global_model.optimizar()

    if global_model.model.status == gp.GRB.OPTIMAL:
        solution = {f"x{key}": var.X for key, var in global_model.decision_vars.items() if var.X > 0.5}
    else:
        solution = "No se encontró una solución óptima."

    variables = session.get('variables', {})

    if "variables" not in variables:
        return jsonify({"error": "Variables not found in session. Ensure you translated the context first."}), 400

    exportar_resultados(global_model.model, global_model.decision_vars, variables)

    return jsonify({"solution": solution})
