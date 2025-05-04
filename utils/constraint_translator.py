import os
import json
import time
import config
from openai import OpenAI


def get_openai_client():
    """Inicializa y devuelve un cliente OpenAI."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("⚠️ La variable de entorno OPENAI_API_KEY no está configurada.")
    return OpenAI(api_key=api_key)


def extract_variables_from_context(context: str) -> dict:
    """
    A partir de un texto de gestión de turnos (colegio, hospital, emergencias, etc.) que incluye:
      - Descripción del problema (días, franjas horarias, objetivos).
      - Catálogo de recursos y roles (retenes, ambulancias, médicos, enfermeros, conductores, aulas, profesores, pacientes, etc.).
    Extrae y devuelve un JSON con tres campos:
      1) "variables": un diccionario obligatorio que contenga:
         - "dias": int (número de días del horizonte).
         - "franjas": int (número de franjas por día).
         - "horarios": lista de strings con intervalos de cada franja.
         - Cualquier otra lista de entidades relevantes (e.g., "lista_ambulancias", "lista_medicos", "lista_profesores").
      2) "resources": un diccionario que indique la cantidad disponible de cada recurso,
         por ejemplo: {"ambulancias": 3, "medicos": 5, "enfermeros": 4, "conductores": 6}.
      3) "decision_variables": un string con código Python (Gurobi) para definir "self.x",
         un dict comprehension cuyos índices recorren todas las colecciones extraídas en el orden:
         (cada lista de entidades, "dias", "franjas").
    ***Importante***: Devuelve **solo** el JSON resultado, sin explicaciones, comentarios o formato Markdown.
    """
    client = get_openai_client()
    prompt = (
        "Eres un ingeniero experto en modelos de programación lineal con Gurobi.\n"
        "Recibirás un texto que describe un problema de planificación de turnos "
        "(colegio, hospital, emergencias, etc.). El texto incluye:\n"
        " • Horizonte temporal (número de días, número de franjas y horarios).\n"
        " • Listas de entidades a asignar (retenes, profesores, médicos, ambulancias, etc.).\n"
        " • Cantidades de recursos disponibles.\n\n"

        "Debes construir un ÚNICO objeto JSON con TRES claves obligatorias:\n"
        "1) \"variables\"  ⇒ diccionario que contenga SIEMPRE:\n"
        "      - \"dias\"      : <int>,\n"
        "      - \"franjas\"   : <int>,\n"
        "      - \"horarios\"  : [<str>, ...]\n"
        "   además de una lista por cada entidad detectada, con nombre "
        "      'lista_<entidad_plural>' (p. ej. 'lista_retenes', 'lista_medicos').\n"
        "2) \"resources\"  ⇒ diccionario con la cantidad disponible de cada recurso "
        "(p. ej. {\"ambulancias\": 3, \"medicos\": 5, \"conductores\": 6}).\n"
        "3) \"decision_variables\"  ⇒ bloque de código Python **válido**, con una instrucción self.x_<nombre_recurso> por cada tipo de entidad (retenes, ambulancias, profesores, etc.)."
        "- Para cada entidad, declara una variable como\n"
        "      self.x = { (r, d, f): model.addVar(vtype=GRB.BINARY, name=f\"x_{r}_{d}_{f}\")\n"
        "                 for r in variables['lista_retenes']\n"
        "                 for d  in range(variables['dias'])\n"
        "                 for f  in range(variables['franjas']) }\n"
        "Crea una línea similar para cada recurso (p. ej., x_medico, x_ambulancia, etc.)."
        "   • No utilices bucles 'for:' sueltos fuera de la comprensión.\n"
        "   • Usa directamente 'model.addVar' y 'GRB.BINARY' (no 'self.model.GRB').\n"
        "   • El resultado de la comprensión debe ser un gurobipy.tupledict.\n"
        "   • Asegúrate de escribir saltos de línea REALES, no '\\n' escapados.\n\n"

        "Devuelve **solo** ese JSON, sin comentarios ni Markdown.\n\n"
        f"=== TEXTO DE ENTRADA ===\n{context}\n======================="
    )

    for attempt in range(config.MAX_ATTEMPTS):
        try:
            resp = client.chat.completions.create(
                model="o3-mini",
                messages=[{"role":"user","content":prompt}]
            )
            content = resp.choices[0].message.content.strip()
            data = json.loads(content)
            # Validaciones básicas
            if not all(k in data for k in ('variables','resources','decision_variables')):
                raise ValueError("El JSON de salida no tiene las claves requeridas.")
            vars_dict = data['variables']
            for key in ('dias','franjas','horarios'):
                if key not in vars_dict:
                    raise ValueError(f"Falta la variable obligatoria '{key}' en 'variables'.")
            return data
        except json.JSONDecodeError as e:
            print(f"❌ JSON inválido intento {attempt+1}: {e}")
        except Exception as e:
            print(f"⚠️ Error en intento {attempt+1}: {e}")
            time.sleep(1)
    raise RuntimeError("❌ No se pudo extraer variables y recursos tras múltiples intentos.")


def translate_constraint_to_code(nl_constraint: str, specs: dict) -> str:
    """
    Traduce una restricción en lenguaje natural a código Python Gurobi:
      - specs es el JSON producido por extract_variables_from_context,
        e incluye tanto 'variables' como 'resources'.
      - Usa 'model.addConstr(...)'. Si la forma es 'lb <= expr <= ub', divides en dos llamadas.
      - Usa 'quicksum' para sumatorios.
      - Nombra cada restricción con 'name=' en snake_case derivado de la propia restricción.
      - Refierete siempre a las variables de decisión usando 'x[(...)]' en el orden de índices definido.
    Devuelve sólo el bloque de código ejecutable, sin explicaciones ni formato adicional.
    """
    client = get_openai_client()
    prompt = (
        "Eres un experto en optimización con Gurobi.\n"
        "Tienes disponible un JSON 'specs' con las claves 'variables' y 'resources':\n"
        f"{json.dumps(specs, indent=2)}\n"
        "Ten en cuenta que el JSON se estrcutura de esta manera:\n"
        "1) \"variables\"  ⇒ diccionario que contenga SIEMPRE:\n"
        "      - \"dias\"      : <int>,\n"
        "      - \"franjas\"   : <int>,\n"
        "      - \"horarios\"  : [<str>, ...]\n"
        "   además de una lista por cada entidad detectada, con nombre "
        "      'lista_<entidad_plural>' (p. ej. 'lista_retenes', 'lista_medicos').\n"
        "2) \"resources\"  ⇒ diccionario con la cantidad disponible de cada recurso "
        "(p. ej. {\"ambulancias\": 3, \"medicos\": 5, \"conductores\": 6}).\n"
        "3) \"decision_variables\"  ⇒ bloque de código Python **válido**, con una instrucción x_<nombre_recurso> por cada tipo de entidad (retenes, ambulancias, profesores, etc.)."
        f"Genera el código Python válido que implemente la siguiente restricción:\n{nl_constraint}\n"
        "Requisitos:\n"
        "- Usa model.addConstr().\n"
        "- Si lb <= expr <= ub, crea dos restricciones separadas.\n"
        "- Usa quicksum para sumas.\n"
        "- Nombra cada restricción con name=''.\n"
        "- Accede a las variables a través de 'specs[\"variables\"]', por ejemplo: specs['variables']['dias'], y usa los nombres adecuados como 'x_retenes' o 'x_conductores'.\n"
        "- Refierete a las variables de decisión usando los nombres separados por tipo, como 'x_retenes[(r, d, f)]', 'x_conductores[(r, d, f)]', etc., según el tipo de recurso correspondiente.\n"
        "Devuelve SOLO el código, sin explicaciones ni Markdown."
    )
    for attempt in range(config.MAX_ATTEMPTS):
        try:
            resp = client.chat.completions.create(
                model="o3-mini",
                messages=[{"role":"user","content":prompt}]
            )
            code = resp.choices[0].message.content.strip()
            compile(code, '<string>', 'exec')
            return code
        except Exception as e:
            print(f"⚠️ Error traducción intento {attempt+1}: {e}")
            time.sleep(1)
    raise RuntimeError("❌ No se pudo traducir la restricción tras múltiples intentos.")
