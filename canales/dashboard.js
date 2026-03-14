var alertasData = require('../data/alertas');
var preop = require('../modulos/vehiculos/preoperacional/validaciones');

function responderHealth(req, res) {
  res.json({
    ok: true,
    canal: 'dashboard',
    estado: 'base-lista',
    modulos: {
      vehiculos: ['preoperacional', 'posoperacional', 'tanqueo'],
      seguridadCampo: ['ats', 'revision-equipos', 'riesgos-locativos'],
      alertas: true
    }
  });
}

function responderResumen(req, res) {
  res.json({
    ok: true,
    gruposPreoperacional: preop.GRUPOS.map(function(grupo) {
      return {
        id: grupo.id,
        nombre: grupo.nombre,
        items: grupo.items.length
      };
    }),
    alertas: {
      tabla: alertasData.TABLA,
      pendienteImplementacion: true
    }
  });
}

function registrarDashboard(app) {
  app.get('/dashboard', responderHealth);
  app.get('/dashboard/health', responderHealth);
  app.get('/dashboard/resumen', responderResumen);
}

module.exports = {
  registrarDashboard,
  responderHealth,
  responderResumen
};
