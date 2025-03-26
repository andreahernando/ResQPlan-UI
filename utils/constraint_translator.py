import os
import json
from openai import OpenAI
import config
import time

def extract_variables_from_context(context: str) -> dict:
    """
    Extrae variables clave y genera las variables de decisión en formato Gurobi.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("The environment variable OPENAI_API_KEY is not set.")

    client = OpenAI(api_key=api_key)

    prompt = (
        "A partir de la siguiente descripción de un problema de planificación de turnos, "
        "extrae las variables clave necesarias para definir el modelo matemático. "
        "Además, genera las variables de decisión en código Python usando Gurobi. "
        "Devuelve la respuesta ÚNICAMENTE en formato JSON sin explicaciones. "
        "Ejemplo de salida:\n"
        '{\n  "variables": {\n    "num_retenes": 22,\n    "dias": 7,\n    "num_turnos": 2,\n    "horarios": ["08:00-20:00", "20:00-08:00"]\n  },\n'
        '  "decision_variables": "self.d = {(r, d, t): self.model.addVar(vtype=GRB.BINARY, name=f\'d_{r}_{d}_{t}\') for r in range(self.num_retenes) for d in range(self.dias) for t in range(self.num_turnos)}"\n}'
        f"\n\nDescripción del problema: {context}"
    )

    try:
        response = client.chat.completions.create(
            model="o3-mini",
            messages=[{"role": "user", "content": prompt}]
        )
        extracted_data = response.choices[0].message.content.strip()

        # Convertir JSON a diccionario de manera segura
        result = json.loads(extracted_data)

        return result  # Devuelve tanto variables como el código de variables de decisión

    except json.JSONDecodeError as json_err:
        raise RuntimeError(f"Error parsing JSON response: {json_err}\nResponse received: {extracted_data}")
    except Exception as e:
        raise RuntimeError(f"Error extracting variables: {e}")


def translate_constraint_to_code(nl_constraint: str, variables: dict) -> str:
    """
    Convierte una restricción en lenguaje natural a código Python compatible con Gurobi,
    usando las variables extraídas previamente.
    Implementa un mecanismo de reintentos en caso de que el código generado sea inválido.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("The environment variable OPENAI_API_KEY is not set.")

    client = OpenAI(api_key=api_key)

    # Convertimos las variables en un formato comprensible para el prompt
    variables_str = json.dumps(variables, indent=2)

    prompt = (
        "Eres un experto en optimización con Gurobi. "
        "Convierte la siguiente restricción en código Python usando model.addConstr(...). "
        "NO agregues explicaciones, comentarios ni bloques de código adicionales. "
        f"Las variables disponibles en este problema son:\n{variables_str}\n\n"
        "Usa ÚNICAMENTE estas variables en tu respuesta.\n"
        "Recuerda que las variables de decisión se han definido utilizando el alias 'd_vars' y se han creado con la notación d_vars[(r, d, t)], donde:\n"
        "  - el primer índice (r) corresponde a la primera dimensión y toma valores de 0 hasta (cantidad - 1),\n"
        "  - el segundo índice (d) corresponde a la segunda dimensión y toma valores de 0 hasta (cantidad - 1),\n"
        "  - el tercer índice (t) corresponde a la tercera dimensión y toma valores de 0 hasta (cantidad - 1).\n"
        "Genera el código usando exactamente ese orden de índices, sin invertirlos ni sumar 1 a los rangos.\n"
        "No uses gp.quicksum solo quicksum.\n"
        "Devuelve SOLO el código válido sin formato Markdown ni explicaciones.\n\n"
        f"Restricción: {nl_constraint}"
    )

    max_attempts = config.MAX_ATTEMPTS  # Usamos la constante definida en config.py
    attempt = 0
    while attempt < max_attempts:
        try:
            response = client.chat.completions.create(
                model="o3-mini",
                messages=[{"role": "user", "content": prompt}]
            )
            raw_output = response.choices[0].message.content.strip()

            # Validación básica: intentar compilar el código para ver si es sintácticamente correcto.
            compile(raw_output, "<string>", "exec")

            # Si compila sin errores, retornamos el código.
            return raw_output
        except Exception as e:
            attempt += 1
            print(f"Attempt {attempt} failed with error: {e}. Retrying...")
            time.sleep(1)  # Pequeña pausa antes del siguiente intento

    raise RuntimeError("Failed to translate the constraint after multiple attempts.")