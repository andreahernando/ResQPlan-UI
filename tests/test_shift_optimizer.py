import pytest
import gurobipy as gp
from models.shift_optimizer import ShiftOptimizer
from utils.constraint_translator import extract_variables_from_context, translate_constraint_to_code


@pytest.fixture
def emergency_context():
    """
    Escenario de Gestión de Turnos – Emergencias:
    Se requiere planificar los turnos para retenes contra incendios en situaciones de emergencia para un periodo de 6 días.
    Se establecen dos turnos diarios: diurno (08:00–20:00, con salida a las 07:00 y regreso a las 21:00)
    y nocturno (20:00–08:00, con salida a las 19:00 y regreso a las 09:00), considerando 1 hora de desplazamiento en cada sentido.
    La rotación ideal evita asignaciones continuas en turno nocturno (dos turnos consecutivos seguidos de 24 horas de descanso),
    alternándose con turnos diurnos y garantizando un descanso mínimo de 10 a 12 horas entre turnos.
    Se trabaja en ciclos rotativos con 11 retenes del Cabildo y 11 de refuerzo.
    Restricción adicional: el número mínimo de retenes por turno es 6 y el máximo 8.
    Un retén solo puede trabajar dos días seguidos y luego debe descansar 1.
    El trabajo debe ser equitativo para todos los retenes (algunos se quedan en reserva).
    Los dos turnos consecutivos que trabaja un retén deben ser del mismo tipo (diurno o nocturno) y, tras el descanso,
    debe trabajar en el turno contrario.
    """
    return (
        "GESTIÓN DE TURNOS – EMERGENCIAS: Se requiere planificar los turnos para retenes contra incendios en situaciones de emergencia "
        "para un periodo de 6 días. En este caso se establecen dos turnos diarios: diurno (08:00–20:00, con salida a las 07:00 y regreso a las 21:00) "
        "y nocturno (20:00–08:00, con salida a las 19:00 y regreso a las 09:00), considerando además 1 hora de desplazamiento en cada sentido. "
        "La rotación ideal evita asignaciones continuas en turno nocturno, aplicando dos turnos consecutivos seguidos de 24 horas de descanso, "
        "alternándose con turnos diurnos, y garantizando un descanso mínimo de 10 a 12 horas entre turnos. Se trabaja en ciclos rotativos "
        "con 11 retenes del Cabildo y 11 de refuerzo, asegurando equidad en la asignación y coordinación operativa durante el turno diurno hasta las 17:30. "
        "El número mínimo de retenes es 6 y el máximo 8 por turno. Un retén solo puede trabajar dos días seguidos y luego debe descansar 1. "
        "El trabajo debe ser equitativo para todos los retenes (algunos se pueden quedar en reserva). "
        "Los dos turnos que trabajan seguidos deben ser el mismo (diurno o nocturno) y después del descanso deben trabajar en el turno contrario."
    )


