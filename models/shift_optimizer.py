from gurobipy import Model, GRB, quicksum
import gurobipy as gp
import os
import json
from openai import OpenAI


class ShiftOptimizer:
    def __init__(self, variables: dict):
        self.variables = variables
        self.model = Model("Optimizador General de Turnos")

        # Local scope para exec
        local_scope = {
            "model": self.model,
            "GRB": GRB,
            "quicksum": quicksum,
            "gp": gp,
        }

        # Cargar variables dinámicamente
        for var_name, value in variables["variables"].items():
            # Convertir strings numéricos a enteros si es posible
            try:
                value = int(value)
            except (ValueError, TypeError):
                pass  # Es lista, dict, etc.
            setattr(self, var_name, value)
            local_scope[var_name] = value

        # Ejecutar definición de variables de decisión usando el mismo diccionario para globals y locals
        code = variables["decision_variables"].replace("self.model", "model").replace("self.", "")
        exec(code, local_scope)

        # Almacenar la variable de decisión principal (esperamos que sea 'x' o 'd')
        self.decision_vars = local_scope.get("x") or local_scope.get("d")

        self.model.update()

    def obtener_contexto_ejecucion(self):
        """Construye un diccionario de contexto dinámico a partir de las variables definidas."""
        contexto = {
            "model": self.model,
            "quicksum": quicksum,
            "gp": gp,
        }
        # Incluir todas las variables definidas en el diccionario original
        for var_name in self.variables["variables"]:
            contexto[var_name] = getattr(self, var_name)
        # Añadir la variable de decisión según se haya definido ('x' o 'd')
        if "x =" in self.variables["decision_variables"]:
            contexto["x"] = self.decision_vars
        elif "d =" in self.variables["decision_variables"]:
            contexto["d"] = self.decision_vars

        # Asigna siempre el alias 'd_vars' para evitar conflictos en restricciones generadas
        contexto["d_vars"] = self.decision_vars

        return contexto

    def agregar_restriccion(self, codigo_restriccion: str):
        """Agrega una restricción al modelo a partir de código Gurobi."""
        contexto = self.obtener_contexto_ejecucion()
        exec(codigo_restriccion, contexto)

    def definir_funcion_objetivo_balanceo(self, tipo_entidad="entidades", nombre_var="x"):
        """
        Minimiza la varianza de carga entre entidades (por ejemplo, profesores, retenes).
        Se adapta al nombre de la variable de decisión y entidades.
        """
        entidades = getattr(self, f"num_{tipo_entidad}", None)
        periodos = getattr(self, "dias", getattr(self, "num_periodos", None))
        slots = getattr(self, "num_franjas", getattr(self, "num_slots", None))

        if not all([entidades, periodos, slots]):
            print("⚠️ No se pueden aplicar balanceo: faltan dimensiones.")
            return

        carga = {e: self.model.addVar(vtype=GRB.CONTINUOUS, name=f"carga_{e}") for e in range(entidades)}

        for e in range(entidades):
            self.model.addConstr(
                carga[e] == quicksum(self.decision_vars[e, p, s] for p in range(periodos) for s in range(slots)),
                name=f"carga_total_{e}"
            )

        carga_media = quicksum(carga[e] for e in range(entidades)) / entidades
        varianza = quicksum((carga[e] - carga_media) ** 2 for e in range(entidades))
        self.model.setObjective(varianza, GRB.MINIMIZE)

    def optimizar(self):
        self.model.optimize()

        if self.model.status == GRB.OPTIMAL:
            print("\n✅ Solución óptima encontrada")
        else:
            print("\n❌ No se encontró una solución óptima.")
            self.model.computeIIS()
            for c in self.model.getConstrs():
                if c.IISConstr:
                    print(f"🔍 Restricción conflictiva: {c.constrName}")
