from models.shift_optimizer import ShiftOptimizer
from utils.constraint_translator import extract_variables_from_context
from utils.constraint_translator import translate_constraint_to_code
import gurobipy as gp
from utils.result_visualizer import exportar_resultados

if __name__ == "__main__":
    print("Running shift optimization...\n")

    context = input("Introduce la descripción del problema:")
    print("Procesando... extrayendo variables...")
    variables = extract_variables_from_context(context)
    print(variables)

    # Crear instancia del modelo
    model = ShiftOptimizer(variables)
    print(f"🔹 Restricciones en el modelo al inicio: {model.model.NumConstrs}")

    while True:
        nl_constraint = input("Introduce una restricción (o escribe 'salir' para terminar): ")
        if nl_constraint.lower() == 'salir':
            break

        print("Traduciendo restricción a código Gurobi...")
        gurobi_code = translate_constraint_to_code(nl_constraint, variables["variables"])

        print("Restricción generada:")
        print(gurobi_code)

        exec(gurobi_code, globals(), locals())

    # Paso 4: Ejecutar optimización
    print("Ejecutando optimización...")
    model.optimizar()