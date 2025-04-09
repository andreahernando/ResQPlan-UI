import pandas as pd
import os


def exportar_resultados(model, decision_vars, variables, archivo_salida=None):
    """
    Exporta la solución del modelo a un archivo Excel con dos hojas:
      1. "Detalle": Lista detallada de asignaciones (por entidad, día y turno).
      2. "Resumen": Cuadrícula de horario (filas: turnos, columnas: días),
         donde se agregan las asignaciones en caso de duplicados.

    La función es genérica y se adapta a los parámetros ingresados en el problema, usando las etiquetas definidas
    (por ejemplo, "nombre_entidad", "nombres_dias").
    """

    # Set default output file name if not provided
    if archivo_salida is None:
        archivo_salida = os.path.join(os.getcwd(), "resultados_turnos.xlsx")

    # Extract parameters from the dictionary
    params = variables["variables"]
    dias = int(params.get("dias", 0))

    # Determine number of shifts (using 'num_turnos' or 'franjas')
    if "num_turnos" in params:
        num_shifts = int(params["num_turnos"])
        if isinstance(params.get("horarios"), list):
            shift_labels = {i: params["horarios"][i] for i in range(len(params["horarios"]))}
        elif isinstance(params.get("horarios"), dict):
            keys = sorted(params["horarios"].keys())
            num_shifts = len(keys)
            shift_labels = {i: params["horarios"][key] for i, key in enumerate(keys)}
        else:
            shift_labels = {i: f"Turno {i}" for i in range(num_shifts)}
    elif "franjas" in params:
        if isinstance(params["franjas"], list):
            num_shifts = len(params["franjas"])
        else:
            num_shifts = int(params["franjas"])
        if isinstance(params.get("horarios"), list):
            shift_labels = {i: params["horarios"][i] for i in range(len(params["horarios"]))}
        else:
            shift_labels = {i: f"Franja {i}" for i in range(num_shifts)}
    elif "num_franjas" in params:
        if isinstance(params["num_franjas"], list):
            num_shifts = len(params["num_franjas"])
        else:
            num_shifts = int(params["num_franjas"])
        if isinstance(params.get("horarios"), list):
            shift_labels = {i: params["horarios"][i] for i in range(len(params["horarios"]))}
        else:
            shift_labels = {i: f"Franja {i}" for i in range(num_shifts)}
    else:
        num_shifts = 0
        shift_labels = {}

    # Determine number of entities from decision_vars (assuming keys (e, d, t))
    if decision_vars:
        num_entities = max(key[0] for key in decision_vars.keys()) + 1
    else:
        num_entities = 0

    # Use entity name defined in variables or default value
    entity_label = params.get("nombre_entidad", "Entidad")

    # Define day names: use "nombres_dias" if provided, else generate default values
    if "nombres_dias" in params and isinstance(params["nombres_dias"], list):
        day_labels = {i: params["nombres_dias"][i] for i in range(len(params["nombres_dias"]))}
    else:
        day_labels = {i: f"Día {i + 1}" for i in range(dias)}

    # Build detailed list of assignments using the optimal solution
    detalle = {entity_label: [], "Día": [], "Turno": []}
    count = 0
    for e in range(num_entities):
        for d in range(dias):
            for s in range(num_shifts):
                if (e, d, s) in decision_vars and decision_vars[(e, d, s)].X > 0.5:
                    detalle[entity_label].append(e)
                    detalle["Día"].append(day_labels.get(d, f"Día {d + 1}"))
                    detalle["Turno"].append(shift_labels.get(s, f"Turno {s}"))
                    count += 1
    print("Número de asignaciones encontradas:", count)

    df_detalle = pd.DataFrame(detalle)

    # Create a pivoted table for the schedule summary
    if not df_detalle.empty:
        df_resumen = df_detalle.pivot_table(index="Turno", columns="Día", values=entity_label,
                                            aggfunc=lambda x: " / ".join(map(str, x)))
        df_resumen.fillna("Descanso", inplace=True)
    else:
        df_resumen = pd.DataFrame()

    # Export to Excel with two sheets: "Detalle" and "Resumen"
    with pd.ExcelWriter(archivo_salida, engine="xlsxwriter") as writer:
        df_detalle.to_excel(writer, sheet_name="Detalle", index=False)
        df_resumen.to_excel(writer, sheet_name="Resumen")

        workbook = writer.book
        header_format = workbook.add_format({"bold": True, "bg_color": "#D9EAD3", "border": 1})
        cell_format = workbook.add_format({"border": 1})
        descanso_format = workbook.add_format({"bg_color": "#F4CCCC", "border": 1})

        worksheet_detalle = writer.sheets["Detalle"]
        for col_num, value in enumerate(df_detalle.columns.values):
            worksheet_detalle.write(0, col_num, value, header_format)
            worksheet_detalle.set_column(col_num, col_num, 20)

        worksheet_resumen = writer.sheets["Resumen"]
        for col_num, value in enumerate(df_resumen.columns.values):
            worksheet_resumen.write(0, col_num + 1, value, header_format)
            worksheet_resumen.set_column(col_num + 1, col_num + 1, 20)

        for row_num, value in enumerate(df_resumen.index.values):
            worksheet_resumen.write(row_num + 1, 0, value, header_format)

        for row in range(df_resumen.shape[0]):
            for col in range(df_resumen.shape[1]):
                cell_value = df_resumen.iloc[row, col]
                format_to_apply = cell_format if cell_value != "Descanso" else descanso_format
                worksheet_resumen.write(row + 1, col + 1, cell_value, format_to_apply)

    print(f"\n✅ Resultados exportados correctamente a {archivo_salida}")
