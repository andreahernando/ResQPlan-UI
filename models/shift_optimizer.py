from gurobipy import Model, GRB, quicksum

class ShiftOptimizer:
    def __init__(self, num_retenes=22, dias=2):
        """
        Se asume que los retenes siguen un patrón de trabajo:
        - 2 días en un turno
        - 1 día de descanso
        - 2 días en el turno opuesto
        - 1 día de descanso
        Este patrón se mantiene cíclico sin importar el número de días en la simulación.
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
        - Cada retén sigue un ciclo flexible: 2 días en un turno, 1 descanso, 2 días en el otro turno, 1 descanso.
        - Funciona para cualquier cantidad de días sin necesidad de ser múltiplo de 6.
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

        # 🔹 Restricción de cobertura mínima y máxima por turno
        for d in range(self.dias):
            for t in range(self.num_turnos):
                expr = quicksum(self.d[r, d, t] for r in range(self.num_retenes))
                self.model.addConstr(expr >= 6, name=f"min_turno{t}_dia_{d}")  # Min 6 retenes por turno
                self.model.addConstr(expr <= 8, name=f"max_turno{t}_dia_{d}")  # Max 8 retenes por turno

    def _definir_funcion_objetivo(self):
        """
        Modifica la función objetivo para maximizar la equidad en la distribución del trabajo
        en lugar de minimizar retenes activos.
        """

        # Variables auxiliares de desviación para el número de retenes por turno
        exceso = {(d, t): self.model.addVar(vtype=GRB.CONTINUOUS, name=f"exceso_{d}_{t}")
                  for d in range(self.dias) for t in range(self.num_turnos)}
        defecto = {(d, t): self.model.addVar(vtype=GRB.CONTINUOUS, name=f"defecto_{d}_{t}")
                   for d in range(self.dias) for t in range(self.num_turnos)}

        # Variables para medir la carga de trabajo total de cada retén
        carga_trabajo = {r: self.model.addVar(vtype=GRB.CONTINUOUS, name=f"carga_{r}")
                         for r in range(self.num_retenes)}

        # Restricciones para capturar el exceso o defecto de retenes por turno
        for d in range(self.dias):
            for t in range(self.num_turnos):
                total_retenes = quicksum(self.d[r, d, t] for r in range(self.num_retenes))
                self.model.addConstr(total_retenes >= 6 - defecto[d, t], name=f"min_retenes_turno_{d}_{t}")
                self.model.addConstr(total_retenes <= 8 + exceso[d, t], name=f"max_retenes_turno_{d}_{t}")

        # Calcular la carga de trabajo total de cada retén (cuántos turnos ha trabajado)
        for r in range(self.num_retenes):
            self.model.addConstr(
                carga_trabajo[r] == quicksum(self.d[r, d, t] for d in range(self.dias) for t in range(self.num_turnos)),
                name=f"calculo_carga_trabajo_{r}"
            )

        # **Nueva Función Objetivo:** Minimizar la diferencia entre los retenes más cargados y menos cargados
        max_carga = self.model.addVar(vtype=GRB.CONTINUOUS, name="max_carga")
        min_carga = self.model.addVar(vtype=GRB.CONTINUOUS, name="min_carga")

        for r in range(self.num_retenes):
            self.model.addConstr(max_carga >= carga_trabajo[r], name=f"max_carga_reten_{r}")
            self.model.addConstr(min_carga <= carga_trabajo[r], name=f"min_carga_reten_{r}")

        # Función objetivo: minimizar la diferencia entre la carga de trabajo máxima y mínima
        self.model.setObjective(
            max_carga - min_carga,  # Minimizar la diferencia entre retenes más ocupados y menos ocupados
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


# ---- EJECUCIÓN DEL MODELO ----
if __name__ == "__main__":
    optimizer = ShiftOptimizer(num_retenes=22, dias=30)  # Puedes cambiar el número de días
    optimizer.optimizar()
