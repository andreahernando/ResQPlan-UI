import pytest
from models.shift_optimizer import ShiftOptimizer
from gurobipy import GRB
import gurobipy as gp

from utils.constraint_translator import translate_constraint_to_code


@pytest.fixture
def optimizer():
    """ Configuración inicial del optimizador antes de cada test """
    opt = ShiftOptimizer()
    opt.optimizar()
    return opt


def test_solution_found(optimizer):
    """ ✅ Test: Asegurar que se encuentra una solución óptima """
    assert optimizer.model.status == GRB.OPTIMAL, "❌ No se encontró solución óptima."


def test_restricciones_aplicadas(optimizer):
    """ ✅ Test: Comprobar que las restricciones se han aplicado correctamente """
    assert optimizer.model.NumConstrs > 0, "❌ No se aplicaron restricciones al modelo."


def test_max_retenes_por_turno(optimizer):
    """ ✅ Test: Asegurar que no hay más de 4 retenes activos por turno """
    for t in range(optimizer.num_turnos):
        asignados = sum(optimizer.x[r, t].x > 0.5 for r in range(optimizer.num_retenes))
        assert asignados <= optimizer.max_activos, f"❌ Más de 4 retenes en turno {t}."


def test_descanso_respetado(optimizer):
    """ ✅ Test: Asegurar que se respeta el descanso de 28 horas """
    for r in range(optimizer.num_retenes):
        trabajado = [optimizer.x[r, t].x > 0.5 for t in range(optimizer.num_turnos)]
        assert sum(trabajado) <= 1, f"❌ El retén {r} no respetó el descanso de 28 horas."

def test_restriccion_natural():
    opt = ShiftOptimizer()
    restriccion = "Un retén no puede trabajar más de un turno seguido."
    gurobi_code = translate_constraint_to_code(restriccion, opt.num_turnos)

    exec_context = {
        "gp": GRB,
        "model": opt.model,
        "quicksum": gp.quicksum,
        "x": opt.x,
        "num_retenes": opt.num_retenes,
        "num_turnos": opt.num_turnos
    }
    exec(gurobi_code, exec_context)

    opt.model.optimize()
    assert opt.model.status == GRB.OPTIMAL, "❌ La restricción en lenguaje natural hizo el modelo infactible."


