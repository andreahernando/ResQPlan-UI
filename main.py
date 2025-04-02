# main.py
from flask import Flask
from web.routes import routes  # Importamos las rutas desde routes.py

# Inicializamos la aplicación Flask
app = Flask(__name__)
app.secret_key = "una_clave_secreta_segura"

# Registramos las rutas que definimos en el archivo routes.py
app.register_blueprint(routes)

# Punto de entrada principal para ejecutar la aplicación
if __name__ == "__main__":
    app.run(debug=True)
