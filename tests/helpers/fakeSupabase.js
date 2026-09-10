'use strict';

/**
 * tests/helpers/fakeSupabase.js
 *
 * Supabase en memoria: implementa el subconjunto del query builder de
 * PostgREST que usa el flujo de WhatsApp, operando sobre arrays JS.
 *
 * No reemplaza al mock de tests/__mocks__/supabase.js (que sirve para
 * tests unitarios de una sola query). Este existe para pruebas E2E donde
 * el flujo completo hace decenas de queries encadenadas.
 *
 * Soporta: from / select / insert / update / upsert / delete
 *          eq / neq / in / is / not / gte / lte / gt / lt
 *          order / limit / single / maybeSingle
 *          { count: 'exact', head: true }
 *
 * Cada builder es "thenable": se puede await en cualquier punto de la cadena.
 */

function clonar(valor) {
  return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}

function obtenerCampo(fila, campo) {
  return fila ? fila[campo] : undefined;
}

function crearFakeSupabase(datosIniciales) {
  var tablas = clonar(datosIniciales || {});
  var registroLlamadas = [];

  function asegurarTabla(nombre) {
    if (!tablas[nombre]) tablas[nombre] = [];
    return tablas[nombre];
  }

  function Builder(tabla) {
    this.tabla = tabla;
    this.filtros = [];
    this.operacion = 'select';
    this.payload = null;
    this.orden = null;
    this._limite = null;
    this._single = false;
    this._maybeSingle = false;
    this._count = null;
    this._head = false;
  }

  Builder.prototype._agregarFiltro = function (fn) {
    this.filtros.push(fn);
    return this;
  };

  Builder.prototype.select = function (_cols, opciones) {
    if (this.operacion === 'select' || this.operacion === 'insert' || this.operacion === 'update') {
      if (opciones && opciones.count) this._count = opciones.count;
      if (opciones && opciones.head) this._head = true;
    }
    return this;
  };

  Builder.prototype.insert = function (filas) {
    this.operacion = 'insert';
    this.payload = Array.isArray(filas) ? filas : [filas];
    return this;
  };

  Builder.prototype.update = function (campos) {
    this.operacion = 'update';
    this.payload = campos;
    return this;
  };

  Builder.prototype.upsert = function (filas, opciones) {
    this.operacion = 'upsert';
    this.payload = Array.isArray(filas) ? filas : [filas];
    this.onConflict = (opciones && opciones.onConflict) || 'id';
    return this;
  };

  Builder.prototype.delete = function () {
    this.operacion = 'delete';
    return this;
  };

  Builder.prototype.eq = function (campo, valor) {
    return this._agregarFiltro(function (f) { return obtenerCampo(f, campo) === valor; });
  };
  Builder.prototype.neq = function (campo, valor) {
    return this._agregarFiltro(function (f) { return obtenerCampo(f, campo) !== valor; });
  };
  Builder.prototype.in = function (campo, valores) {
    return this._agregarFiltro(function (f) { return valores.indexOf(obtenerCampo(f, campo)) >= 0; });
  };
  Builder.prototype.is = function (campo, valor) {
    return this._agregarFiltro(function (f) {
      var v = obtenerCampo(f, campo);
      if (valor === null) return v === null || v === undefined;
      return v === valor;
    });
  };
  Builder.prototype.not = function (campo, operador, valor) {
    return this._agregarFiltro(function (f) {
      var v = obtenerCampo(f, campo);
      if (operador === 'is' && (valor === null || valor === 'null')) {
        return v !== null && v !== undefined;
      }
      return v !== valor;
    });
  };
  Builder.prototype.gte = function (campo, valor) {
    return this._agregarFiltro(function (f) { return obtenerCampo(f, campo) >= valor; });
  };
  Builder.prototype.lte = function (campo, valor) {
    return this._agregarFiltro(function (f) { return obtenerCampo(f, campo) <= valor; });
  };
  Builder.prototype.gt = function (campo, valor) {
    return this._agregarFiltro(function (f) { return obtenerCampo(f, campo) > valor; });
  };
  Builder.prototype.lt = function (campo, valor) {
    return this._agregarFiltro(function (f) { return obtenerCampo(f, campo) < valor; });
  };
  Builder.prototype.or = function () { return this; };

  Builder.prototype.order = function (campo, opciones) {
    this.orden = { campo: campo, asc: !opciones || opciones.ascending !== false };
    return this;
  };

  Builder.prototype.limit = function (n) {
    this._limite = n;
    return this;
  };

  Builder.prototype.single = function () {
    this._single = true;
    return this._ejecutar();
  };

  Builder.prototype.maybeSingle = function () {
    this._maybeSingle = true;
    return this._ejecutar();
  };

  Builder.prototype.then = function (resolver, rechazar) {
    return this._ejecutar().then(resolver, rechazar);
  };

  Builder.prototype._aplicarFiltros = function (filas) {
    var self = this;
    return filas.filter(function (fila) {
      return self.filtros.every(function (fn) { return fn(fila); });
    });
  };

  Builder.prototype._ejecutar = function () {
    var self = this;
    return new Promise(function (resolver) {
      registroLlamadas.push({ tabla: self.tabla, operacion: self.operacion });
      var filas = asegurarTabla(self.tabla);
      var resultado;

      if (self.operacion === 'insert' || self.operacion === 'upsert') {
        var insertadas = [];
        self.payload.forEach(function (nueva) {
          var fila = clonar(nueva);
          if (!fila.id) fila.id = self.tabla + '-' + (filas.length + insertadas.length + 1);
          if (!fila.created_at) fila.created_at = new Date().toISOString();

          if (self.operacion === 'upsert') {
            var clave = self.onConflict;
            var existente = filas.findIndex(function (f) {
              return obtenerCampo(f, clave) === obtenerCampo(fila, clave);
            });
            if (existente >= 0) {
              filas[existente] = Object.assign({}, filas[existente], fila);
              insertadas.push(filas[existente]);
              return;
            }
          }
          filas.push(fila);
          insertadas.push(fila);
        });
        resultado = { data: clonar(insertadas), error: null };
        if (self._single || self._maybeSingle) resultado.data = clonar(insertadas[0]) || null;
        return resolver(resultado);
      }

      if (self.operacion === 'update') {
        var aActualizar = self._aplicarFiltros(filas);
        aActualizar.forEach(function (fila) {
          var idx = filas.indexOf(fila);
          filas[idx] = Object.assign({}, fila, clonar(self.payload));
        });
        return resolver({ data: clonar(aActualizar), error: null });
      }

      if (self.operacion === 'delete') {
        var aBorrar = self._aplicarFiltros(filas);
        aBorrar.forEach(function (fila) {
          var idx = filas.indexOf(fila);
          if (idx >= 0) filas.splice(idx, 1);
        });
        return resolver({ data: clonar(aBorrar), error: null });
      }

      // SELECT
      var seleccion = self._aplicarFiltros(filas);

      if (self.orden) {
        var campo = self.orden.campo;
        var asc = self.orden.asc;
        seleccion = seleccion.slice().sort(function (a, b) {
          var va = obtenerCampo(a, campo);
          var vb = obtenerCampo(b, campo);
          if (va === vb) return 0;
          if (va === undefined || va === null) return 1;
          if (vb === undefined || vb === null) return -1;
          return (va < vb ? -1 : 1) * (asc ? 1 : -1);
        });
      }

      if (self._limite != null) seleccion = seleccion.slice(0, self._limite);

      if (self._head && self._count) {
        return resolver({ data: null, count: seleccion.length, error: null });
      }

      if (self._single) {
        if (seleccion.length === 0) {
          return resolver({
            data: null,
            error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }
          });
        }
        if (seleccion.length > 1) {
          // Fiel a PostgREST: .single() con varias filas es un ERROR, no la primera.
          return resolver({
            data: null,
            error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }
          });
        }
        return resolver({ data: clonar(seleccion[0]), error: null });
      }

      if (self._maybeSingle) {
        return resolver({ data: seleccion.length ? clonar(seleccion[0]) : null, error: null });
      }

      resolver({ data: clonar(seleccion), count: seleccion.length, error: null });
    });
  };

  return {
    from: function (tabla) { return new Builder(tabla); },
    storage: {
      from: function () {
        return {
          upload: function () { return Promise.resolve({ data: { path: 'fake.pdf' }, error: null }); },
          createSignedUrl: function () {
            return Promise.resolve({ data: { signedUrl: 'https://fake.supabase.co/firmada.pdf' }, error: null });
          }
        };
      }
    },
    // Utilidades de test
    _tablas: tablas,
    _llamadas: registroLlamadas,
    _volcar: function (tabla) { return clonar(tablas[tabla] || []); }
  };
}

module.exports = { crearFakeSupabase: crearFakeSupabase };
