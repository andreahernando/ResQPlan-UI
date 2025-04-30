from gurobipy import Model, GRB, quicksum, tupledict
import gurobipy as gp
import config
from utils.constraint_translator import translate_constraint_to_code
import pprint


class ShiftOptimizer:
    # ───────────────────────────────────────── constructor ────────────────
    def __init__(self, specs: dict):
        self.specs = specs
        self.model = Model("General Shift Optimizer")
        self.constraint_descriptions = {}

        # ---- contexto exec ----
        self.exec_context = {
            "model": self.model,
            "GRB": GRB,
            "quicksum": quicksum,
            "gp": gp,
            "specs": specs,
            "data": specs,
            "variables": specs.get("variables", {}),
            "resources": specs.get("resources", {}),
        }
        for k, v in specs.get("variables", {}).items():
            self.exec_context[k] = v
            setattr(self, k, v)

        # ---- mostrar decision_variables bruto ----
        print("\n📝 Bloque decision_variables recibido:\n")
        print(specs["decision_variables"])
        print("-" * 80)

        # ---- ejecutar bloque ----
        code = specs["decision_variables"].replace("\\n", "\n") \
                                          .replace("self.model", "model") \
                                          .replace("self.", "")
        code = code.replace("model.GRB.", "GRB.").replace("self.GRB.", "GRB.")
        exec(compile(code, "<decision_variables>", "exec"), self.exec_context)

        # ---- detectar contenedores de decision_vars ----
        self.decision_vars = {}

        for k, v in self.exec_context.items():
            if k.startswith("x_") and isinstance(v, (dict, tupledict)):
                setattr(self, k, v)  # self.x_retenes = {...}, etc.
                self.decision_vars.update(v)

        if not self.decision_vars:
            raise RuntimeError("No se encontraron variables de decisión con prefijo x_ en exec_context")

        self.exec_context["x"] = self.decision_vars  # acceso genérico si se usa 'x'
        self.model.update()

        # ---- print resumen genérico ----
        print("\nℹ️  variables extraídas:")
        pprint.pprint(specs.get("variables", {}), width=100)
        print(f"\n✅ contenedor vars: {type(self.decision_vars).__name__} con {len(self.decision_vars)} índices\n")
        print(self.decision_vars)

    # ───────────────────────────────── agregar restricción ────────────────
    def agregar_restriccion(self, nl: str, code: str, max_attempts=config.MAX_ATTEMPTS):
        attempt, current = 0, code
        while attempt < max_attempts:
            print("\n🛠️  Código Gurobi generado para la restricción:\n")
            print(current)
            print("-" * 60)
            try:
                exec(current, self.exec_context)
                # registrar descripción si es nueva
                for c in self.model.getConstrs():
                    if c.constrName not in self.constraint_descriptions:
                        self.constraint_descriptions[c.constrName] = nl
                print("✔️  restricción añadida correctamente")
                return True
            except Exception as e:
                attempt += 1
                print(f"⚠️  error al ejecutar (intento {attempt}/{max_attempts}): {e}")
                nl_mod = f"{nl}\nError completo: {e}\nCorrige la restricción."
                current = translate_constraint_to_code(nl_mod, self.specs)
        print("✖️  no se pudo añadir la restricción tras varios intentos")
        return False

    # ───────────────────────────────── optimizar ──────────────────────────
    # ───────────────────────────────── optimizar ──────────────────────────
    def optimizar(self):
        self.model.setParam("Threads", 1)
        self.model.setParam("Presolve", 0)
        self.model.optimize()

        status = self.model.status
        print("\n════════════════ RESULTADO OPTIMIZACIÓN ════════════════")
        print(f"Estado Gurobi : {status} ({self.model.Status})")

        # ------- caso óptimo / subóptimo -------
        if status in (GRB.OPTIMAL, GRB.SUBOPTIMAL):
            print(f"Valor objetivo: {self.model.ObjVal}\n")
            print("Variables activadas (valor > 0.5):")
            for key, var in self.decision_vars.items():
                # var es un gurobipy.Var, var.X su valor numérico
                if var.X > 0.5:
                    print(f"{key} -> {var.X}")

            print("════════════════════════════════════════════════════════")
            return

        # ------- caso inviable -------
        if status in (GRB.INFEASIBLE, GRB.INF_OR_UNBD):
            print("❌ El modelo es inviable. Analizando IIS …")
            self.model.computeIIS()
            for c in self.model.getConstrs():
                if c.IISConstr:
                    desc = self.constraint_descriptions.get(c.constrName, "(sin descripción)")
                    print(f"   ↯ {c.constrName}  —  {desc}")

            print("\n🔄 Intentando relajación automática de restricciones …")
            original_vars = self.model.NumVars
            # crea variables de holgura solo en las restricciones
            self.model.feasRelaxS(relaxobjtype=0, minrelax=False,
                                  vrelax=False, crelax=True)
            self.model.optimize()

            if self.model.status == GRB.OPTIMAL:
                print("✅ Modelo relajado resuelto.")
                print(f"Valor objetivo (relajado): {self.model.ObjVal}")
                # mostrar qué restricciones se relajaron realmente
                slacks = self.model.getVars()[original_vars:]
                for sv in slacks:
                    if sv.X > 1e-6:
                        print(f"   {sv.VarName} = {sv.X:g}")
            else:
                print("❌ Ni siquiera el modelo relajado fue factible.")
        else:
            print("⚠️  Optimización detenida. Estado:", status)

        print("════════════════════════════════════════════════════════")

    def _imprimir_decision_vars(self):
        """Imprime cada x activa describiendo sus índices según las listas presentes en 'variables'."""
        act = [(k, v.X) for k, v in self.decision_vars.items() if v.X > 0.5]
        if not act:
            print("No hay variables activadas.")
            return

        vars_dict = self.specs.get("variables", {})
        # construir un mapa valor → nombre_lista  para identificación rápida
        reverse_map = {}
        for nombre_lista, lista in vars_dict.items():
            if nombre_lista.startswith("lista_") and isinstance(lista, list):
                for item in lista:
                    reverse_map[item] = nombre_lista

        horarios = vars_dict.get("horarios", [])
        dias_tot = vars_dict.get("dias", 0)

        print(f"Decisiones activas: {len(act)}")
        for key, _ in act:
            *entidades, dia_idx, franja_idx = key
            partes = []
            for item in entidades:
                tipo = reverse_map.get(item, "??")
                partes.append(f"{item}({tipo})")
            # tiempo:
            dia_hum = dia_idx + 1
            turno   = horarios[franja_idx] if franja_idx < len(horarios) else f"franja {franja_idx}"
            print(" · ".join(partes) + f"  →  día {dia_hum}, {turno}")
