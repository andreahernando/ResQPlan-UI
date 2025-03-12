import os
from openai import OpenAI
import gurobipy as gp

def translate_constraint_to_code(nl_constraint: str, num_turnos: int) -> str:
    """
    Convierte una restricción en lenguaje natural a código Python compatible con Gurobi.
    """

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("The environment variable OPENAI_API_KEY is not set.")

    client = OpenAI(api_key=api_key)

    prompt = (
        "Eres un experto en optimización con Gurobi. "
        "Convierte la siguiente restricción en código Python usando model.addConstr(...). "
        "NO agregues explicaciones, comentarios ni bloques de código adicionales. "
        "Usa ÚNICAMENTE estas variables:\n"
        "- 'd' (diccionario de variables binarias de decisión, indexado por [r, d, t], donde:\n"
        "     - 'r' es el retén (0 <= r < num_retenes)\n"
        "     - 'n' es el día (0 <= n < dias)\n"
        "     - 't' es el turno (0 <= t < num_turnos))\n"
        "- 'num_retenes' (número total de retenes disponibles)\n"
        "- 'dias' (número total de días de planificación)\n"
        "- 'num_turnos' (número total de turnos por día, típicamente 2)\n"
        "- 'model' (instancia de Gurobi Model)\n"
        "- 'quicksum' (para sumas dentro de restricciones en Gurobi)\n"
        "⚠️ IMPORTANTE: Si la restricción involucra número mínimo o máximo de retenes, **debes usar `min_retenes` o `max_retenes` en lugar de `num_retenes`**.\n"
        "⚠️ NO modifiques el nombre de 'num_dias', 'num_turnos' o 'model'.\n"
        "⚠️ NO uses model.addConstrs(), usa solo model.addConstr() dentro de un bucle for.\n"
        "Devuelve SOLO el código válido sin formato Markdown ni explicaciones, es decir sin lo de ```python (ni al principio ni esas comillas al final).\n\n"
        f"Restricción: {nl_constraint}"
    )

    try:
        response = client.chat.completions.create(
            model="o3-mini",
            messages=[
                {"role": "system", "content": "Eres un asistente que traduce restricciones en lenguaje natural a código Gurobi. "
                                              "Asegúrate de que el código sea ejecutable dentro de ShiftOptimizer "
                                              "y que todas las variables necesarias estén bien referenciadas en 'model.d'."},
                {"role": "user", "content": prompt}
            ]
        )

        raw_output = response.choices[0].message.content.strip()
        return raw_output

    except Exception as e:
        raise RuntimeError(f"Error translating constraint: {e}")