@pytest.fixture
def academic_context():
    """
    Contexto de Planificación del Horario Semanal para el Primer Curso del Grado en Ingeniería Informática:
    Se requiere planificar el horario semanal para el primer curso del Grado en Ingeniería Informática. El horario se compone de 5 días lectivos y cada día tiene 6 franjas horarias de 1 hora, siendo las franjas: 15:00–16:00, 16:00–17:00, 17:00–18:00, 18:00–19:00, 19:00–20:00 y 20:00–21:00 (existiendo además la franja de 13:30–14:30, que se asume complementaria para la planificación, pero se usan únicamente 6 franjas por día para la asignación de clases).
    Se tienen 5 asignaturas, y cada una debe impartirse 4 horas semanales, distribuidas en 2 horas de teoría y 2 horas de práctica, de la siguiente forma:
      - Álgebra y Geometría: Teoría 2h, Prácticas en aula 2h.
      - Habilidades para Ingenieros: Teoría 2h, Prácticas en laboratorio 2h.
      - Fundamentos de los Computadores: Teoría 2h, Prácticas en laboratorio 2h.
      - Fundamentos de Programación I: Teoría 2h, Prácticas en laboratorio 2h.
      - Matemáticas Discretas: Teoría 2h, Prácticas en laboratorio 2h.

    Las restricciones a cumplir son:
      1. **Carga Horaria Semanal:** Cada asignatura se impartirá exactamente 4 horas semanales, divididas en 2 horas de teoría y 2 horas de práctica.
      2. **No Solapamiento:** En cada franja horaria de cada día solo se podrá impartir una asignatura, evitando que dos clases se solapen.
      3. **Límite Diario:** La suma total de horas impartidas en un día no excederá las 6 franjas horarias disponibles.
      4. **Consecutividad de Sesiones:** Las horas asignadas a una misma asignatura en un día deben organizarse en bloques consecutivos, sin huecos intermedios.
      5. **Bloque de Prácticas Continuo:** Las 2 horas de práctica de cada asignatura deben impartirse en un único bloque continuo durante el día.
      6. **Duración Máxima de Bloque:** Ningún bloque de clase para una asignatura podrá superar las 2 horas consecutivas.

    Dado que hay 30 franjas disponibles (5 días × 6 franjas) y se requieren 20 horas semanales en total, la planificación es factible siempre que se respeten estas restricciones.
    """
    return (
        "PLANIFICACIÓN DEL HORARIO SEMANAL: Se requiere planificar el horario para el primer curso del Grado en Ingeniería Informática. "
        "El horario consta de 5 días lectivos con 6 franjas horarias de 1 hora cada una (15:00–16:00, 16:00–17:00, 17:00–18:00, "
        "18:00–19:00, 19:00–20:00 y 20:00–21:00). Se tienen 5 asignaturas, cada una con 4 horas semanales (2 horas de teoría y 2 horas de práctica): "
        "Álgebra y Geometría, Habilidades para Ingenieros, Fundamentos de los Computadores, Fundamentos de Programación I y Matemáticas Discretas. "

    )


@pytest.fixture
def hospital_context():
    """
    Contexto de Planificación de Turnos en un Hospital:
    Se requiere planificar los turnos de enfermería para el Hospital San Juan durante una semana (7 días).
    Cada día se divide en 3 turnos:
      - Turno Matutino: 07:00–15:00
      - Turno Vespertino: 15:00–23:00
      - Turno Nocturno: 23:00–07:00

    Se dispone de 20 enfermeras, y cada turno debe cumplir las siguientes condiciones:
      1. **Número de Enfermeras por Turno:** Cada turno debe contar con un mínimo de 5 y un máximo de 7 enfermeras.
      2. **Descanso entre Turnos:** Cada enfermera debe tener un descanso mínimo de 12 horas entre turnos consecutivos.
      3. **Turno Nocturno:** No se permiten asignaciones consecutivas de turno nocturno sin haber disfrutado de al menos 24 horas de descanso posterior.
      4. **Descanso Semanal:** Cada enfermera debe descansar al menos 1 día completo durante la semana.
      5. **Especialización en Cuidados Intensivos:** Se deben asignar al menos 2 enfermeras con especialidad en cuidados intensivos en cada turno.
      6. **Carga Horaria Máxima:** La carga horaria semanal de cada enfermera no debe exceder las 40 horas.

    La planificación debe asegurar el cumplimiento de todas las restricciones para garantizar una atención hospitalaria segura y eficiente.
    """
    return (
        "PLANIFICACIÓN DE TURNOS HOSPITALARIOS: Se requiere planificar los turnos de enfermería para el Hospital San Juan durante una semana completa (7 días). "
        "Cada día se divide en 3 turnos: matutino (07:00–15:00), vespertino (15:00–23:00) y nocturno (23:00–07:00). "
        "Se dispone de 20 enfermeras, y cada turno debe contar con entre 5 y 7 enfermeras, incluyendo al menos 2 con especialidad en cuidados intensivos. "
        "Además, cada enfermera debe tener un descanso mínimo de 12 horas entre turnos, no puede realizar turnos nocturnos consecutivos sin 24 horas de descanso, "
        "debe descansar al menos 1 día completo a la semana, y su carga horaria semanal no debe exceder las 40 horas."
    )


