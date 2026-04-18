'use strict';

const GeneradorPDFBase = require('./GeneradorPDFBase');

class GeneradorPDFPosoperacional extends GeneradorPDFBase {
  constructor() {
    super();
  }

  async generar(datosSesion) {
    const fotos = Array.isArray(datosSesion.fotos) ? datosSesion.fotos : [];
    const fotosDescargadas = await this.descargarImagenes(fotos);
    
    const ahora = this.obtenerFechaColombia();
    const fecha = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const C = this.LAYOUT.colores;
    const M = this.LAYOUT.margin;

    // --- PÁGINA 1 ---
    this.agregarFooter();
    let y = this.agregarHeaderPrimera({
      subtitulo: 'Cierre de Jornada — Posoperacional',
      codDoc: 'COD: POSOP-001',
      resolucion: 'RES: 40595 DE 2022 (PESV)'
    });

    // Tarjetas de info
    const kmFinal = `${(datosSesion.kilometrajeFinal || 0).toLocaleString('es-CO')} km`;
    const diaNum = ahora.getDate();
    const mesNom = ahora.toLocaleDateString('es-CO', { month: 'long' });
    const horaStr = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const fechaCorta = `${diaNum}/${mesNom.charAt(0).toUpperCase() + mesNom.slice(1)} ${horaStr}`;

    y = this.agregarTarjetasInfo(y, [
      { label: 'CONDUCTOR', value: datosSesion.conductorNombre || 'N/R' },
      { label: 'CEDULA', value: datosSesion.conductorCedula || 'N/R' },
      { label: 'KM FINAL', value: kmFinal },
      { label: 'FECHA', value: fechaCorta }
    ]);

    // Fila de km referencia y diferencia
    if (typeof datosSesion.kmReferencia === 'number') {
      y = this.checkY(y, 18, 'POSOPERACIONAL', fecha);
      let difTexto = '';
      if (typeof datosSesion.diferenciaKm === 'number') {
        difTexto = ` (${datosSesion.diferenciaKm >= 0 ? '+' : ''}${datosSesion.diferenciaKm.toLocaleString('es-CO')} km)`;
      }
      const origenRef = datosSesion.kmReferenciaOrigen ? ` — ${datosSesion.kmReferenciaOrigen}` : '';
      this.doc.fill(C.gris).fontSize(8).font('Helvetica')
        .text(
          `Km de referencia: ${datosSesion.kmReferencia.toLocaleString('es-CO')} km${origenRef}${difTexto}`,
          M + 10, y
        );
      y += 16;
    }

    // Alertas de kilometraje
    if (datosSesion.alertasKm && datosSesion.alertasKm.length > 0) {
      y = this.checkY(y, 30, 'POSOPERACIONAL', fecha);
      this.doc.rect(M, y, this.LAYOUT.anchoUtil, 16).fill(C.rojoCla);
      this.doc.fill(C.rojo).fontSize(8).font('Helvetica-Bold')
        .text('ALERTAS DE KILOMETRAJE', M + 10, y + 4);
      y += 22;
      for (let alerta of datosSesion.alertasKm) {
        y = this.checkY(y, 16, 'POSOPERACIONAL', fecha);
        this.doc.fill(C.rojo).fontSize(8).font('Helvetica')
          .text(`• ${alerta.mensaje || alerta.tipo || 'Alerta'}`, M + 10, y, { width: this.LAYOUT.anchoUtil - 20 });
        y = this.doc.y + 4;
      }
      y += 4;
    }

    // --- DOCUMENTOS VIGENTES ---
    y = this.checkY(y, 80, 'POSOPERACIONAL', fecha);
    const vehiculoPosop = datosSesion.vehiculo || {};
    const conductorPosop = {
      licencia_vencimiento: datosSesion.conductorLicenciaVencimiento || null
    };
    y = this.agregarSeccionDocumentos(y, vehiculoPosop, conductorPosop);

    // --- NOVEDAD DEL CIERRE ---
    const novedades = datosSesion.novedades || [];
    if (novedades.length > 0) {
      y = this.checkY(y, 30, 'POSOPERACIONAL', fecha);
      this.doc.rect(M, y, this.LAYOUT.anchoUtil, 16).fill(C.negro);
      this.doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold')
        .text('NOVEDAD REPORTADA AL CIERRE', M + 10, y + 4);
      y += 22;

      for (let nov of novedades) {
        y = this.checkY(y, 40, 'POSOPERACIONAL', fecha);

        let borderColor = C.grisLin;
        let etiquetaSev = 'LEVE';
        if (nov.severidad === 'critica' || nov.critico) {
          borderColor = C.rojo;
          etiquetaSev = 'CRITICA';
        } else if (nov.severidad === 'moderada') {
          borderColor = C.naranja;
          etiquetaSev = 'MODERADA';
        }

        this.doc.rect(M, y, 3, 32).fill(borderColor);

        this.doc.rect(M + 8, y, 60, 13).fill(borderColor);
        this.doc.fill('#ffffff').fontSize(6).font('Helvetica-Bold')
          .text(etiquetaSev, M + 10, y + 3);

        const textoNov = nov.texto || nov.estado || nov.novedadesTexto || 'Sin descripción';
        this.doc.fill(C.negro).fontSize(8).font('Helvetica')
          .text(textoNov, M + 76, y + 2, { width: this.LAYOUT.anchoUtil - 80 });

        y = this.doc.y + 12;
      }
    } else {
      y = this.checkY(y, 20, 'POSOPERACIONAL', fecha);
      this.doc.fill(C.verde).fontSize(8).font('Helvetica-Bold')
        .text('✓ Sin novedades reportadas al cierre', M + 10, y);
      y += 20;
    }

    // --- OBSERVACIÓN FINAL ---
    if (datosSesion.observacion) {
      y = this.checkY(y, 50, 'POSOPERACIONAL', fecha);
      this.doc.rect(M, y, this.LAYOUT.anchoUtil, 16).fill(C.grisFondo);
      this.doc.fill(C.negro).fontSize(8).font('Helvetica-Bold')
        .text('OBSERVACION FINAL', M + 10, y + 4);
      y += 22;
      this.doc.fill(C.grisOsc).fontSize(8).font('Helvetica')
        .text(datosSesion.observacion, M + 10, y, { width: 500 });
      y = this.doc.y + 14;
    }

    // --- FOTOS ---
    y = this.agregarFotos(y, fotosDescargadas, 'POSOPERACIONAL', '', fecha);

    // --- FIRMA DIGITAL ---
    y = this.checkY(y, 120, 'POSOPERACIONAL', fecha);
    this.agregarFirmaDigital(y, {
      nombre: datosSesion.conductorNombre,
      cedula: datosSesion.conductorCedula,
      telefono: datosSesion.conductorTelefono,
      fecha: ahora
    });

    return await this.obtenerBuffer();
  }
}

module.exports = GeneradorPDFPosoperacional;
