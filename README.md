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
│   ├── routes.py                # Rutas o endpoints de la web
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



---

# 🖥️ Ejemplo de uso

## 1. Crear o seleccionar un proyecto  
Haz clic en el botón de menú (esquina superior izquierda) y selecciona un proyecto existente o crea uno nuevo. Así podrás guardar tu configuración y retomarla más adelante.

## 2. Ingresar el contexto  
Escribe el problema en lenguaje natural en el campo principal, por ejemplo:

```bash
Organizar el horario de los 22 retenes de La Palma, con dos turnos de 08:00–16:00 y 16:00–00:00, para los próximos 15 días.
```

Pulsa **Subir** para procesar el contexto.

## 3. Añadir y gestionar restricciones  
Escribe nuevas restricciones en lenguaje natural y pulsa **Añadir** (ej.: “ningún reten puede trabajar más de dos días seguidos”).

También puedes activar/desactivar, editar o eliminar restricciones ya añadidas.

Al pulsar **Subir**, el sistema detecta restricciones implícitas en el texto y ofrece convertirlas automáticamente.


## 4. Ejecutar la optimización  
Con el contexto y las restricciones definidos, pulsa **Optimizar**. Se mostrará una tabla con la planificación generada (turnos × día).

Puedes filtrar por trabajador para ver solo su asignación.

Si el sistema ha relajado alguna restricción para obtener una solución viable, se indicará claramente.

## 5. Exportar resultados  
Pulsa **Descargar Excel** para obtener el horario optimizado con las asignaciones detalladas por día y recurso.  


> 💡 **Tip**: Si detectas que el modelo es inviable (Gurobi identifica conflictos), aparecerá un mensaje con la lista de restricciones que generan el conflicto (IIS). En ese caso, puedes desactivar temporalmente alguna restricción desde la lista y volver a optimizar.

---

### ⚠️ Requisitos imprescindibles para el correcto funcionamiento

- 🔑 **Clave OpenAI:** Configura la variable de entorno `OPENAI_API_KEY`.  
- 🧩 **Gurobi:** Debe estar instalado y con licencia válida.  
- 🍃 **MongoDB:** Asegúrate de que esté corriendo en `mongodb://localhost:27017/`.

---