def test_emergency_feasible(emergency_context):
    variables = extract_variables_from_context(emergency_context)
    assert "variables" in variables, "No se encontraron 'variables' en la salida."
    assert "decision_variables" in variables, "No se encontró 'decision_variables' en la salida."

    model = ShiftOptimizer(variables)

    restriccion_minmax = "el número mínimo de retenes es 6 y el máximo 8 por turno"
    codigo_minmax = translate_constraint_to_code(restriccion_minmax, variables["variables"])
    ok_minmax = model.agregar_restriccion(restriccion_minmax, codigo_minmax)
    assert ok_minmax, "No se pudo agregar la restricción de número de retenes."

    restriccion_descanso = "un retén solo puede trabajar dos días seguidos y luego debe descansar 1"
    codigo_descanso = translate_constraint_to_code(restriccion_descanso, variables["variables"])
    ok_descanso = model.agregar_restriccion(restriccion_descanso, codigo_descanso)
    assert ok_descanso, "No se pudo agregar la restricción de días de trabajo y descanso."

    restriccion_equidad = "el trabajo debe ser equitativo para todos los retenes (algunos se pueden quedar en reserva)"
    codigo_equidad = translate_constraint_to_code(restriccion_equidad, variables["variables"])
    ok_equidad = model.agregar_restriccion(restriccion_equidad, codigo_equidad)
    assert ok_equidad, "No se pudo agregar la restricción de equidad."

    restriccion_turnos = "los dos turnos consecutivos deben ser del mismo tipo y, tras el descanso, deben ser del turno contrario"
    codigo_turnos = translate_constraint_to_code(restriccion_turnos, variables["variables"])
    ok_turnos = model.agregar_restriccion(restriccion_turnos, codigo_turnos)
    assert ok_turnos, "No se pudo agregar la restricción de turnos consecutivos y cambio tras descanso."

    model.optimizar()
    assert model.model.status == gp.GRB.OPTIMAL, "El modelo debía ser óptimo en el escenario de emergencias."


def test_academic_schedule_feasible(academic_context):
    variables = extract_variables_from_context(academic_context)
    assert "variables" in variables, "No se encontraron 'variables' en la salida."
    assert "decision_variables" in variables, "No se encontró 'decision_variables' en la salida."

    # Crear el modelo de planificación del horario
    model = ShiftOptimizer(variables)

    restriccion_carga = (
        "cada asignatura se impartirá exactamente 4 horas semanales, distribuidas en 2 horas de teoría y 2 horas de práctica"
    )
    codigo_carga = translate_constraint_to_code(restriccion_carga, variables["variables"])
    ok_carga = model.agregar_restriccion(restriccion_carga, codigo_carga)
    assert ok_carga, "No se pudo agregar la restricción de carga horaria semanal."

    restriccion_solapamiento = (
        "en cada franja horaria de cada día solo se podrá impartir una asignatura, evitando solapamientos"
    )
    codigo_solapamiento = translate_constraint_to_code(restriccion_solapamiento, variables["variables"])
    ok_solapamiento = model.agregar_restriccion(restriccion_solapamiento, codigo_solapamiento)
    assert ok_solapamiento, "No se pudo agregar la restricción de no solapamiento de asignaturas."

    restriccion_limite_diario = (
        "la suma total de horas impartidas en un día no excederá las 6 franjas horarias disponibles"
    )
    codigo_limite_diario = translate_constraint_to_code(restriccion_limite_diario, variables["variables"])
    ok_limite_diario = model.agregar_restriccion(restriccion_limite_diario, codigo_limite_diario)
    assert ok_limite_diario, "No se pudo agregar la restricción del límite diario de horas."

    restriccion_consecutividad = (
        "las horas asignadas a una misma asignatura en un día deben organizarse en bloques consecutivos sin huecos"
    )
    codigo_consecutividad = translate_constraint_to_code(restriccion_consecutividad, variables["variables"])
    ok_consecutividad = model.agregar_restriccion(restriccion_consecutividad, codigo_consecutividad)
    assert ok_consecutividad, "No se pudo agregar la restricción de consecutividad de sesiones."

    restriccion_bloque_practicas = (
        "las 2 horas de práctica de cada asignatura deben impartirse en un único bloque continuo durante el día"
    )
    codigo_bloque_practicas = translate_constraint_to_code(restriccion_bloque_practicas, variables["variables"])
    ok_bloque_practicas = model.agregar_restriccion(restriccion_bloque_practicas, codigo_bloque_practicas)
    assert ok_bloque_practicas, "No se pudo agregar la restricción de bloque de prácticas continuo."

    restriccion_duracion_bloque = (
        "ningún bloque de clase para una asignatura podrá superar las 2 horas consecutivas"
    )
    codigo_duracion_bloque = translate_constraint_to_code(restriccion_duracion_bloque, variables["variables"])
    ok_duracion_bloque = model.agregar_restriccion(restriccion_duracion_bloque, codigo_duracion_bloque)
    assert ok_duracion_bloque, "No se pudo agregar la restricción de duración máxima de bloque."

    model.optimizar()

    assert model.model.status == gp.GRB.OPTIMAL, "El modelo debía ser óptimo para la planificación del horario."


