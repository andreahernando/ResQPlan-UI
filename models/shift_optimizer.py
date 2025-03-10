from gurobipy import Model, GRB, quicksum


class ShiftOptimizer:
    def __init__(self, num_retenes=22, dias=5, min_retenes=6, max_retenes=8):
        """
        Modelo parametrizado de optimización de turnos de retenes.

        Parámetros:
        - num_retenes: Número total de retenes disponibles.
        - dias: Número total de días de planificación.
        - min_retenes: Mínimo número de retenes por turno.
        - max_retenes: Máximo número de retenes por turno.
        """
        self.num_retenes = num_retenes
        self.dias = dias
        self.num_turnos = 2  # Siempre hay 2 turnos por día
        self.min_retenes = min_retenes
        self.max_retenes = max_retenes

        self.model = Model("Optimización de Turnos de Retenes")

        # Variables de decisión:
        self.y = {r: self.model.addVar(vtype=GRB.BINARY, name=f"y_{r}") for r in range(self.num_retenes)}
        self.p = {r: self.model.addVar(vtype=GRB.BINARY, name=f"p_{r}") for r in range(self.num_retenes)}
        self.d = {(r, d, t): self.model.addVar(vtype=GRB.BINARY, name=f"d_{r}_{d}_{t}")
                  for r in range(self.num_retenes) for d in range(self.dias) for t in range(self.num_turnos)}

        self.model.update()
        self._definir_restricciones()
        self._definir_funcion_objetivo()

    def _definir_restricciones(self):
        """
        Define las restricciones del modelo:
        - Cada retén sigue un ciclo fijo: 2 días en un turno, 1 descanso, 2 días en el otro turno, 1 descanso.
        """
        """ 
        for r in range(self.num_retenes):
            for d in range(self.dias):
                j = (d - (r % 6)) % 6  # Determina la fase del ciclo

                # 🔹 Trabaja 2 días seguidos en el mismo turno
                if j in [0, 1]:  # Primeros dos días de trabajo
                    for t in range(self.num_turnos):
                        self.model.addConstr(
                            self.d[r, d, t] == self.y[r] * (1 - self.p[r] if t == 1 else self.p[r]),
                            name=f"trabajo_inicio_{r}_{d}_{t}"
                        )
                elif j in [3, 4]:  # Dos días en el turno opuesto
                    for t in range(self.num_turnos):
                        self.model.addConstr(
                            self.d[r, d, t] == self.y[r] * (self.p[r] if t == 1 else 1 - self.p[r]),
                            name=f"trabajo_opuesto_{r}_{d}_{t}"
                        )

                # 🔹 Descansa en los días 2 y 5 (después de trabajar 2 días seguidos)
                if j in [2, 5]:
                    for t in range(self.num_turnos):
                        self.model.addConstr(self.d[r, d, t] == 0, name=f"descanso_{r}_{d}_{t}")
        """
        # 🔹 Restricción de cobertura mínima y máxima por turno (usando parámetros)
        for d in range(self.dias):
            for t in range(self.num_turnos):
                expr = quicksum(self.d[r, d, t] for r in range(self.num_retenes))
                self.model.addConstr(expr >= self.min_retenes, name=f"min_turno{t}_dia_{d}")
                self.model.addConstr(expr <= self.max_retenes, name=f"max_turno{t}_dia_{d}")

    def _definir_funcion_objetivo(self):
        """
        Minimiza la diferencia en la carga de trabajo entre retenes.
        """
        carga_trabajo = {r: self.model.addVar(vtype=GRB.CONTINUOUS, name=f"carga_{r}")
                         for r in range(self.num_retenes)}

        # Calcular la carga de trabajo total de cada retén
        for r in range(self.num_retenes):
            self.model.addConstr(
                carga_trabajo[r] == quicksum(self.d[r, d, t] for d in range(self.dias) for t in range(self.num_turnos)),
                name=f"calculo_carga_trabajo_{r}"
            )

        # Variables para minimizar la diferencia entre el retén más cargado y el menos cargado
        max_carga = self.model.addVar(vtype=GRB.CONTINUOUS, name="max_carga")
        min_carga = self.model.addVar(vtype=GRB.CONTINUOUS, name="min_carga")

        for r in range(self.num_retenes):
            self.model.addConstr(max_carga >= carga_trabajo[r], name=f"max_carga_reten_{r}")
            self.model.addConstr(min_carga <= carga_trabajo[r], name=f"min_carga_reten_{r}")

        # Función objetivo: minimizar la diferencia entre la carga de trabajo máxima y mínima
        self.model.setObjective(
            max_carga - min_carga,
            GRB.MINIMIZE
        )

    def optimizar(self):
        """Ejecuta la optimización y muestra los resultados."""
        self.model.optimize()

        if self.model.status == GRB.OPTIMAL:
            print("✅ Solución óptima encontrada")
            print("Retenes activos y sus parámetros:")
            for r in range(self.num_retenes):
                if self.y[r].x > 0.5:
                    pattern = 1 if self.p[r].x > 0.5 else 0
                    offset = r % 6
                    print(f"  Retén {r}: activo, offset = {offset}, pattern = {pattern}")

            print("\nCobertura diaria (suma de aportes por turno):")
            for d in range(self.dias):
                for t in range(self.num_turnos):
                    cobertura = sum(self.d[r, d, t].x for r in range(self.num_retenes))
                    print(f"  Día {d}, Turno {t}: {cobertura:.1f} retenes")
        else:
            print("❌ No se encontró una solución óptima.")



