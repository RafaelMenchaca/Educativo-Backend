// index.js
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para leer JSON
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('Servidor educativo-ia funcionando 🚀');
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
