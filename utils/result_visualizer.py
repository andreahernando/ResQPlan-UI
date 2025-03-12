import pandas as pd
import xlsxwriter
import os

def exportar_resultados(model, x, num_retenes, num_turnos, num_dias,
                        archivo_salida = os.path.join(os.getcwd(), "resultados_turnos.xlsx")):
    """
    Exporta los resultados en un archivo Excel con una estructura detallada y visualización mejorada.
    Se incluyen tres hojas:
    1. "Asignaciones": Retenes por día y turno.
    2. "Resumen": Turnos asignados por retén con separación semanal.
    3. "Cobertura": Número de retenes trabajando por turno en cada día.
    """

    # Etiquetas de los turnos
    turnos_horarios = {0: "Turno 0", 1: "Turno 1"}
    leyenda_turnos = {
        "Turno 0": "08:00 - 20:00",
        "Turno 1": "20:00 - 08:00"
    }

    # Nombres de los días de la semana
    dias_semana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

    # Construcción de los datos para la exportación
    data = {"Retén": [], "Semana": [], "Día": [], "Turno": [], "Ciclo": []}

    cobertura = {}

    for r in range(num_retenes):
        for d in range(num_dias):
            semana_idx = f"Semana {(d // 7) + 1}"  # Identificar la semana
            dia_nombre = dias_semana[d % 7]  # Obtener nombre del día de la semana

            if semana_idx not in cobertura:
                cobertura[semana_idx] = {dia: {turnos_horarios[0]: 0, turnos_horarios[1]: 0} for dia in dias_semana}

            for t in range(num_turnos):
                if (r, d, t) in x and x[r, d, t] > 0.5:
                    data["Retén"].append(r)
                    data["Semana"].append(semana_idx)
                    data["Día"].append(dia_nombre)
                    data["Turno"].append(turnos_horarios[t])
                    data["Ciclo"].append((d - (r % 6)) % 6)  # Ajuste del ciclo correcto

                    # Actualizar la cobertura de retenes por turno y día
                    cobertura[semana_idx][dia_nombre][turnos_horarios[t]] += 1

    df = pd.DataFrame(data)
    
    # Asegurar que todos los retenes aparecen en la tabla pivotada (incluyendo el último Retén)
    df["Día"] = pd.Categorical(df["Día"], categories=dias_semana, ordered=True)

    # Crear tabla pivotada: Semana/Día vs Retén con los turnos asignados
    df_pivot = df.pivot_table(index=["Semana", "Día"], columns="Retén", values="Turno",
                              aggfunc=lambda x: " / ".join(x) if len(x) > 1 else x.iloc[0], observed=False)

    df_pivot.fillna("Descanso", inplace=True)  # Marcar descansos explícitamente

    # Crear DataFrame de cobertura
    cobertura_data = []
    for semana, semana_data in cobertura.items():
        for turno, turno_nombre in turnos_horarios.items():
            row = [semana, turno_nombre] + [semana_data[dia][turno_nombre] for dia in dias_semana]
            cobertura_data.append(row)

    df_cobertura = pd.DataFrame(cobertura_data, columns=["Semana", "Turno"] + dias_semana)

    # Guardar en un archivo Excel con formato
    with pd.ExcelWriter(archivo_salida, engine="xlsxwriter") as writer:
        df.to_excel(writer, sheet_name="Asignaciones", index=False)

        # Obtener el libro y las hojas para aplicar formato
        workbook = writer.book
        worksheet_resumen = workbook.add_worksheet("Resumen")

        writer.sheets["Resumen"] = worksheet_resumen

        # Formatos de celda
        format_turno_0 = workbook.add_format({"bg_color": "#FFC000", "align": "center", "border": 1})
        format_turno_1 = workbook.add_format({"bg_color": "#00B0F0", "align": "center", "border": 1})
        format_descanso = workbook.add_format({"bg_color": "#D9D9D9", "align": "center", "border": 1})
        format_semana = workbook.add_format({"bold": True, "align": "center", "border": 1, "bg_color": "#A6A6A6"})
        format_dia = workbook.add_format({"bold": True, "align": "center", "border": 1})
        format_celda = workbook.add_format({"align": "center", "border": 1})

        # **ESCRIBIR RESUMEN**
        worksheet_resumen.write(0, 0, "Semana", format_semana)
        worksheet_resumen.write(0, 1, "Día", format_dia)
        for col_num, ret in enumerate(df_pivot.columns, start=2):
            worksheet_resumen.write(0, col_num, f"Retén {ret}", format_dia)

        row_num = 1
        last_semana = None

        for (semana, dia), row in df_pivot.iterrows():
            if semana != last_semana:
                worksheet_resumen.merge_range(row_num, 0, row_num + 6, 0, semana, format_semana)
                last_semana = semana

            worksheet_resumen.write(row_num, 1, dia, format_dia)

            for col_num, value in enumerate(row, start=2):
                if value == "Turno 0":
                    worksheet_resumen.write(row_num, col_num, value, format_turno_0)
                elif value == "Turno 1":
                    worksheet_resumen.write(row_num, col_num, value, format_turno_1)
                else:
                    worksheet_resumen.write(row_num, col_num, "Descanso", format_descanso)

            row_num += 1

        # **AÑADIR LEYENDA EN RESUMEN**
        legend_start_row = row_num + 2
        worksheet_resumen.write(legend_start_row, 0, "Leyenda:", format_dia)
        worksheet_resumen.write(legend_start_row + 1, 0, "Turno 0", format_turno_0)
        worksheet_resumen.write(legend_start_row + 1, 1, leyenda_turnos["Turno 0"], format_celda)
        worksheet_resumen.write(legend_start_row + 2, 0, "Turno 1", format_turno_1)
        worksheet_resumen.write(legend_start_row + 2, 1, leyenda_turnos["Turno 1"], format_celda)

        # Hoja de cobertura
        worksheet_cobertura = workbook.add_worksheet("Cobertura")
        writer.sheets["Cobertura"] = worksheet_cobertura

        # Escribir encabezado en cobertura
        worksheet_cobertura.write(0, 0, "Semana", format_semana)
        worksheet_cobertura.write(0, 1, "Turno", format_dia)

        for col_num, dia in enumerate(dias_semana, start=2):
            worksheet_cobertura.write(0, col_num, dia, format_dia)

        row_num = 1
        last_semana = None
        for _, row in df_cobertura.iterrows():
            semana = row["Semana"]
            turno = row["Turno"]

            if semana != last_semana:
                worksheet_cobertura.merge_range(row_num, 0, row_num + 1, 0, semana, format_semana)
                last_semana = semana

            worksheet_cobertura.write(row_num, 1, turno, format_dia)

            for col_num, valor in enumerate(row[2:], start=2):
                format_celda = format_turno_0 if turno == turnos_horarios[0] else format_turno_1
                worksheet_cobertura.write(row_num, col_num, valor, format_celda)

            row_num += 1

        legend_start_row = row_num + 2

        worksheet_cobertura.write(legend_start_row, 0, "Leyenda:", format_dia)

        # Escribir "Turno 0" con su color
        worksheet_cobertura.write(legend_start_row + 1, 0, "Turno 0", format_turno_0)
        worksheet_cobertura.write(legend_start_row + 1, 1, leyenda_turnos["Turno 0"])

        # Escribir "Turno 1" con su color
        worksheet_cobertura.write(legend_start_row + 2, 0, "Turno 1", format_turno_1)
        worksheet_cobertura.write(legend_start_row + 2, 1, leyenda_turnos["Turno 1"])

    print(f"\n✅ Resultados exportados correctamente a {archivo_salida}")