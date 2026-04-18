'use strict';

const GeneradorPDFBase = require('./GeneradorPDFBase');
const GRUPOS = require('../../modulos/vehiculos/preoperacional/validaciones').GRUPOS;
const utils = require('../../modulos/vehiculos/preoperacional/validaciones');

class GeneradorPDFPreoperacional extends GeneradorPDFBase {
  constructor() {
    super();
  }

  async generar(sesion) {
    const fotosDescargadas = await this.descargarImagenes(sesion.fotos || []);
    
    const ahora = this.obtenerFechaColombia();
    const fecha = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;

    // --- PÁGINA 1 ---
    this.agregarFooter();
    let y = this.agregarHeaderPrimera({
      subtitulo: 'Inspeccion Preoperacional de Vehiculo',
      codDoc: 'COD: PREOP-001',
      resolucion: 'RES: 40595 DE 2022 (PESV)'
    });

    // Hero del vehículo
    y = this.agregarHeroVehiculo(y + 5, sesion.vehiculo, sesion.placa);

    // Tarjetas de info
    const conductor = sesion.conductor || {};
    const nombreCond = conductor.nombre || 'N/R';
    const licenciaCat = conductor.licencia_categoria ? `Cat. ${conductor.licencia_categoria}` : 'N/R';
    const diaNum = ahora.getDate();
    const mesNombre = ahora.toLocaleDateString('es-CO', { month: 'long' });
    const horaStr = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const fechaCorta = `${diaNum}/${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)} ${horaStr}`;

    y = this.agregarTarjetasInfo(y, [
      { label: 'PILOTO', value: nombreCond },
      { label: 'LICENCIA', value: licenciaCat },
      { label: 'ODOMETRO', value: `${sesion.kilometraje || 0} km` },
      { label: 'FECHA', value: fechaCorta }
    ]);

    // Documentos vigentes
    y = this.checkY(y, 80, sesion.placa, fecha);
    y = this.agregarSeccionDocumentos(y, sesion.vehiculo, conductor);

    // --- NOVEDADES CRÍTICAS ---
    const novedades = sesion.novedades || [];
    if (novedades.length > 0) {
      y = this.checkY(y, 30, sesion.placa, fecha);
      this.doc.rect(M, y, this.LAYOUT.anchoUtil, 18).fill(C.negro);
      this.doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold')
        .text('NOVEDADES CRITICAS REPORTADAS', M + 10, y + 5);
      y += 25;

      for (let nov of novedades) {
        y = this.checkY(y, 36, sesion.placa, fecha);
        const novColor = nov.critico ? C.rojo : C.amarillo;

        this.doc.rect(M, y, 3, 28).fill(novColor);
        this.doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
          .text(nov.grupo || '', M + 10, y + 2);

        const estadoDesc = nov.nota || nov.estado || '';
        this.doc.fill(novColor).fontSize(8).font('Helvetica-Bold')
          .text(
            `${nov.item || ''}${estadoDesc ? ` (${estadoDesc.toUpperCase()})` : ''}`,
            M + 10, y + 14
          );

        if (nov.critico) {
          this.doc.rect(480, y + 5, 80, 14).fill(C.rojoCla);
          this.doc.fill(C.rojo).fontSize(6).font('Helvetica-Bold')
            .text('Alerta Supervisor', 485, y + 9);
        }
        y += 35;
      }
    }

    // --- BLOQUES DE INSPECCIÓN ---
    for (let grupo of GRUPOS) {
      y = this.checkY(y, 40, sesion.placa, fecha);

      this.doc.rect(M, y, this.LAYOUT.anchoUtil, 16).fill(C.grisFondo);
      this.doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
        .text(grupo.nombre, M + 10, y + 4);
      y += 22;

      const respuesta = (sesion.respuestas && sesion.respuestas[grupo.id]) ? sesion.respuestas[grupo.id] : null;
      const itemsReportados = (respuesta && respuesta.items) ? respuesta.items : [];
      const mapaEstados = {};
      for (let ri = 0; ri < itemsReportados.length; ri++) {
        mapaEstados[itemsReportados[ri].nombre] = itemsReportados[ri].estado;
      }

      for (let itemDef of grupo.items) {
        y = this.checkY(y, 22, sesion.placa, fecha);
        const estadoVal = mapaEstados.hasOwnProperty(itemDef.nombre) ? mapaEstados[itemDef.nombre] : 'OK';
        const clasificacion = utils.clasificarEstado(estadoVal);
        const estadoTexto = typeof estadoVal === 'number'
          ? (estadoVal === 1 ? 'OK' : estadoVal === 2 ? 'Atencion' : estadoVal === 3 ? 'Malo' : 'N/A')
          : (estadoVal || 'OK');

        let estadoColor = C.verde;
        if (clasificacion === 'advertencia') estadoColor = C.amarillo;
        else if (clasificacion === 'na') estadoColor = C.grisCla;
        else if (clasificacion !== 'ok') estadoColor = C.rojo;

        this.doc.fill(C.negro).fontSize(8).font('Helvetica')
          .text(itemDef.nombre, M + 10, y);
        this.doc.fill(estadoColor).fontSize(8).font('Helvetica-Bold')
          .text(estadoTexto, 405, y, { width: 135, align: 'right' });

        y += 12;
        this.doc.moveTo(M + 10, y).lineTo(this.LAYOUT.PAGE_W - M, y)
          .strokeColor(C.grisLin).lineWidth(0.3).stroke();
        y += 8;
      }
      y += 5;
    }

    // --- OBSERVACIONES ---
    if (sesion.observacion) {
      y = this.checkY(y, 50, sesion.placa, fecha);
      this.doc.rect(M, y, this.LAYOUT.anchoUtil, 16).fill(C.grisFondo);
      this.doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
        .text('OBSERVACIONES', M + 10, y + 4);
      y += 22;
      this.doc.fill(C.grisOsc).fontSize(8).font('Helvetica')
        .text(sesion.observacion, M + 10, y, { width: 500 });
      y += 25;
    }

    // --- FOTOS ---
    y = this.agregarFotos(y, fotosDescargadas, '', sesion.placa, fecha);

    // --- FIRMA DIGITAL ---
    y = this.checkY(y, 120, sesion.placa, fecha);
    this.agregarFirmaDigital(y, {
      nombre: conductor.nombre,
      cedula: conductor.cedula,
      telefono: sesion.telefono || conductor.telefono,
      fecha: ahora,
      placa: sesion.placa
    });

    return await this.obtenerBuffer();
  }
}

module.exports = GeneradorPDFPreoperacional;
