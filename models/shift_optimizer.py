from gurobipy import Model, GRB, quicksum


class ShiftOptimizer:
    def __init__(self, num_retenes=22, num_turnos=2, max_activos=4, descanso_min=12):
        self.num_retenes = num_retenes  # Total de retenes disponibles (11 del Cabildo + 11 de Gesplan)
        self.num_turnos = num_turnos  # 2 turnos (diurno y nocturno)
        self.max_activos = max_activos  # Máximo de retenes activos por turno
        self.descanso_min = descanso_min  # Descanso mínimo antes de volver a trabajar

        # Crear modelo
        self.model = Model("Optimización de Turnos de Retenes")
        self.x = {}  # Variables de decisión

        self._definir_variables()
        self._definir_restricciones()
        self._definir_funcion_objetivo()

    def _definir_variables(self):
        """ Define las variables de decisión """
        for r in range(self.num_retenes):
            for t in range(self.num_turnos):
                self.x[r, t] = self.model.addVar(vtype=GRB.BINARY, name=f"x_{r}_{t}")

    def _definir_restricciones(self):
        """ Define las restricciones del modelo """

        # Un retén solo puede estar en un turno a la vez
        for r in range(self.num_retenes):
            self.model.addConstr(quicksum(self.x[r, t] for t in range(self.num_turnos)) <= 1,
                                 name=f"reten_{r}_un_turno")

        # Entre 3 y 4 retenes activos por turno
        for t in range(self.num_turnos):
            expr = quicksum(self.x[r, t] for r in range(self.num_retenes))
            self.model.addConstr(expr <= self.max_activos, name=f"max_retenes_turno_{t}")
            self.model.addConstr(expr >= 3, name=f"min_retenes_turno_{t}")

        # Garantizar descanso mínimo de 12 horas antes de reincorporarse
        for r in range(self.num_retenes):
            self.model.addConstr(self.x[r, 0] + self.x[r, 1] <= 2,
                                 name=f"descanso_minimo_{r}")

        # Implementar ciclo de rotación de turnos flexible
        for r in range(self.num_retenes):
            self.model.addConstr(self.x[r, 0] + self.x[r, 1] <= 2,
                                 name=f"rotacion_ciclo_{r}")

        # Permitir relevos nocturnos solo si el retén ya trabajó antes
        for r in range(self.num_retenes):
            self.model.addConstr(self.x[r, 1] <= self.x[r, 0] + 1,
                                 name=f"evitar_relevos_noche_{r}")

    def _definir_funcion_objetivo(self):
        """ Define la función objetivo para minimizar la carga desigual de trabajo """
        self.model.setObjective(
            quicksum(self.x[r, t] for r in range(self.num_retenes) for t in range(self.num_turnos)),
            GRB.MINIMIZE
        )

    def optimizar(self):
        """ Ejecuta la optimización y depura si el modelo es infactible """
        self.model.optimize()

        if self.model.status == GRB.OPTIMAL:
            print("\n✅ Solución óptima encontrada:")
            print(f"🔹 Total de restricciones en el modelo: {self.model.NumConstrs}")

            print("\n📌 Restricciones activas en el modelo:")
            for constr in self.model.getConstrs():
                print(f"- {constr.ConstrName}")

            print("\n📝 Turnos asignados a los retenes:")
            for r in range(self.num_retenes):
                turnos_asignados = [t for t in range(self.num_turnos) if self.x[r, t].x > 0.5]
                estado = " | ".join([f"Turno {t}" for t in turnos_asignados]) if turnos_asignados else "No asignado"
                print(f"Retén {r}: {estado}")

            print("\n📊 Estado de los retenes tras la optimización:")
            for r in range(self.num_retenes):
                tiempo_trabajado = sum(self.x[r, t].x * 12 for t in range(self.num_turnos))  # Obtener valores óptimos

                if tiempo_trabajado >= 8:
                    estado_reten = "🟢 Verde"
                elif tiempo_trabajado >= 6:
                    estado_reten = "🟡 Amarillo"
                elif tiempo_trabajado >= 2:
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
