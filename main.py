from models.shift_optimizer import ShiftOptimizer
from utils.constraint_translator import translate_constraint_to_code
import gurobipy as gp
from utils.result_visualizer import exportar_resultados

if __name__ == "__main__":
    print("Running shift optimization...\n")

    # Crear instancia del modelo
    model = ShiftOptimizer()
    print(f"🔹 Restricciones en el modelo al inicio: {model.model.NumConstrs}")

    # Diccionario para almacenar restricciones dinámicas agregadas
    restricciones_agregadas = {}

    # 🔹 Preguntar al usuario si desea agregar restricciones en lenguaje natural
    while True:
        add_constraint = input("\n¿Quieres agregar una restricción en lenguaje natural? (s/n): ").strip().lower()
        if add_constraint == "s":
            nl_constraint = input("Escribe la restricción en lenguaje natural: ").strip()

            try:
                # Traducir la restricción a código Python (Gurobi)
                generated_code = translate_constraint_to_code(nl_constraint, model.num_turnos)
                print("\n✅ Código generado para la restricción:\n")
                print(generated_code)

                # 🔹 Extraer nombres de restricciones generadas
                generated_code_lines = generated_code.split("\n")
                constraint_names = []
                for line in generated_code_lines:
                    if "model.addConstr(" in line and "name=" in line:
                        name_part = line.split("name=")[-1].strip().replace(")", "").replace('"', '')
                        constraint_names.append(name_part)

                # 🔹 Eliminar restricciones previas si existen
                for constraint_name in constraint_names:
                    if constraint_name in restricciones_agregadas:
                        model.model.remove(restricciones_agregadas[constraint_name])
                        print(f"🗑 Eliminada restricción previa: {constraint_name}")

                # 🔹 Ejecutar el código generado dentro del contexto del modelo
                exec(generated_code, {"model": model.model, "d": model.d,
                                      "num_retenes": model.num_retenes,
                                      "dias": model.dias,
                                      "num_turnos": model.num_turnos,
                                      "quicksum": gp.quicksum})

                # 🔹 Guardar nuevas restricciones en el historial
                for constraint_name in constraint_names:
                    restricciones_agregadas[constraint_name] = model.model.getConstrByName(constraint_name)

                print("✅ Restricción añadida exitosamente y sobrescribe cualquier restricción previa en conflicto.\n")

            except Exception as e:
                print(f"\n⚠ ERROR al agregar la restricción: {e}\n")

        elif add_constraint == "n":
            break
        else:
            print("❌ Opción no válida. Responde con 's' o 'n'.")

    print(f"\n🔹 Restricciones en el modelo después de agregar nuevas: {model.model.NumConstrs}")

    # Ejecutar optimización
    model.optimizar()

    # Verificar si se encontró una solución antes de exportar
    if model.model.status == gp.GRB.OPTIMAL:
        x = {}

        print("\n🔍 Depuración de valores de x antes de exportar:")
        for r in range(model.num_retenes):
            for d in range(model.dias):
                for t in range(model.num_turnos):
                    valor = model.d[r, d, t].x
                    x[(r, d, t)] = valor
                    if valor > 0.5:
                        print(f"  ✅ model.d[{r}, {d}, {t}] = {valor}")

                # 🔹 También mostramos los días de descanso
                if sum(model.d[r, d, t].x for t in range(model.num_turnos)) == 0:
                    print(f"  💤 Retén {r} DESCANSA el día {d}")

        exportar_resultados(model, x, model.num_retenes, model.num_turnos, model.dias)
    else:
        print("❌ No se encontró una solución óptima. No se exportarán resultados.")
