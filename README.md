# ResQPlan

ResQPlan es una herramienta web para la planificación de turnos en distintos sectores: hospitales, servicios de bomberos, escuelas (horarios escolares), retenes, empresas de seguridad, empresas de transporte, entre otros. Permite al usuario describir en lenguaje natural su problema de turnos —ya sean guardias médicas, clases, patrullajes o cuadrantes operativos—, extraer automáticamente las variables y restricciones, traducirlas al modelo de Gurobi y generar horarios óptimos. Además, ofrece una interfaz visual intuitiva para gestionar proyectos, configurar restricciones específicas y descargar los resultados en formato Excel.
##  Características principales

* Extracción automática de variables y recursos desde un texto en lenguaje natural mediante la API de OpenAI.
* Traducción de restricciones en lenguaje natural a código Python válido para Gurobi.
* Creación dinámica de variables de decisión en Gurobi según el contexto detectado.
* Validación y activación/desactivación de restricciones desde la interfaz web.
* Optimización con Gurobi, detección de inviabilidad (IIS) y relajación automática de restricciones.
* Exportación de resultados a un archivo Excel con formato y colores para identificar descansos.
* Gestión de proyectos: creación, carga, actualización y eliminación, con persistencia en MongoDB.

## 🛠️ Tecnologías utilizadas

* **Backend**:
  * Python 3.x
  * Flask: framework web.
  * Flask-PyMongo: conexión con MongoDB para persistencia de proyectos.
  * Gurobi (versión compatible): solver de optimización.
  * OpenAI Python SDK: para llamadas a la API de ChatGPT y extracción/traducción.
  * pandas y XlsxWriter: para generación del archivo Excel de resultados.
* **Base de datos**:

  * MongoDB: almacena proyectos, variables y restricciones.
* **Frontend**:

  * HTML/CSS/JavaScript: interfaz de usuario.
  * Font Awesome: íconos.

## 📁 Estructura del proyecto

```
.
├── main.py                      # Punto de entrada de la aplicación Flask
├── config.py                    # Configuración global (p. ej. MAX_ATTEMPTS)
├── web/
│   ├── templates/               # Plantillas HTML de Flask
│   │   ├── index.html           # Página principal para ingresar contexto y restricciones
│   │   ├── results.html         # Página para mostrar resultados de optimización
│   └── static/                  # Archivos estáticos (JS, CSS, fuentes, etc.)
│       ├── script.js            # Lógica del frontend para interacción con la API
│       ├── results.js           # Lógica para mostrar resultados y descargar Excel
│       ├── styles.css           # Estilos principales
│       └── results.css          # Estilos de la página de resultados
├── models/
│   └── shift_optimizer.py       # Clase ShiftOptimizer: definición del modelo, validación y optimización
├── utils/
│   ├── constraint_translator.py # Funciones extract_variables_from_context y translate_constraint_to_code
│   └── result_visualizer.py     # Función exportar_resultados para generar el Excel
├── requirements.txt             # Dependencias de Python
└── README.md                    # Documentación de este proyecto
```

## 📦 Instalación

1. **Clonar el repositorio**:

   ```bash
   git clone https://github.com/andreahernando/ResQPlan-UI.git
   cd ResQPlan-UI
   ```

2. **Crear y activar un entorno virtual (opcional pero recomendado)**:

   ```bash
   python3 -m venv venv
   source venv/bin/activate   # En Linux/Mac
   venv\\Scripts\\activate    # En Windows
   ```

3. **Instalar dependencias**:

   ```bash
   pip install -r requirements.txt
   ```

4. **Configuración de variables de entorno**:

   * Definir la variable `OPENAI_API_KEY` con tu clave de API de OpenAI.
   * Asegurarse de tener Gurobi instalado y configurada la licencia.

5. **Iniciar MongoDB localmente** (por defecto se conecta a `mongodb://localhost:27017/resqplan`).

6. **Ejecutar la aplicación**:

   ```bash
   python main.py
   ```

   La aplicación se iniciará en `http://127.0.0.1:5000/`.

## 🔍 Descripción de los módulos

