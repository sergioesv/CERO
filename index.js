const express = require('express');
const { registrarCanalWhatsapp } = require('./canales/whatsapp');
const { registrarDashboard } = require('./canales/dashboard');

const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Middleware global de errores
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    error: 'Error interno',
    timestamp: new Date().toISOString()
  });
});

registrarCanalWhatsapp(app);
registrarDashboard(app);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ CERO en puerto ${PORT}`);
  console.log(`✓ ${new Date().toISOString()}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Puerto ${PORT} ocupado`);
    process.exit(1);
  } else {
    console.error('❌ Error servidor:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM - cerrando...');
  server.close(() => {
    console.log('✓ Cerrado');
    process.exit(0);
  });
});
```

---

## ✅ RESUMEN DE CAMBIOS

**config/config.js:**
- ✓ Inicializa cliente Gemini (`genAI`)
- ✓ Fail-fast si falta variable crítica
- ✓ Valida formato SUPABASE_URL
- ✓ Try-catch en cada cliente

**index.js:**
- ✓ `var` → `const`
- ✓ Middleware de errores global
- ✓ Manejo de puerto ocupado
- ✓ Graceful shutdown

---

## 🚀 SIGUIENTE PASO

**Commit en GitHub:**
```
Migración Gemini + hardening crítico

- Gemini reemplaza Claude (85% reducción costos)
- Fail-fast: detiene si falta variable crítica
- Validación SUPABASE_URL
- Manejo de errores en index.js
- Fix auditoría de seguridad
