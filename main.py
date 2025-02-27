from models.shift_optimizer import ShiftOptimizer
from utils.constraint_translator import translate_constraint_to_code
import gurobipy as gp
from utils.result_visualizer import exportar_resultados

if __name__ == "__main__":
    print("Running shift optimization...\n")

    # Crear instancia del modelo
    model = ShiftOptimizer()
    print(f"🔹 Restricciones en el modelo al inicio: {model.model.NumConstrs}")

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

                # 🔹 También mostramos los días de descanso
                if sum(model.d[r, d, t].x for t in range(model.num_turnos)) == 0:
                    print(f"  💤 Retén {r} DESCANSA el día {d}")

        exportar_resultados(model, x, model.num_retenes, model.num_turnos, model.dias)
    else:
        print("❌ No se encontró una solución óptima. No se exportarán resultados.")
