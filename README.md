## 🔥 Optimización de Turnos de Retenes

Este documento describe las restricciones utilizadas en el modelo de optimización de turnos para los retenes de incendios, asegurando un equilibrio entre operatividad, descanso y eficiencia.

---

## 📌 **Restricciones en el Modelo**

### 1️⃣ **Un retén solo puede trabajar en un turno por día**
```python
for r in range(self.num_retenes):
    for d in range(self.dias):
        self.model.addConstr(quicksum(self.x[r, d, t] for t in range(self.num_turnos)) <= 1,
                             name=f"reten_{r}_un_turno_dia_{d}")
```
📌 **Explicación**: Un retén no puede estar en **más de un turno por día**, garantizando que cada equipo solo trabaje una vez al día. Esto evita sobrecarga y permite una mejor planificación de los relevos.

**Explicación técnica:**
- Se usa `quicksum(self.x[r, d, t] for t in range(self.num_turnos))` para sumar los turnos en los que un retén está asignado en un mismo día.
- La restricción impone que esta suma sea como máximo 1, evitando que un retén tenga múltiples turnos en un solo día.

---

### 2️⃣ **Entre 3 y 4 retenes activos por turno**
```python
for d in range(self.dias):
    for t in range(self.num_turnos):
        expr = quicksum(self.x[r, d, t] for r in range(self.num_retenes))
        self.model.addConstr(expr <= self.max_activos, name=f"max_retenes_turno_{d}_{t}")
        self.model.addConstr(expr >= 3, name=f"min_retenes_turno_{d}_{t}")
```
📌 **Explicación**: Controla que haya **mínimo 3 y máximo 4 retenes activos por turno**, garantizando un equipo suficiente pero sin sobrecargar el recurso humano.

**Explicación técnica:**
- `expr = quicksum(self.x[r, d, t] for r in range(self.num_retenes))` calcula la cantidad de retenes activos en cada turno.
- Se agregan dos restricciones:
  - `expr <= self.max_activos` para limitar el número máximo de retenes activos.
  - `expr >= 3` para garantizar que haya al menos 3 retenes operando en cada turno.

---

### 3️⃣ **Descanso mínimo de 12 horas antes de reincorporarse**
```python
for r in range(self.num_retenes):
    for d in range(self.dias - 1):
        self.model.addConstr(self.x[r, d, 1] + self.x[r, (d + 1) % self.dias, 0] <= 1,
                             name=f"descanso_minimo_{r}_dia_{d}")
```
📌 **Explicación**: Evita que un retén trabaje en el turno nocturno y luego en el matutino del día siguiente, asegurando **un descanso mínimo de 12 horas**.

**Explicación técnica:**
- Un retén no puede trabajar en el turno nocturno de un día `(d,1)` y luego en el turno diurno del día siguiente `(d+1,0)`.
- `self.x[r, d, 1] + self.x[r, (d + 1) % self.dias, 0]` suma la asignación de turnos consecutivos.
- La restricción impone que esta suma sea como máximo 1, asegurando al menos 12 horas de descanso.

---

### 4️⃣ **Ciclo de turnos ideal: Noche, Noche, Descanso, Mañana, Mañana, Descanso**
```python
for r in range(self.num_retenes):
    for d in range(self.dias - 5):
        self.model.addConstr(
            self.x[r, d, 1] + self.x[r, d+1, 1] + self.x[r, d+2, 0] +
            self.x[r, d+3, 0] + self.x[r, d+4, 1] + self.x[r, d+5, 1] <= 2,
            name=f"ciclo_turnos_ideal_{r}_dia_{d}")
```
📌 **Explicación**: Se intenta respetar el **ciclo ideal de trabajo y descanso** para minimizar fatiga y asegurar rotaciones equilibradas.

**Explicación técnica:**
- La restricción fuerza un patrón de turnos equilibrado: **Noche, Noche, Descanso, Mañana, Mañana, Descanso**.
- Se asegura que dentro de un período de 6 días, un retén no tenga más de dos turnos activos consecutivos.

---

### 5️⃣ **Evitar relevos nocturnos a mitad de la noche**
```python
for r in range(self.num_retenes):
    for d in range(self.dias):
        self.model.addConstr(self.x[r, d, 1] <= self.x[r, d, 0] + 1,
                             name=f"evitar_relevos_noche_{r}_dia_{d}")
```
📌 **Explicación**: Un retén solo puede trabajar en la noche si estuvo en el turno diurno previo o si ha descansado adecuadamente. Evita cambios de turno abruptos durante la madrugada.

**Explicación técnica:**
- `self.x[r, d, 1]` representa si un retén está en el turno nocturno.
- `self.x[r, d, 1] <= self.x[r, d, 0] + 1` garantiza que solo los retenes que ya estaban activos en el día pueden pasar a la noche.

---

