from models.shift_optimizer import ShiftOptimizer
from utils.constraint_translator import extract_variables_from_context, translate_constraint_to_code
import gurobipy as gp
from utils.result_visualizer import exportar_resultados

if __name__ == "__main__":
    print("Running shift optimization...\n")

    # Leer la descripción del problema desde la consola
    context = input("Introduce la descripción del problema:")
    print("Procesando... extrayendo variables...")
    variables = extract_variables_from_context(context)
    print("Variables extraídas:")
    print(variables)

    # Crear instancia del modelo
    model = ShiftOptimizer(variables)
    print(f"🔹 Restricciones en el modelo al inicio: {model.model.NumConstrs}")

    # Bucle para introducir restricciones en lenguaje natural
    while True:
        nl_constraint = input("Introduce una restricción (o escribe 'salir' para terminar): ")
        if nl_constraint.lower() == 'salir':
            break

        print("Traduciendo restricción a código Gurobi...")
        gurobi_code = translate_constraint_to_code(nl_constraint, variables["variables"])
        print("Restricción generada:")
        print(gurobi_code)
        # Ejecutar el código de la restricción en el contexto adecuado
        model.agregar_restriccion(nl_constraint, gurobi_code)

    # Ejecutar la optimización
    print("Ejecutando optimización...")
    model.optimizar()

    # Visualización de la solución por consola
    if model.model.status == gp.GRB.OPTIMAL:
        print("\n✅ Solución óptima encontrada. Variables activadas:")
        # Recorremos las variables de decisión y mostramos aquellas activadas
        for key, var in model.decision_vars.items():
            if var.X > 0.5:
                print(f"x{key} = {var.X}")
    else:
        print("No se encontró una solución óptima.")

    # Exportar la solución a Excel utilizando la función parametrizada
    exportar_resultados(model.model, model.decision_vars, variables)