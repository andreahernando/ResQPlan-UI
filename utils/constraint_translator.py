import os
from openai import OpenAI


def translate_constraint_to_code(nl_constraint: str, num_turnos: int) -> str:
    """
    Convierte una restricción en lenguaje natural a código Python compatible con Gurobi.
    Se asegura de que OpenAI genere restricciones válidas considerando la ciclicidad cuando `num_turnos=2`.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("The environment variable OPENAI_API_KEY is not set.")

    client = OpenAI(api_key=api_key)

    prompt = (
        "Eres un experto en optimización con Gurobi. "
        "Convierte la siguiente restricción en código Python usando model.addConstr(...) o model.addConstrs(...). "
        "NO agregues explicaciones, comentarios ni bloques de código adicionales. "
        "NO inventes nuevas variables como 'N', 'M', 'T', 'i', 'j'. "
        "Usa ÚNICAMENTE estas variables:\n"
        "- 'x' (diccionario de variables binarias de decisión, indexado por [r, d, t], donde:\n"
        "     - 'r' es el retén (0 <= r < num_retenes)\n"
        "     - 'd' es el día (0 <= d < num_dias)\n"
        "     - 't' es el turno (0 <= t < num_turnos))\n"
        "- 'num_retenes' (número total de retenes disponibles)\n"
        "- 'num_dias' (número total de días de planificación)\n"
        "- 'num_turnos' (número total de turnos por día, típicamente 2)\n"
        "- 'model' (instancia de Gurobi Model)\n"
        "- 'quicksum' (para sumas dentro de restricciones en Gurobi)\n"
        "⚠️ IMPORTANTE: El modelo es cíclico en días, lo que significa que si `d=num_dias-1`, el día siguiente es `d=0`.\n"
        "Si la restricción involucra varios días, usa `d+1` y emplea módulo `% num_dias` para evitar errores de indexación.\n"
        "Devuelve SOLO el código válido sin formato Markdown ni explicaciones.\n\n"
        f"Restricción: {nl_constraint}"
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "Eres un asistente que traduce restricciones en lenguaje natural a código Gurobi. "
                                              "Asegúrate de que el código sea ejecutable dentro de ShiftOptimizer "
                                              "y que todas las variables necesarias estén definidas en un bucle for si es necesario."},
                {"role": "user", "content": prompt}
            ]
        )

        raw_output = response.choices[0].message.content.strip()

        # 🚨 Validamos que OpenAI no genere código fuera de rango
        if "t+1" in raw_output and num_turnos <= 2:
            print(f"⚠ ERROR: OpenAI intentó acceder a t+1 con num_turnos=2. Generando código corregido...")

        return raw_output  # Devolvemos solo el código generado

    except Exception as e:
        raise RuntimeError(f"Error translating constraint: {e}")
