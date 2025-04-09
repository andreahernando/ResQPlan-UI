from flask import Blueprint, jsonify, request, render_template, session, url_for, send_file
from utils.constraint_translator import extract_variables_from_context, translate_constraint_to_code
from models.shift_optimizer import ShiftOptimizer
import gurobipy as gp
from utils.result_visualizer import exportar_resultados
import os

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
        return jsonify({"error": "No se proporcionaron datos de entrada"}), 400

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
        return jsonify({"error": "No se proporcionó ninguna restricción"}), 400

    variables = session.get('variables', {})

    if not variables:
        return jsonify({"error": "No se encontraron variables en la sesión. Traduce primero el contexto."}), 400

    translated_code = translate_constraint_to_code(nl_constraint, variables["variables"])

    global global_model
    if global_model:
        global_model.agregar_restriccion(nl_constraint, translated_code)

    return jsonify({"result": translated_code})

@routes.route('/api/optimize', methods=['POST'])
def optimize():
    global global_model

    if not global_model:
        return jsonify({"error": "No se encontró ningún modelo. Proporciona primero el contexto y las restricciones."}), 400

    global_model.optimizar()

    if global_model.model.status == gp.GRB.OPTIMAL:
        solution = {f"x{key}": var.X for key, var in global_model.decision_vars.items() if var.X > 0.5}
    else:
        solution = "No se encontró una solución óptima."

    variables = session.get('variables', {})

    if "variables" not in variables:
        return jsonify({"error": "No se encontraron variables en la sesión. Asegúrate de haber traducido el contexto primero."}), 400

    exportar_resultados(global_model.model, global_model.decision_vars, variables)

    return jsonify({"solution": solution})

@routes.route('/api/download_excel')
def download_excel():
    excel_path = os.path.join(os.getcwd(), 'resultados_turnos.xlsx')

    if os.path.exists(excel_path):
        return send_file(excel_path, as_attachment=True)
    else:
        return jsonify({"error": "Archivo no encontrado"}), 404
