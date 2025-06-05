# main.py
from flask import Flask
from flask_pymongo import PyMongo
from web.routes import routes

app = Flask(__name__, template_folder="web/templates", static_folder="web/static")


app.config["MONGO_URI"] = "mongodb://localhost:27017/resqplan"
app.secret_key = "una_clave_secreta_segura"
mongo = PyMongo(app)


app.mongo = mongo

app.register_blueprint(routes)


if __name__ == "__main__":
    app.run(debug=True)
