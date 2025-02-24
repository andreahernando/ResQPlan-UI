import pandas as pd

def mostrar_resultados(model, x, num_retenes, num_turnos):
    """ Muestra los resultados en formato tabla """
    data = []
    for r in range(num_retenes):
        fila = [r]
        for t in range(num_turnos):
            fila.append(int(x[r, t].x))
        data.append(fila)

    df = pd.DataFrame(data, columns=["Retén"] + [f"Turno {t}" for t in range(num_turnos)])
    print(df)
