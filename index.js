// // index.js
// const express = require('express');
// const app = express();
// const PORT = process.env.PORT || 3000;

// index.js
const cors = require('cors');
const express = require('express');
const supabase = require('./supabaseClient');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Servidor educativo-ia funcionando 🚀');
});

// NUEVA RUTA: Guardar planeación
app.post('/api/planeaciones', async (req, res) => {
    const {
        materia,
        grado,
        tema,
        duracion,
        detalles_completos // este es el objeto con todos los demás datos
    } = req.body;

    try {
        const { data, error } = await supabase
            .from('planeaciones')
            .insert([
                {
                    materia,
                    grado,
                    tema,
                    duracion: parseInt(duracion), // por si viene como string
                    detalles_completos // columna jsonb
                }
            ])
            .select();

        if (error) throw error;

        res.status(201).json({ success: true, data });
    } catch (err) {
        console.error("❌ Error al insertar:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

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

// GET /api/planeaciones - Obtener todas las planeaciones
app.get('/api/planeaciones', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('planeaciones')
            .select('*')
            .order('fecha_creacion', { ascending: false })

        if (error) throw error;

        res.json(data);
    } catch (err) {
        console.error('Error al obtener planeaciones:', err.message);
        res.status(500).json({ error: 'Error al obtener planeaciones' });
    }
});


