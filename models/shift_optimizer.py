from gurobipy import Model, GRB, quicksum

class ShiftOptimizer:
    def __init__(self, num_retenes=22, dias=7):
        """
        Se asume que 'dias' es múltiplo de 6 para garantizar que cada ciclo completo
        (2 días en un turno, 1 descanso, 2 días en el otro turno, 1 descanso) se repita sin errores.
        """
        self.num_retenes = num_retenes
        self.dias = dias
        self.num_turnos = 2  # Se definen 2 turnos por día
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
        - Cada retén sigue un ciclo de 6 días: 2 días en un turno, 1 descanso, 2 días en el otro turno, 1 descanso.
        """
        for r in range(self.num_retenes):
            for d in range(self.dias):
                j = (d - (r % 6)) % 6  # Ciclo de 6 días

                # 🔹 Trabaja 2 días seguidos en el mismo turno
                if j in [0, 1]:  # Primeros dos días de trabajo
                    for t in range(self.num_turnos):
                        self.model.addConstr(self.d[r, d, t] == self.y[r] * (1 - self.p[r] if t == 1 else self.p[r]),
                                             name=f"trabajo_inicio_{r}_{d}_{t}")
                elif j in [3, 4]:  # Últimos dos días en el turno opuesto
                    for t in range(self.num_turnos):
                        self.model.addConstr(self.d[r, d, t] == self.y[r] * (self.p[r] if t == 1 else 1 - self.p[r]),
                                             name=f"trabajo_opuesto_{r}_{d}_{t}")

                # 🔹 Descansa en los días 2 y 5 (después de trabajar 2 días seguidos)
                if j in [2, 5]:
                    for t in range(self.num_turnos):
                        self.model.addConstr(self.d[r, d, t] == 0, name=f"descanso_{r}_{d}_{t}")

        # 🔹 Forzar que todos los retenes trabajen al menos 4 días en cada periodo de 7 días
        for r in range(self.num_retenes):
            for start_day in range(0, self.dias, 7):  # Iterar por bloques de 7 días
                self.model.addConstr(
                    quicksum(self.d[r, d, t] for d in range(start_day, min(start_day + 7, self.dias)) for t in
                             range(self.num_turnos)) >= 4,
                    name=f"uso_minimo_{r}_semana_{start_day // 7}"
                )

        # 🔹 Restricciones de cobertura mínima y máxima por turno
        for d in range(self.dias):
            for t in range(self.num_turnos):
                expr = quicksum(self.d[r, d, t] for r in range(self.num_retenes))
                self.model.addConstr(expr >= 6, name=f"min_turno{t}_dia_{d}")  # Min 6 retenes por turno
                self.model.addConstr(expr <= 8, name=f"max_turno{t}_dia_{d}")  # Max 8 retenes por turno

    def _definir_funcion_objetivo(self):
        """
        Minimizamos la cantidad de retenes activos.
        """
        self.model.setObjective(
            quicksum(self.y[r] for r in range(self.num_retenes)),
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