### 1. `main.py`

* Configura la aplicación Flask, establece la URI de MongoDB y registra el blueprint de rutas.
* Inicializa `Flask-PyMongo` para la conexión con la base de datos.
* Lanza el servidor en modo `debug`.

### 2. `web/routes.py`

Define las rutas de la API REST y las vistas HTML:

* **Páginas HTML**:

  * `/` → `index.html`: Interfaz principal donde el usuario ingresa el contexto en lenguaje natural y agrega restricciones.
  * `/results` → `results.html`: Muestra un resumen de la solución y permite descargar el Excel.
* **Gestión de proyectos**:

  * `GET /api/projects`: Lista todos los proyectos almacenados en MongoDB.
  * `POST /api/projects`: Crea un nuevo proyecto, guardando contexto, variables, restricciones y estado de Gurobi.
  * `GET /api/projects/<pid>`: Carga un proyecto existente, reconstruye el modelo en backend y restaura restricciones.
  * `PUT /api/projects/<pid>`: Actualiza campos de un proyecto (nombre, contexto, restricciones, variables y estado de Gurobi).
  * `DELETE /api/projects/<pid>`: Elimina un proyecto de la base de datos.
* **Extracción y traducción**:

  * `POST /api/translate`: Recibe texto en lenguaje natural; llama a `extract_variables_from_context` para generar el JSON de variables y restricciones detectadas. Guarda el resultado en sesión y crea una instancia de `ShiftOptimizer`.
  * `POST /api/convert`: Recibe una restricción en lenguaje natural; llama a `translate_constraint_to_code` para obtener el bloque de código Python de Gurobi. Valida la restricción con `ShiftOptimizer.validar_restriccion`. Si es válida, la agrega al modelo y la guarda en la base de datos.
  * `POST /api/edit_constraint`: Edita una restricción previamente validada. Traduce la nueva descripción, la valida y reemplaza en el modelo.
  * `POST /api/delete_constraint`: Elimina una restricción de la sesión, el modelo y la base de datos.
  * `POST /api/view_constraint`: Devuelve el código Gurobi asociado a una restricción validada.
* **Optimización**:

  * `POST /api/optimize`: Activa/desactiva restricciones según la selección del usuario, llama a `ShiftOptimizer.optimizar()`, devuelve el estado y la solución (variables activas). Genera el Excel con `exportar_resultados`.
* **Descarga de resultados**:

  * `GET /api/download_excel`: Devuelve el archivo `resultados_turnos.xlsx` generado tras la optimización.

### 3. `utils/constraint_translator.py`

* **`extract_variables_from_context(context: str) -> dict`**:

  * Envía un prompt detallado a la API de OpenAI (modelo `o3-mini`) con la descripción del problema de turnos en lenguaje natural.
  * Recibe un JSON que contiene:

    * `variables`: diccionario con `dias`, `franjas`, `horarios` y listas de entidades (p. ej. `lista_retenes`, `lista_medicos`).
    * `resources`: diccionario con la cantidad disponible de cada recurso.
    * `decision_variables`: bloque de código Python (comprensiones) para crear las variables de decisión en Gurobi.
    * `detected_constraints` (opcional): lista de oraciones que parecen restricciones.
  * Valida que el JSON tenga las claves obligatorias. Si no es un problema de turnos, devuelve `{ "error": ... }`.
  * Regresa el objeto `specs` con esas claves.

* **`translate_constraint_to_code(nl_constraint: str, specs: dict) -> str`**:

  * Recibe una descripción natural de una restricción y el JSON `specs` (variables y recursos).
  * Envía un prompt a OpenAI para traducir esa restricción a código Python con llamadas a `model.addConstr()`.
  * Si la traducción inicial falla (código inválido), reintenta hasta `MAX_ATTEMPTS`, pidiendo correcciones a OpenAI.
  * Devuelve sólo el bloque de código ejecutable (o `{ "error": ... }` si no aplica la restricción).

### 4. `models/shift_optimizer.py`