### 6️⃣ **Solapamiento de turnos hasta las 17:30**
```python
for d in range(self.dias):
    self.model.addConstr(
        quicksum(self.x[r, d, 0] for r in range(self.num_retenes)) >=
        quicksum(self.x[r, d, 1] for r in range(self.num_retenes)),
        name=f"solapamiento_turnos_{d}")
```
📌 **Explicación**: Asegura que haya **más retenes disponibles durante el día que en la noche**.

**Explicación técnica:**
- Se suma la cantidad de retenes en turno diurno y nocturno.
- Se impone que los retenes diurnos sean igual o mayores a los nocturnos.

---

### 7️⃣ **Relevos dinámicos en función del desgaste**
```python
for r in range(self.num_retenes):
    for d in range(self.dias):
        self.model.addConstr(
            quicksum(self.x[r, d - i, t] for i in range(3) for t in range(self.num_turnos) if d - i >= 0) <= 2,
            name=f"relevos_dinamicos_{r}_dia_{d}")
```
📌 **Explicación**: Controla la carga de trabajo para evitar que un retén acumule **más de 2 turnos en un período de 3 días**.

**Explicación técnica:**
- Se limita la cantidad de turnos asignados en los últimos 3 días.
- `quicksum(self.x[r, d - i, t] for i in range(3) for t in range(self.num_turnos) if d - i >= 0) <= 2` impone que un retén no tenga más de 2 turnos en dicho periodo.

## 🔥 Restricciones Lógicas para el Modelo de Optimización de Turnos

Esta sección describe restricciones en lenguaje natural que son lógicas, útiles y no deberían generar problemas en el modelo de optimización de turnos de retenes.

---

### 1️⃣ **Cada retén debe trabajar al menos 10 turnos en el mes**
📌 *Garantiza que todos los retenes participen activamente y evita asignaciones desiguales.*

> **Restricción en lenguaje natural:**  
> *Cada retén debe trabajar al menos 10 turnos en el mes.*

---

### 2️⃣ **Cada retén no puede trabajar más de 15 turnos en el mes**
📌 *Evita que algunos retenes trabajen excesivamente, garantizando una distribución equitativa del trabajo.*

> **Restricción en lenguaje natural:**  
> *Cada retén no puede trabajar más de 15 turnos en el mes.*

---

### 3️⃣ **No puede haber dos retenes consecutivos con más de 3 días de descanso**
📌 *Asegura que los retenes no queden inactivos por períodos prolongados y mantiene una rotación regular.*

> **Restricción en lenguaje natural:**  
> *Ningún retén puede tener más de 3 días seguidos sin trabajar.*

---

### 4️⃣ **Los retenes deben trabajar turnos alternos cada dos días**
📌 *Impone una alternancia entre los días de trabajo para equilibrar la carga laboral.*

> **Restricción en lenguaje natural:**  
> *Cada retén que trabaje un turno en un día no puede trabajar el turno del día siguiente, pero sí en el siguiente día.*

---

### 5️⃣ **Cada retén debe tener al menos un turno nocturno por semana**
📌 *Evita que algunos retenes solo trabajen en el día y otros solo en la noche, garantizando una distribución justa.*

> **Restricción en lenguaje natural:**  
> *Cada retén debe trabajar al menos un turno nocturno cada 7 días.*

---

### 6️⃣ **Si un retén trabaja en el turno nocturno, no puede trabajar en el primer turno del día siguiente**
📌 *Asegura un descanso adecuado después de trabajar en la noche.*

> **Restricción en lenguaje natural:**  
> *Si un retén trabaja en el turno nocturno, no puede trabajar en el turno diurno del día siguiente.*

---

### 7️⃣ **Siempre debe haber al menos un retén en cada turno que haya trabajado el turno anterior**
📌 *Mantiene cierta continuidad operativa entre turnos.*

> **Restricción en lenguaje natural:**  
> *Siempre debe haber al menos un retén en cada turno que haya trabajado en el turno anterior.*

---

### 8️⃣ **Un retén solo puede trabajar como máximo 2 turnos seguidos antes de descansar**
📌 *Evita la acumulación excesiva de turnos seguidos sin descanso.*

> **Restricción en lenguaje natural:**  
> *Un retén no puede trabajar más de dos turnos seguidos sin un día de descanso.*

---

### 9️⃣ **Los retenes del Cabildo deben trabajar más turnos diurnos que nocturnos**
📌 *Permite una diferenciación en la asignación de turnos según el tipo de retén.*

> **Restricción en lenguaje natural:**  
> *Los retenes del Cabildo deben tener al menos un 60% de sus turnos en el día.*

---

### 🔟 **Los retenes de refuerzo no pueden trabajar más de 5 turnos nocturnos en el mes**
📌 *Controla la carga de trabajo nocturna para los retenes de refuerzo.*

> **Restricción en lenguaje natural:**  
> *Los retenes de refuerzo no pueden trabajar más de 5 turnos nocturnos en el mes.*

---


