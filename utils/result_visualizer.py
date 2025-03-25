import pandas as pd
import os


def exportar_resultados(model, decision_vars, variables, archivo_salida=None):
    """
    Exporta la solución del modelo a un archivo Excel con dos hojas:
      1. "Detalle": Lista detallada de asignaciones (por entidad, día y turno).
      2. "Resumen": Cuadrícula de horario (filas: días, columnas: entidades),
         donde se agregan las asignaciones en caso de duplicados.

    La función es genérica y se adapta a los parámetros ingresados en el problema,
    usando las etiquetas definidas (por ejemplo, "nombre_entidad", "nombres_dias").
    """
    if archivo_salida is None:
        archivo_salida = os.path.join(os.getcwd(), "resultados_turnos.xlsx")

    # Extraer parámetros desde el diccionario
    params = variables["variables"]
    dias = int(params.get("dias", 0))

    # Determinar el número de turnos (usando 'num_turnos' o 'franjas')
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
    else:
        num_shifts = 0
        shift_labels = {}

    # Determinar el número de entidades a partir de decision_vars (suponiendo claves (e, d, t))
    if decision_vars:
        num_entities = max(key[0] for key in decision_vars.keys()) + 1
    else:
        num_entities = 0
    # Usar el nombre definido en las variables o un valor por defecto
    entity_label = params.get("nombre_entidad", "Entidad")

    # Definir nombres de días: si se provee una lista en "nombres_dias", usarla; de lo contrario, generar valores por defecto.
    if "nombres_dias" in params and isinstance(params["nombres_dias"], list):
        day_labels = {i: params["nombres_dias"][i] for i in range(len(params["nombres_dias"]))}
    else:
        day_labels = {i: f"Día {i + 1}" for i in range(dias)}

    # Construir la lista detallada de asignaciones usando la solución óptima
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

    # Crear una tabla pivotada para el resumen. Usamos pivot_table para manejar duplicados.
    if not df_detalle.empty:
        df_resumen = df_detalle.pivot_table(index="Día", columns=entity_label, values="Turno",
                                            aggfunc=lambda x: " / ".join(x))
        df_resumen.fillna("Descanso", inplace=True)
    else:
        df_resumen = pd.DataFrame()

    # Exportar a Excel con dos hojas: "Detalle" y "Resumen"
    with pd.ExcelWriter(archivo_salida, engine="xlsxwriter") as writer:
        df_detalle.to_excel(writer, sheet_name="Detalle", index=False)
        if not df_resumen.empty:
            df_resumen.to_excel(writer, sheet_name="Resumen")

    print(f"\n✅ Resultados exportados correctamente a {archivo_salida}")
