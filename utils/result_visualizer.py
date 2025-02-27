import pandas as pd


def exportar_resultados(model, x, num_retenes, num_turnos, num_dias,
                        archivo_salida="C:/Users/cynth/Documents/Cuarto año GCID/TFG/resultados_turnos.xlsx"):
    """
    Exporta los resultados en un archivo Excel con una estructura detallada y visualización mejorada.
    Se incluye una hoja con la asignación detallada y otra con un resumen por día y retén.
    """

    # Etiquetas de los turnos con sus horarios
    turnos_horarios = {0: "Turno 0 (08:00 - 20:00)", 1: "Turno 1 (20:00 - 08:00)"}

    # Nombres de los días de la semana en orden correcto
    dias_semana = {0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"}

    # Construcción de los datos para la exportación
    data = {"Retén": [], "Día": [], "Turno": [], "Ciclo": []}

    for r in range(num_retenes):
        for d in range(num_dias):
            for t in range(num_turnos):
                if (r, d, t) in x and x[r, d, t] > 0.5:
                    ciclo = (d - (r % 6)) % 6  # Ajuste del ciclo correcto
                    data["Retén"].append(r)
                    data["Día"].append(dias_semana[d % 7])  # Asignar el día correctamente
                    data["Turno"].append(turnos_horarios[t])
                    data["Ciclo"].append(ciclo)

    df = pd.DataFrame(data)

    # Asegurar el orden correcto de los días en la tabla pivotada
    df["Día"] = pd.Categorical(df["Día"], categories=dias_semana.values(), ordered=True)

    # Crear una tabla pivotada para mejorar la visualización: Día vs Retén con los turnos asignados
    df_pivot = df.pivot(index="Día", columns="Retén", values="Turno")
    df_pivot = df_pivot.astype(str)  # Convertir a string para evitar conflicto con "Descanso"
    df_pivot.fillna("Descanso", inplace=True)  # Marcar descansos explícitamente

    # Guardar en un archivo Excel con formato
    with pd.ExcelWriter(archivo_salida, engine="xlsxwriter") as writer:
        df.to_excel(writer, sheet_name="Asignaciones", index=False)
        df_pivot.to_excel(writer, sheet_name="Resumen")

        # Obtener el libro y la hoja de resumen para aplicar formato
        workbook = writer.book
        worksheet = writer.sheets["Resumen"]

        # Ajustar el ancho de las columnas para mejor visibilidad
        for i, col in enumerate(df_pivot.columns):
            worksheet.set_column(i + 1, i + 1, 18)  # Ajustar ancho de columnas

        # Definir formato para los turnos y descansos
        format_turno_0 = workbook.add_format({"bg_color": "#FFC000", "align": "center", "border": 1})
        format_turno_1 = workbook.add_format({"bg_color": "#00B0F0", "align": "center", "border": 1})
        format_descanso = workbook.add_format({"bg_color": "#D9D9D9", "align": "center", "border": 1})

        # Aplicar formato de colores a los turnos
        for row in range(1, len(df_pivot) + 1):
            for col in range(1, len(df_pivot.columns) + 1):
                cell_value = df_pivot.iloc[row - 1, col - 1]
                if cell_value == turnos_horarios[0]:
                    worksheet.write(row, col, cell_value, format_turno_0)
                elif cell_value == turnos_horarios[1]:
                    worksheet.write(row, col, cell_value, format_turno_1)
                else:
                    worksheet.write(row, col, "Descanso", format_descanso)

    print(f"\n✅ Resultados exportados correctamente a {archivo_salida}")
