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
        detalles_completos
    } = req.body;

    try {
        const { data, error } = await supabase
            .from('planeaciones')
            .insert([
                {
                    materia,
                    grado,
                    tema,
                    duracion: parseInt(duracion),
                    detalles_completos
                }
            ])
            .select(); // 👈 Esto asegura que Supabase devuelva el ID generado

        if (error) throw error;

        // ✅ Retornar solo el ID para usarlo en detalle.html?id=XX
        res.status(201).json({ id: data[0].id });
    } catch (err) {
        console.error("❌ Error al insertar:", err.message);
        res.status(500).json({ error: err.message });
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

// Obtener una sola planeación por ID
app.get('/api/planeaciones/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('planeaciones')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        res.json(data);
    } catch (err) {
        console.error('❌ Error al obtener planeación:', err.message);
        res.status(500).json({ error: 'Error al obtener planeación' });
    }
});

// Boton para borrar una planeación
app.delete('/api/planeaciones/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('planeaciones')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({ message: 'Planeación eliminada' });
    } catch (err) {
        console.error('❌ Error al eliminar planeación:', err.message);
        res.status(500).json({ error: 'Error al eliminar planeación' });
    }
});