def test_hospital_schedule_feasible(hospital_context):
    # Extraer variables y definición de decisión usando la API real
    variables = extract_variables_from_context(hospital_context)
    assert "variables" in variables, "No se encontraron 'variables' en la salida."
    assert "decision_variables" in variables, "No se encontró 'decision_variables' en la salida."

    model = ShiftOptimizer(variables)

    restriccion_numero_enfermeras = (
        "cada turno debe contar con un mínimo de 5 y un máximo de 7 enfermeras"
    )
    codigo_numero_enfermeras = translate_constraint_to_code(restriccion_numero_enfermeras, variables["variables"])
    ok_numero_enfermeras = model.agregar_restriccion(restriccion_numero_enfermeras, codigo_numero_enfermeras)
    assert ok_numero_enfermeras, "No se pudo agregar la restricción de número de enfermeras por turno."

    restriccion_descanso = (
        "cada enfermera debe tener un descanso mínimo de 12 horas entre turnos consecutivos"
    )
    codigo_descanso = translate_constraint_to_code(restriccion_descanso, variables["variables"])
    ok_descanso = model.agregar_restriccion(restriccion_descanso, codigo_descanso)
    assert ok_descanso, "No se pudo agregar la restricción de descanso mínimo entre turnos."

    restriccion_nocturno = (
        "no se permiten asignaciones consecutivas de turno nocturno sin al menos 24 horas de descanso"
    )
    codigo_nocturno = translate_constraint_to_code(restriccion_nocturno, variables["variables"])
    ok_nocturno = model.agregar_restriccion(restriccion_nocturno, codigo_nocturno)
    assert ok_nocturno, "No se pudo agregar la restricción de turnos nocturnos consecutivos."

    restriccion_descanso_semanal = (
        "cada enfermera debe descansar al menos 1 día completo durante la semana"
    )
    codigo_descanso_semanal = translate_constraint_to_code(restriccion_descanso_semanal, variables["variables"])
    ok_descanso_semanal = model.agregar_restriccion(restriccion_descanso_semanal, codigo_descanso_semanal)
    assert ok_descanso_semanal, "No se pudo agregar la restricción de descanso semanal completo."

    restriccion_cuidados_intensivos = (
        "se deben asignar al menos 2 enfermeras con especialidad en cuidados intensivos en cada turno"
    )
    codigo_cuidados_intensivos = translate_constraint_to_code(restriccion_cuidados_intensivos, variables["variables"])
    ok_cuidados_intensivos = model.agregar_restriccion(restriccion_cuidados_intensivos, codigo_cuidados_intensivos)
    assert ok_cuidados_intensivos, "No se pudo agregar la restricción de enfermeras especializadas en cuidados intensivos."

    restriccion_carga_horaria = (
        "la carga horaria semanal de cada enfermera no debe exceder las 40 horas"
    )
    codigo_carga_horaria = translate_constraint_to_code(restriccion_carga_horaria, variables["variables"])
    ok_carga_horaria = model.agregar_restriccion(restriccion_carga_horaria, codigo_carga_horaria)
    assert ok_carga_horaria, "No se pudo agregar la restricción de carga horaria máxima semanal."

    model.optimizar()

    assert model.model.status == gp.GRB.OPTIMAL, "El modelo debía ser óptimo para la planificación de turnos hospitalarios."