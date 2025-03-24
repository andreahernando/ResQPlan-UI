from gurobipy import Model, GRB, quicksum


class ShiftOptimizer:
    def __init__(self, variables: dict):
        """
        Modelo parametrizado de optimización de turnos de retenes.
        """
        self.variables = variables

        self.model = Model("Optimización de Turnos de Retenes")
        self.model.update()
        
        self._definir_restricciones()
        self._definir_funcion_objetivo()

    def _definir_restricciones(self):
        """
        Define las restricciones del modelo:
        - Cobertura mínima y máxima por turno
        """
        for d in range(self.dias):
            for t in range(self.num_turnos):
                expr = quicksum(self.d[r, d, t] for r in range(self.num_retenes))
                self.model.addConstr(expr >= self.min_retenes, name=f"min_turno{t}_dia_{d}")
                self.model.addConstr(expr <= self.max_retenes, name=f"max_turno{t}_dia_{d}")

    def _definir_funcion_objetivo(self):
        """
        Minimiza la varianza de la carga de trabajo entre retenes.
        """
        carga_trabajo = {r: self.model.addVar(vtype=GRB.CONTINUOUS, name=f"carga_{r}")
                         for r in range(self.num_retenes)}

        # Calcular la carga de trabajo total de cada retén
        for r in range(self.num_retenes):
            self.model.addConstr(
                carga_trabajo[r] == quicksum(self.d[r, d, t] for d in range(self.dias) for t in range(self.num_turnos)),
                name=f"calculo_carga_trabajo_{r}"
            )

        # Calcular la carga promedio
        carga_promedio = quicksum(carga_trabajo[r] for r in range(self.num_retenes)) / self.num_retenes

        # Minimizar la suma de las desviaciones cuadráticas (varianza)
        varianza = quicksum((carga_trabajo[r] - carga_promedio) * (carga_trabajo[r] - carga_promedio)
                            for r in range(self.num_retenes))

        self.model.setObjective(varianza, GRB.MINIMIZE)

    def optimizar(self):
        """Ejecuta la optimización y muestra los resultados."""
        self.model.optimize()

        if self.model.status == GRB.OPTIMAL:
            print("✅ Solución óptima encontrada")
            print("Cobertura diaria (suma de aportes por turno):")
            for d in range(self.dias):
                for t in range(self.num_turnos):
                    cobertura = sum(self.d[r, d, t].x for r in range(self.num_retenes))
                    print(f"  Día {d}, Turno {t}: {cobertura:.1f} retenes")
        else:
            print("El modelo es infactible. Identificando restricciones problemáticas...")
            self.model.computeIIS()
            for c in self.model.getConstrs():
                if c.IISConstr:  # Identifica restricciones en IIS
                    print(f"Restricción en IIS: {c.constrName}")

