from models.shift_optimizer import ShiftOptimizer
from utils.constraint_translator import translate_constraint_to_code
import gurobipy as gp
from utils.result_visualizer import exportar_resultados

if __name__ == "__main__":
    print("Running shift optimization...\n")

    # Crear instancia del modelo
    model = ShiftOptimizer()
    print(f"🔹 Restricciones en el modelo al inicio: {model.model.NumConstrs}")

    while True:
        nl_constraint = input("Enter a constraint in natural language (or type 'exit' to finish'): ")
        if nl_constraint.lower() == "exit":
            break

        try:
            gurobi_code = translate_constraint_to_code(nl_constraint, model.num_turnos)
            print("\nGenerated constraint:\n", gurobi_code)

            # 🔹 Contamos cuántas restricciones hay ANTES de añadir la nueva
            num_restricciones_antes = model.model.NumConstrs

            # 🔹 DEPURACIÓN ANTES DE `exec()`
            print("\n🔍 Depuración ANTES de ejecutar exec():")
            print(f"num_retenes: {model.num_retenes}")
            print(f"num_turnos: {model.num_turnos}")
            print(f"Cantidad de restricciones antes: {num_restricciones_antes}")

            # 🔹 PASAMOS `gp` A `exec()`
            exec_context = {
                "gp": gp,
                "model": model.model,
                "quicksum": gp.quicksum,
                "GRB": gp.GRB,
                "num_retenes": model.num_retenes,
                "num_turnos": model.num_turnos,
                "num_dias": model.dias  # ✅ Se pasa num_dias en lugar de dias
            }

            try:
                exec(gurobi_code, exec_context)  # 🔹 Ahora gp está en exec()
                model.model.update()  # 🔹 🚀 FORZAR ACTUALIZACIÓN DEL MODELO
            except Exception as e:
                print(f"\n🚨 ERROR en exec(): {e}")
                continue  # Saltamos al siguiente input

            # 🔹 Verificamos cuántas restricciones hay DESPUÉS de ejecutarlo
            num_restricciones_despues = model.model.NumConstrs
            print(f"🔍 Depuración DESPUÉS de ejecutar exec():")
            print(f"Cantidad de restricciones después: {num_restricciones_despues}")

            if num_restricciones_despues > num_restricciones_antes:
                print(f"✅ Restricción añadida correctamente. Total de restricciones: {num_restricciones_despues}")
            else:
                print(f"⚠ Advertencia: La restricción no se añadió correctamente. Verifica la sintaxis.")

        except ValueError as ve:
            print(f"Error: {ve}")
        except Exception as e:
            print(f"Error applying the constraint: {e}")

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
                        print(f"  ✅ x[{r}, {d}, {t}] = {valor}")

        exportar_resultados(model, x, model.num_retenes, model.num_turnos, model.dias)

    else:
        print("❌ No se encontró una solución óptima. No se exportarán resultados.")
