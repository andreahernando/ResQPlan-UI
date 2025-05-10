# main.py
from flask import Flask
from flask_pymongo import PyMongo
from web.routes import routes  # Importamos las rutas desde routes.py

# Inicializamos la aplicación Flask
app = Flask(__name__, template_folder="web/templates", static_folder="web/static")

# Configura MongoDB directamente aquí
app.config["MONGO_URI"] = "mongodb://localhost:27017/resqplan"  # Cambia esto por tu URI real
app.secret_key = "una_clave_secreta_segura"
mongo = PyMongo(app)

# Hacemos que Mongo esté disponible en todas las rutas
app.mongo = mongo

# Registramos las rutas que definimos en el archivo routes.py
app.register_blueprint(routes)

# Punto de entrada principal para ejecutar la aplicación
if __name__ == "__main__":
    app.run(debug=True)
