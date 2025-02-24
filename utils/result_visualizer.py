import pandas as pd

def exportar_resultados(model, x, num_retenes, num_turnos, num_dias, archivo_salida="C:/Users/cynth/Documents/Cuarto año GCID/TFG/resultados_turnos.csv"):
    """ Exporta los resultados en formato CSV """
    data = []
    for r in range(num_retenes):
        for d in range(num_dias):
            for t in range(num_turnos):
                if x[r, d, t].x > 0.5:
                    data.append([r, d, t])

    df = pd.DataFrame(data, columns=["Retén", "Día", "Turno"])
    df.to_csv(archivo_salida, index=False)
    print(f"\n✅ Resultados exportados a {archivo_salida}")
