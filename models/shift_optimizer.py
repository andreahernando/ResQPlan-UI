from gurobipy import Model, GRB, quicksum

class ShiftOptimizer:
    def __init__(self, num_retenes=22, dias=10):
        """
        Se asume que 'dias' es múltiplo de 5 para garantizar que cada ciclo completo
        (2 días en un turno, 1 descanso, 2 días en el otro turno) se repita sin interrupciones.
        """
        self.num_retenes = num_retenes
        self.dias = dias
        self.num_turnos = 2  # Se definen 2 turnos por día
        self.model = Model("Optimización de Turnos de Retenes")

        # Variables de decisión:
        self.y = {r: self.model.addVar(vtype=GRB.BINARY, name=f"y_{r}") for r in range(self.num_retenes)}
        self.p = {r: self.model.addVar(vtype=GRB.BINARY, name=f"p_{r}") for r in range(self.num_retenes)}
        self.z = {r: self.model.addVar(vtype=GRB.BINARY, name=f"z_{r}") for r in range(self.num_retenes)}

        # Nueva variable: d[r, d, t] indica si el retén r trabaja en el turno t en el día d
        self.d = {(r, d, t): self.model.addVar(vtype=GRB.BINARY, name=f"d_{r}_{d}_{t}")
                  for r in range(self.num_retenes) for d in range(self.dias) for t in range(self.num_turnos)}

        self.model.update()

        # Linealización de z[r] = y[r] * p[r]
        for r in range(self.num_retenes):
            self.model.addConstr(self.z[r] <= self.y[r], name=f"lin1_{r}")
            self.model.addConstr(self.z[r] <= self.p[r], name=f"lin2_{r}")
            self.model.addConstr(self.z[r] >= self.y[r] + self.p[r] - 1, name=f"lin3_{r}")

        self._definir_restricciones()
        self._definir_funcion_objetivo()

    def _definir_restricciones(self):
        """
        Impone las restricciones de cobertura de turnos:
        - Cada día, en cada turno, la cantidad de retenes activos debe estar entre 6 y 8.
        - Cada retén debe seguir el ciclo `2-1-2` correctamente.
        """

        # 🔹 RESTRICCIONES PARA EL CICLO 2-1-2 DE LOS RETENES
        for r in range(self.num_retenes):
            for d in range(self.dias):
                j = (d - (r % 5)) % 5  # Día en el ciclo de 5 días

                # 🔹 Día de descanso forzado después de cada secuencia de 2 días de trabajo
                if j in [2, 5]:  # Antes solo teníamos `j == 2`, ahora agregamos `j == 5`
                    for t in range(self.num_turnos):
                        self.model.addConstr(self.d[r, d, t] == 0, name=f"descanso_{r}_{d}_{t}")

                # 🔹 Turnos según el patrón 2-1-2-1-2...
                else:
                    for t in range(self.num_turnos):
                        if j in [0, 1]:  # Trabaja en el mismo turno dos días
                            self.model.addConstr(
                                self.d[r, d, t] == self.y[r] * (1 - self.p[r] if t == 1 else self.p[r]),
                                name=f"trabajo_{r}_{d}_{t}_inicio")
                        elif j in [3, 4]:  # Cambia de turno tras el descanso
                            self.model.addConstr(
                                self.d[r, d, t] == self.y[r] * (self.p[r] if t == 1 else 1 - self.p[r]),
                                name=f"trabajo_{r}_{d}_{t}_fin")

        # 🔹 RESTRICCIONES PARA LA COBERTURA MÍNIMA Y MÁXIMA POR TURNO
        for d in range(self.dias):
            for t in range(self.num_turnos):
                expr = quicksum(self.d[r, d, t] for r in range(self.num_retenes))
                self.model.addConstr(expr >= 6, name=f"min_turno{t}_dia_{d}")
                self.model.addConstr(expr <= 8, name=f"max_turno{t}_dia_{d}")

        # 🔹 Balanceo en el uso de patrones
        self.model.addConstr(quicksum(self.p[r] for r in range(self.num_retenes)) >= self.num_retenes * 0.3,
                             name="min_pattern1")
        self.model.addConstr(quicksum(self.p[r] for r in range(self.num_retenes)) <= self.num_retenes * 0.7,
                             name="max_pattern1")

        # 🔹 Balanceo de offset (evita que solo ciertos retenes sean elegidos)
        for offset in range(5):
            self.model.addConstr(
                quicksum(self.y[r] for r in range(self.num_retenes) if r % 5 == offset) >= self.num_retenes / 5 * 0.6,
                name=f"balance_offset_{offset}"
            )

    def _definir_funcion_objetivo(self):
        """
        Minimizamos la cantidad de retenes activos, pero también incentivamos diversidad en la cobertura.
        """
        self.model.setObjective(
            quicksum(self.y[r] for r in range(self.num_retenes))
            + 0.1 * quicksum(self.p[r] for r in range(self.num_retenes)),  # 🔹 Fomenta diversidad de patrones
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
                    offset = r % 5
                    print(f"  Retén {r}: activo, offset = {offset}, pattern = {pattern}")

            print("\nCobertura diaria (suma de aportes por turno):")
            for d in range(self.dias):
                for t in range(self.num_turnos):
                    cobertura = sum(self.d[r, d, t].x for r in range(self.num_retenes))
                    print(f"  Día {d}, Turno {t}: {cobertura:.1f} retenes")
        else:
            print("❌ No se encontró una solución óptima.")
