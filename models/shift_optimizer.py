from gurobipy import Model, GRB, quicksum, tupledict
import gurobipy as gp
import config
from utils.constraint_translator import translate_constraint_to_code


class ShiftOptimizer:
    # ───────────────────────────────────────── constructor ────────────────
    def __init__(self, specs: dict):
        self.specs = specs
        # guardo el bloque raw para re-ejecutar variables
        self._dv_code_str = specs["decision_variables"]
        self._compile_dv_code()
        # mapas de restricciones
        self.constraint_descriptions = {}
        self.restricciones_validadas = {}  # nl -> {"code":…, "activa":bool}
        # contexto base (sin modelo aún)
        self._build_base_exec_context()
        # construyo por primera vez
        self.reset_model()

    def _compile_dv_code(self):
        code = (
            self._dv_code_str
            .replace("\\n", "\n")
            .replace("self.model", "model")
            .replace("self.", "")
        )
        code = code.replace("model.GRB.", "GRB.").replace("self.GRB.", "GRB.")
        self._dv_code_compiled = compile(code, "<decision_variables>", "exec")

    def _build_base_exec_context(self):
        self.exec_context = {
            "GRB": GRB,
            "quicksum": quicksum,
            "gp": gp,
            "specs": self.specs,
            "data": self.specs,
            "variables": self.specs.get("variables", {}),
            "resources": self.specs.get("resources", {})
        }
        for k, v in self.specs.get("variables", {}).items():
            self.exec_context[k] = v
        for k, v in self.specs.get("resources", {}).items():
            self.exec_context[k] = v

    def reset_model(self):
        """Reconstruye el modelo, variables de decisión y contexto."""
        self.model = Model("General Shift Optimizer (limpio)")
        self.exec_context["model"] = self.model

        # re-ejecución de creación de variables
        exec(self._dv_code_compiled, self.exec_context)

        # extracción de todas las x_*
        self.decision_vars = {}
        for k, v in self.exec_context.items():
            if k.startswith("x_") and isinstance(v, (dict, tupledict)):
                self.decision_vars.update(v)
        if not self.decision_vars:
            raise RuntimeError("No se encontraron variables de decisión tras reset_model()")
        self.exec_context["x"] = self.decision_vars

        self.model.update()
        print(f"\n🔄 Modelo reseteado con {len(self.decision_vars)} variables de decisión.")

    # ───────────────────────────────── agregar restricción ────────────────
    def agregar_restriccion(self, nl: str) -> bool:
        """Añade al modelo la restricción validada y activa."""
        print("\n🔍 Restricciones validadas:", self.restricciones_validadas.keys())
        info = self.restricciones_validadas.get(nl)
        if not info:
            print("⚠️  Restricción no validada previamente.")
            return False
        if not info["activa"]:
            print("⏸️  Restricción desactivada.")
            return False

        try:
            exec(info["code"], self.exec_context)
            for c in self.model.getConstrs():
                if c.constrName not in self.constraint_descriptions:
                    self.constraint_descriptions[c.constrName] = nl
            print("✅ Restricción añadida al modelo.")
            return True
        except Exception as e:
            print(f"❌ Error añadiendo restricción '{nl}': {e}")
            return False

    # ───────────────────────────────── optimizar ──────────────────────────
    def optimizar(self):
        # 1) reconstruyo modelo limpio
        self.reset_model()

        # 2) agrego sólo activas
        for nl, info in self.restricciones_validadas.items():
            if info["activa"]:
                try:
                    exec(info["code"], self.exec_context)
                    for c in self.model.getConstrs():
                        if c.constrName not in self.constraint_descriptions:
                            self.constraint_descriptions[c.constrName] = nl
                except Exception as e:
                    print(f"⚠️  Error re-añadiendo '{nl}': {e}")

        # 3) optimizo
        self.model.setParam("Threads", 1)
        self.model.setParam("Presolve", 0)
        self.model.optimize()

        status = self.model.status
        print("\n═════════ RESULTADO OPTIMIZACIÓN ═════════")
        print(f"Estado Gurobi: {status} ({self.model.Status})")

        if status in (GRB.OPTIMAL, GRB.SUBOPTIMAL):
            print(f"Objetivo: {self.model.ObjVal}")
            print("Variables activadas (>0.5):")
            for key, var in self.decision_vars.items():
                if var.X > 0.5:
                    print(f"  · {key} = {var.X}")
            print("════════════════════════════════════════")
            return

        if status in (GRB.INFEASIBLE, GRB.INF_OR_UNBD):
            print("❌ Modelo inviable. IIS:")
            self.model.computeIIS()
            for c in self.model.getConstrs():
                if c.IISConstr:
                    desc = self.constraint_descriptions.get(c.constrName, "(sin descripción)")
                    print(f"   ↯ {c.constrName} — {desc}")

            print("\n🔄 Intentando relajación automática …")
            orig = self.model.NumVars
            self.model.feasRelaxS(relaxobjtype=0, minrelax=False, vrelax=False, crelax=True)
            self.model.optimize()
            if self.model.status == GRB.OPTIMAL:
                print("✅ Modelo relajado resuelto. Objetivo:", self.model.ObjVal)
                slacks = self.model.getVars()[orig:]
                for sv in slacks:
                    if sv.X > 1e-6:
                        print(f"   · {sv.VarName} = {sv.X:g}")
            else:
                print("❌ Ni el modelo relajado fue factible.")
        else:
            print("⚠️  Optimización detenida. Estado=", status)
        print("════════════════════════════════════════")

    # ───────────────────────────────── imprimir vars ──────────────────────────
    def _imprimir_decision_vars(self):
        act = [(k, v.X) for k, v in self.decision_vars.items() if v.X > 0.5]
        if not act:
            print("No hay variables activadas.")
            return
        vars_dict = self.specs.get("variables", {})
        reverse_map = {}
        for lista, items in vars_dict.items():
            if lista.startswith("lista_"):
                for it in items:
                    reverse_map[it] = lista
        horarios = vars_dict.get("horarios", [])
        for key, _ in act:
            *entidades, di, fr = key
            partes = [f"{e}({reverse_map.get(e,'??')})" for e in entidades]
            dia = di + 1
            turno = horarios[fr] if fr < len(horarios) else f"franja {fr}"
            print(" · ".join(partes) + f" → día {dia}, {turno}")

    # ───────────────────────────────── validar restricción ─────────────────
    def validar_restriccion(self, nl: str, code: str, max_attempts: int = config.MAX_ATTEMPTS) -> bool:
        attempt = 0
        current = code
        while attempt < max_attempts:
            modelo_temp = Model(f"Temp_{attempt}")
            ctx = {
                "model": modelo_temp, "GRB": GRB, "quicksum": quicksum, "gp": gp,
                "specs": self.specs, "data": self.specs,
                "variables": self.specs.get("variables", {}),
                "resources": self.specs.get("resources", {})
            }
            for k, v in self.specs.get("variables", {}).items(): ctx[k]=v
            for k, v in self.specs.get("resources", {}).items(): ctx[k]=v

            # reconstruyo vars
            exec(self._dv_code_compiled, ctx)
            # pruebo
            try:
                exec(current, ctx)
                self.restricciones_validadas[nl] = {"code": current, "activa": True}
                print(f"✔️  Restricción validada ({attempt+1}): '{nl}'")
                return True
            except Exception as e:
                attempt += 1
                print(f"⚠️  Error validando (intento {attempt}): {e}")
                nl_mod = f"{nl}\nError: {e}"
                current = translate_constraint_to_code(nl_mod, self.specs)

        print(f"✖️  No se validó '{nl}' tras {max_attempts} intentos.")
        return False

    # ───────────────────────────────── editar restricción ─────────────────
    def editar_restriccion(self, nl: str, nuevo_nl: str) -> bool:
        if nl not in self.restricciones_validadas:
            print("⚠️  No existe esa restricción.")
            return False
        was_active = self.restricciones_validadas[nl]["activa"]
        print(f"✏️  Traduciendo '{nuevo_nl}'…")
        new_code = translate_constraint_to_code(nuevo_nl, self.specs)
        if not self.validar_restriccion(nuevo_nl, new_code):
            print("❌  Edición fallida.")
            return False
        entry = self.restricciones_validadas.pop(nuevo_nl)
        entry["activa"] = was_active
        del self.restricciones_validadas[nl]
        self.restricciones_validadas[nuevo_nl] = entry
        print(f"✅  '{nl}' → '{nuevo_nl}' (activa={was_active})")
        return True
