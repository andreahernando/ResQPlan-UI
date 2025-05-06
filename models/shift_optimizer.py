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
        self.restricciones_validadas = {}  # nl -> (code, activa)

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
    def agregar_restriccion(self, nl: str):
        restric = self.restricciones_validadas.get(nl)
        if not restric:
            print("⚠️  Restricción no validada previamente.")
            return False
        if not restric["activa"]:
            print("⏸️  Restricción desactivada por el usuario.")
            return False

        code = restric["code"]
        try:
            exec(code, self.exec_context)
            for c in self.model.getConstrs():
                if c.constrName not in self.constraint_descriptions:
                    self.constraint_descriptions[c.constrName] = nl
            print("✅ Restricción añadida al modelo final.")
            return True
        except Exception as e:
            print(f"❌ Fallo inesperado al añadir la restricción activa: {e}")
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

    def validar_restriccion(self, nl: str, code: str, max_attempts: int = config.MAX_ATTEMPTS) -> bool:
        """
        Valida la restricción en un modelo temporal intentando hasta max_attempts.
        Guarda la última versión válida traducida si tiene éxito.
        """
        attempt = 0
        current_code = code

        while attempt < max_attempts:
            # 1) crea un nuevo modelo sólo para testear esta restricción
            modelo_temp = Model(f"ModeloTemporal_{attempt}")

            # 2) prepara un contexto limpio apuntando a este modelo temporal
            contexto_temp = {
                "model": modelo_temp,
                "GRB": GRB,
                "quicksum": quicksum,
                "gp": gp,
                "specs": self.specs,
                "data": self.specs,
                "variables": self.specs.get("variables", {}),
                "resources": self.specs.get("resources", {})
            }

            # 2.1) inyecta en el contexto todas las listas de specs
            for k, v in self.specs.get("variables", {}).items():
                contexto_temp[k] = v
            for k, v in self.specs.get("resources", {}).items():
                contexto_temp[k] = v

            # 3) reconstruye el bloque decision_variables sobre modelo_temp
            #    (misma transformación que en __init__)
            dv_code = (
                self.specs["decision_variables"]
                .replace("\\n", "\n")
                .replace("self.model", "model")
                .replace("self.", "")
            )
            dv_code = dv_code.replace("model.GRB.", "GRB.").replace("self.GRB.", "GRB.")
            exec(compile(dv_code, "<decision_variables>", "exec"), contexto_temp)

            # 4) detecta y agrupa todas las x_* en decision_vars_temp
            decision_vars_temp = {}
            for k, v in contexto_temp.items():
                if k.startswith("x_") and isinstance(v, (dict, tupledict)):
                    decision_vars_temp.update(v)
            contexto_temp["x"] = decision_vars_temp

            try:
                # 5) prueba la restricción en este contexto
                exec(current_code, contexto_temp)

                # 6) si todo OK, guarda la validación y sal
                self.restricciones_validadas[nl] = {"code": current_code, "activa": True}
                print(f"✔️  Restricción validada en intento {attempt + 1}: '{nl}'")
                return True

            except Exception as e:
                # 7) en caso de fallo, reintenta traducir y aumentar contador
                attempt += 1
                print(f"⚠️  Error validando restricción (intento {attempt}/{max_attempts}): {e}")
                nl_mod = f"{nl}\nError completo: {e}\nCorrige la restricción."
                current_code = translate_constraint_to_code(nl_mod, self.specs)

        # 8) agotados los intentos, marcar error final
        print(f"✖️  No se pudo validar la restricción tras {max_attempts} intentos: '{nl}'")
        return False