Clase **`ShiftOptimizer`** que encapsula la lógica de creación de modelo, manejo de restricciones y ejecución de la optimización:

1. **Constructor (`__init__(specs: dict)`)**:

   * Recibe `specs` (el JSON resultante de `extract_variables_from_context`).
   * Almacena internamente `_dv_code_str` con el bloque de creación de variables de decisión.
   * Compila ese código en `_compile_dv_code()` para ejecución posterior.
   * Construye el contexto base `_build_base_exec_context()`, que contiene:

     * `model`, `GRB`, `quicksum`, bibliotecas de Gurobi.
     * `specs`, `variables` (lista de entidades, días, franjas, horarios).
     * `resources`.
     * Todas las listas detectadas como variables separadas.
   * Inicializa diccionarios para mapear nombres de restricciones y sus descripciones.
   * Llama a `reset_model()` para construir el modelo vacío y crear las variables de decisión.

2. **`reset_model()`**:

   * Crea un nuevo `Model` de Gurobi.
   * Asigna el `model` al contexto de ejecución.
   * Ejecuta el código compilado de `decision_variables`, generando todas las variables `x_recurso[...]` (un `tupledict`).
   * Reúne todas las variables `x_…` en `self.decision_vars` para facilitar su manejo.
   * Sobreescribe `self.exec_context["x"] = self.decision_vars` para acceso uniforme.
   * Actualiza el modelo y muestra cuántas variables se han creado.

3. **`validar_restriccion(nl: str, code: str) -> bool`**:

   * Construye un modelo temporal para probar el bloque de código de la restricción.
   * Ejecuta el código en un contexto similar al principal (variables y recursos cargados).
   * Si se crean nuevas restricciones (detectando nombres en Gurobi), asocia el nombre generado con la descripción natural en `name_to_nl`.
   * Guarda en `restricciones_validadas[nl]` la estructura `{ "code": <bloque>, "activa": True, "names": [<nombres Gurobi>] }`.
   * Si falla, reintenta solicitando a OpenAI una corrección automática hasta `config.MAX_ATTEMPTS` veces.

4. **`agregar_restriccion(nl: str) -> bool`**:

   * Si la restricción ya está validada en `restricciones_validadas` y está marcada como activa, ejecuta el bloque de código (`exec(info["code"], context)`) en el modelo principal.
   * Detecta qué restricciones nuevas se agregaron y actualiza los mapeos `nl_to_constr_names` y `name_to_nl`.
   * Retorna `True` si la agregación fue exitosa.

5. **`optimizar()`**:

   * Llama a `reset_model()` para reconstruir el modelo desde cero.
   * Recorre todas las restricciones validadas y con `activa=True`, ejecuta sus bloques de código para agregarlas.
   * Configura parámetros de Gurobi (unos hilos, desactivación de presolve).
   * Llama a `model.optimize()` y lee el `status`.
   * Si el estado es **ÓPTIMO** o **SUBÓPTIMO**, muestra el valor del objetivo y las variables activadas (`X > 0.5`).
   * Si es **INVIABLE** o **INCONSTANTE/UNBOUNDED**, solicita el IIS (`model.computeIIS()`), muestra las restricciones involucradas y luego aplica `feasRelaxS()` para relajar el modelo.

     * Si tras relajar se obtiene solución óptima, muestra las restricciones que se relajaron y su holgura.
     * Devuelve un diccionario con `status`, `objective` y `relaxed_constraints`.
   * En otros estados (parado, interrupción), informa el estado.

6. **Métodos adicionales**:

   * **`_imprimir_decision_vars()`**: muestra por consola las variables de decisión activadas y traduce índices a nombres legibles.
   * **`editar_restriccion(old_nl, new_nl)`**: crea código para la nueva descripción, valida, reemplaza la entrada en `restricciones_validadas` y mantiene el estado de activación.

### 5. `utils/result_visualizer.py`

