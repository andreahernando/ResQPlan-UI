from gurobipy import Model, GRB, quicksum

class ShiftOptimizer:
    def __init__(self, num_retenes=22, num_turnos=2, max_activos=4, descanso_min=12, dias=28):
        self.num_retenes = num_retenes
        self.num_turnos = num_turnos
        self.max_activos = max_activos
        self.descanso_min = descanso_min
        self.dias = dias

        # Crear modelo
        self.model = Model("Optimización de Turnos de Retenes")
        self.x = {}

        self._definir_variables()
        self._definir_restricciones()
        self._definir_funcion_objetivo()

    def _definir_variables(self):
        """ Define las variables de decisión """
        for r in range(self.num_retenes):
            for d in range(self.dias):
                for t in range(self.num_turnos):
                    self.x[r, d, t] = self.model.addVar(vtype=GRB.BINARY, name=f"x_{r}_{d}_{t}")

    def _definir_restricciones(self):
        """ Define las restricciones del modelo """

        for r in range(self.num_retenes):
            for d in range(self.dias):
                self.model.addConstr(quicksum(self.x[r, d, t] for t in range(self.num_turnos)) <= 1,
                                     name=f"reten_{r}_un_turno_dia_{d}")

        for d in range(self.dias):
            for t in range(self.num_turnos):
                expr = quicksum(self.x[r, d, t] for r in range(self.num_retenes))
                self.model.addConstr(expr <= self.max_activos, name=f"max_retenes_turno_{d}_{t}")
                self.model.addConstr(expr >= 3, name=f"min_retenes_turno_{d}_{t}")

        for r in range(self.num_retenes):
            for d in range(self.dias - 1):
                self.model.addConstr(self.x[r, d, 1] + self.x[r, (d + 1) % self.dias, 0] <= 1,
                                     name=f"descanso_minimo_{r}_dia_{d}")

        for r in range(self.num_retenes):
            for d in range(self.dias - 5):
                self.model.addConstr(
                    self.x[r, d, 1] + self.x[r, d+1, 1] + self.x[r, d+2, 0] +
                    self.x[r, d+3, 0] + self.x[r, d+4, 1] + self.x[r, d+5, 1] <= 2,
                    name=f"ciclo_turnos_ideal_{r}_dia_{d}")

        for r in range(self.num_retenes):
            for d in range(self.dias):
                self.model.addConstr(self.x[r, d, 1] <= self.x[r, d, 0] + 1,
                                     name=f"evitar_relevos_noche_{r}_dia_{d}")

        for d in range(self.dias):
            self.model.addConstr(
                quicksum(self.x[r, d, 0] for r in range(self.num_retenes)) >=
                quicksum(self.x[r, d, 1] for r in range(self.num_retenes)),
                name=f"solapamiento_turnos_{d}")

        for r in range(self.num_retenes):
            for d in range(self.dias):
                self.model.addConstr(
                    quicksum(self.x[r, d - i, t] for i in range(3) for t in range(self.num_turnos) if d - i >= 0) <= 2,
                    name=f"relevos_dinamicos_{r}_dia_{d}")

    def _definir_funcion_objetivo(self):
        """ Define la función objetivo para minimizar la carga desigual de trabajo """
        self.model.setObjective(
            quicksum(self.x[r, d, t] for r in range(self.num_retenes) for d in range(self.dias) for t in range(self.num_turnos)),
            GRB.MINIMIZE
        )

    def optimizar(self):
        """ Ejecuta la optimización y muestra el estado de los retenes basado en las últimas 48 horas """
        self.model.optimize()

        if self.model.status == GRB.OPTIMAL:
            print("\n✅ Solución óptima encontrada:")
            print(f"🔹 Total de restricciones en el modelo: {self.model.NumConstrs}")

            print("\n📊 Estado de los retenes tras la optimización (últimos 2 días):")
            for r in range(self.num_retenes):
                # Consideramos solo los últimos 2 días (d-1 y d-2) si existen
                horas_trabajadas = sum(self.x[r, d, t].x * 12 for d in range(max(0, self.dias - 2), self.dias) for t in
                                       range(self.num_turnos))

                if horas_trabajadas >= 24:
                    estado_reten = "🟢 Verde"
                elif horas_trabajadas >= 18:
                    estado_reten = "🟡 Amarillo"
                elif horas_trabajadas >= 12:
                    estado_reten = "🟠 Naranja"
                else:
                    estado_reten = "🔴 Rojo"

                print(f"Retén {r} - Estado: {estado_reten}")


        elif self.model.status == GRB.INFEASIBLE:
            print("\n❌ El modelo es infactible. Ejecutando análisis IIS para identificar el problema...")

            self.model.computeIIS()
            print("\n⚠ Restricciones responsables de la infactibilidad:")
            for constr in self.model.getConstrs():
                if constr.IISConstr:
                    print(f"- {constr.ConstrName}")

            print("\n🔍 Revisa las restricciones marcadas y ajusta el modelo.")
        else:
            print("No se encontró solución óptima.")
