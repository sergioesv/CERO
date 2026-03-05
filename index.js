const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('CERO está corriendo');
});

app.post('/webhook', (req, res) => {
  const mensaje = req.body.Body || '';
  const telefono = req.body.From || '';
  const mediaUrl = req.body.MediaUrl0 || null;

  console.log(`Mensaje de ${telefono}: ${mensaje}`);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>BOT MTO: Mensaje recibido. Sistema CERO activo.</Message>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CERO corriendo en puerto ${PORT}`);
});