* **`exportar_resultados(model, decision_vars, variables, archivo_salida=None)`**:

  * Construye un diccionario inverso `reverse_map` para detectar a qué lista pertenece cada entidad.
  * Recorre `decision_vars` y, cuando `var.X > 0.5`, extrae el día (nombre) y la franja horaria, agrupando los elementos asignados.
  * Genera un `DataFrame` con columnas `Día`, `Turno` y `Elementos`.
  * Crea una tabla resumen agrupada por `Turno` y `Día`. Si no hay información, genera un `DataFrame` vacío.
  * Utiliza `pandas.ExcelWriter` y `xlsxwriter` para:

    * Escribir la hoja `Resumen` con formato en encabezados (fondo verde claro) y celdas (borde). Las celdas donde el valor sea "Descanso" reciben un color rojo claro.
    * Ajusta anchos de columna y estilos de celdas.
  * Guarda el archivo en `resultados_turnos.xlsx` (o en la ruta que se le indique) y muestra por consola la ruta de salida.

## 🧪 Ejemplo de uso

A continuación se muestra un flujo mínimo para usar las funciones en un script independiente (sin interfaz web):

```python
from utils.constraint_translator import extract_variables_from_context, translate_constraint_to_code
from models.shift_optimizer import ShiftOptimizer
from utils.result_visualizer import exportar_resultados

# 1) Definir el problema en lenguaje natural:
texto_problema = (
    "Trabajar en un hospital durante 7 días consecutivos con 3 franjas diarias: mañana, tarde y noche. "
    "Disponemos de 5 médicos y 3 enfermeros. Cada médico debe descansar al menos 2 franjas por semana. "
    "Ningún enfermero puede trabajar más de 40 horas semanales."
)

# 2) Extraer variables y recursos:
specs = extract_variables_from_context(texto_problema)

# 3) Crear el optimizador:
optimizer = ShiftOptimizer(specs)

# 4) Traducir y validar restricciones adicionales:
nl1 = "Cada médico descansa al menos 2 franjas por semana"
code1 = translate_constraint_to_code(nl1, specs)
if isinstance(code1, str):
    if optimizer.validar_restriccion(nl1, code1):
        optimizer.agregar_restriccion(nl1)

# (Repetir para otras restricciones...)

# 5) Ejecutar optimización:
optimizer.optimizar()

# 6) Exportar resultados a Excel:
exportar_resultados(optimizer.model, optimizer.decision_vars, specs, "salida_hospital.xlsx")
```

## 🔧 Configuración de la interfaz web

1. **Front-end**:

   * `web/templates/index.html`: Página principal donde el usuario:

     1. Ingresa el contexto en lenguaje natural.
     2. Visualiza las restricciones detectadas y las que añade manualmente.
     3. Selecciona qué restricciones activar para la optimización.
   * `web/templates/results.html`: Muestra el resumen de la solución tras optimizar y permite descargar el Excel.
   * Los archivos de JavaScript (`script.js`, `results.js`) controlan las llamadas AJAX a los endpoints `/api/*`.
   * Los estilos CSS (`styles.css`, `results.css`) definen la apariencia y la disposición de los paneles.

2. **Back-end (Flask)**:

   * Levanta el servidor en `localhost:5000`.
   * Gestiona sesiones con Flask y almacena las variables y restricciones del usuario.
   * Cada vez que se traduce el contexto, se crea una instancia de `ShiftOptimizer` en `current_app.shift_store`.
   * Al cargar un proyecto existente, se reconstruye el optimizador y se restauran las restricciones previamente validadas.
   * Al optimizar, sobrescribe el archivo `resultados_turnos.xlsx` y responde con la solución en JSON.

## 🧑‍💻 Autores y colaboradores

* **Tu Nombre** — Desarrollador principal, Ingeniería de Datos.
* **(Opcional)** Otros colaboradores o asesores.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.

---

> **Nota**: Para un correcto funcionamiento, asegúrate de tener:
>
> 1. Clave de OpenAI configurada en la variable `OPENAI_API_KEY`.
> 2. Gurobi instalado y licenciado.
> 3. MongoDB en ejecución en `mongodb://localhost:27017/`.

¡Gracias por usar ResQPlan! Si tienes dudas o encuentras errores, no dudes en abrir un issue o contactar al autor.

