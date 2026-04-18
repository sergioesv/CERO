process.env.GOOGLE_API_KEY = 'dummy';
process.env.SUPABASE_URL = 'https://dummy.supabase.co';
process.env.SUPABASE_KEY = 'dummy';
process.env.TWILIO_ACCOUNT_SID = 'ACdummy';
process.env.TWILIO_AUTH_TOKEN = 'dummy';
process.env.JWT_SECRET = 'dummy';

const fs = require('fs');
const path = require('path');
const GeneradorPDFPreoperacional = require('../servicios/pdf/GeneradorPDFPreoperacional');
const GeneradorPDFPosoperacional = require('../servicios/pdf/GeneradorPDFPosoperacional');

async function testPDFs() {
  console.log('Generando PDF Preoperacional de prueba con la nueva clase...');
  
  const sesionPreop = {
    placa: 'AAA123',
    vehiculo: {
      marca: 'Toyota',
      modelo: 'Hilux',
      anio: 2022,
      soat_vencimiento: '2026-12-31',
      tecnomecanica_vencimiento: '2026-12-31'
    },
    conductor: {
      nombre: 'Carlos Ramirez',
      cedula: '1020304050',
      licencia_categoria: 'C2',
      licencia_vencimiento: '2028-01-01',
      telefono: 'whatsapp:+573001234567'
    },
    kilometraje: 45000,
    telefono: 'whatsapp:+573001234567',
    novedades: [
      {
        grupo: 'Luces',
        item: 'Luz direccional izquierda',
        estado: 'Malo',
        critico: true,
        nota: 'Rota'
      }
    ],
    respuestas: {
      'luces': {
        items: [
          { nombre: 'Luces frontales', estado: 'OK' },
          { nombre: 'Luz direccional izquierda', estado: 'Malo' }
        ]
      }
    },
    observacion: 'Prueba de generación de PDF preoperacional con POO.',
    fotos: []
  };

  try {
    const generadorPreop = new GeneradorPDFPreoperacional();
    const bufferPreop = await generadorPreop.generar(sesionPreop);
    fs.writeFileSync(path.join(__dirname, '..', 'preop_test_clase.pdf'), bufferPreop);
    console.log('✅ preop_test_clase.pdf generado con éxito.');
  } catch (err) {
    console.error('Error generando preop_test_clase.pdf:', err);
  }

  console.log('Generando PDF Posoperacional de prueba con la nueva clase...');
  
  const sesionPosop = {
    placa: 'AAA123',
    vehiculo: {
      soat_vencimiento: '2026-12-31',
      tecnomecanica_vencimiento: '2026-12-31'
    },
    conductorNombre: 'Carlos Ramirez',
    conductorCedula: '1020304050',
    conductorLicenciaVencimiento: '2028-01-01',
    conductorTelefono: 'whatsapp:+573001234567',
    kilometrajeFinal: 45100,
    kmReferencia: 45000,
    kmReferenciaOrigen: 'Preoperacional',
    diferenciaKm: 100,
    novedades: [
      {
        severidad: 'leve',
        texto: 'El vehículo está sucio.'
      }
    ],
    observacion: 'Prueba de generación de PDF posoperacional con POO.',
    fotos: []
  };

  try {
    const generadorPosop = new GeneradorPDFPosoperacional();
    const bufferPosop = await generadorPosop.generar(sesionPosop);
    fs.writeFileSync(path.join(__dirname, '..', 'posop_test_clase.pdf'), bufferPosop);
    console.log('✅ posop_test_clase.pdf generado con éxito.');
  } catch (err) {
    console.error('Error generando posop_test_clase.pdf:', err);
  }
}

testPDFs();
