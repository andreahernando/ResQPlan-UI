import pandas as pd

def exportar_resultados(model, x, num_retenes, num_turnos, num_dias,
                        archivo_salida="C:/Users/cynth/Documents/Cuarto año GCID/TFG/resultados_turnos.csv"):
    """ Exporta los resultados en formato CSV con una estructura detallada: (Retén, Día, Turno, Ciclo) """

    data = {"Retén": [], "Día": [], "Turno": [], "Ciclo": []}

    for r in range(num_retenes):
        for d in range(num_dias):
            for t in range(num_turnos):
                if (r, d, t) in x and x[r, d, t] > 0.5:
                    ciclo = (d - (r % 5)) % 5
                    data["Retén"].append(r)
                    data["Día"].append(d)
                    data["Turno"].append(t)
                    data["Ciclo"].append(ciclo)

    df = pd.DataFrame(data)

    # Exportar a CSV
    df.to_csv(archivo_salida, index=False)
    print(f"\n✅ Resultados exportados correctamente a {archivo_salida}")
