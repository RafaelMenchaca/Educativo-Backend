# 🧠 Educativo Backend - API para Planeaciones Docentes

Este proyecto representa el backend de **Educativo IA**, una plataforma que permite a docentes generar planeaciones pedagógicas usando inteligencia artificial.

## 📦 Tecnologías usadas

- **Node.js + Express**
- **Supabase** como base de datos (PostgreSQL)
- **dotenv** para gestionar variables de entorno
- **CORS** para acceso desde frontend desplegado
- **ES Modules** (`type: module` en package.json)

---

## 🚀 Rutas disponibles

| Método | Ruta                        | Descripción                          |
|--------|-----------------------------|--------------------------------------|
| GET    | `/`                         | Verifica que el servidor esté activo |
| GET    | `/api/planeaciones`         | Devuelve todas las planeaciones      |
| GET    | `/api/planeaciones/:id`     | Devuelve una planeación por ID       |
| POST   | `/api/planeaciones`         | Inserta una nueva planeación         |
| DELETE | `/api/planeaciones/:id`     | Elimina una planeación por ID        |

---

📁 Estructura

```bash
/Educativo-Backend
├── index.js               # Archivo principal del servidor Express
├── supabaseClient.js     # Cliente Supabase exportado como módulo
├── .env                  # Variables de entorno 
├── package.json
└── README.md             # ← Este archivo
```

---

🧑‍💻 Autores
Desarrollado por Rafael Menchaca, Juan Zuniga, Iram Zapata como parte del proyecto Educativo IA.





# 🧠 Educativo Backend – API para Planeaciones Didácticas con IA

**Educativo Backend** es la API que impulsa [Educativo IA](https://rafaelmenchaca.com), una plataforma que permite generar planeaciones pedagógicas completas mediante **inteligencia artificial**.  
El servidor gestiona la conexión entre el frontend, la base de datos Supabase y el modelo de IA GPT-4o-mini.

---

## ⚙️ Tecnologías principales

- 🟩 **Node.js + Express**
- 🗄️ **Supabase (PostgreSQL)** como base de datos principal  
- 🔐 **dotenv** para variables de entorno seguras  
- 🌍 **CORS** configurado para entornos local y producción  
- 📡 **OpenAI GPT-4o-mini** como motor de generación IA  
- 📦 **ES Modules** (`"type": "module"` en package.json)

---

## 🚀 Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| **GET** | `/` | Verifica que el servidor está activo |
| **GET** | `/health` | Healthcheck general |
| **GET** | `/api/planeaciones` | Lista todas las planeaciones |
| **GET** | `/api/planeaciones/:id` | Devuelve una planeación específica |
| **POST** | `/api/planeaciones` | Crea una nueva planeación |
| **PUT** | `/api/planeaciones/:id` | Actualiza datos de una planeación existente |
| **DELETE** | `/api/planeaciones/:id` | Elimina una planeación por ID |
| **POST** | `/api/planeaciones/generate` | Genera una planeación automáticamente usando IA 🤖 |

> ⚠️ Nota: `/api/planeaciones/generate` usa el modelo **GPT-4o-mini** con prompt optimizado para PAEC, productos e instrumentos de evaluación.

---

## 🔐 Variables de entorno requeridas (.env)

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=your-supabase-service-key
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
CORS_ORIGIN=https://rafaelmenchaca.github.io,https://rafaelmenchaca.com
PORT=3000
NODE_ENV=production
```
💡 En Render, estas variables deben configurarse desde el panel de Environment → Environment Variables.

## ☁️ Despliegue
Hosting: Render.com

Build command: npm install

Start command: node index.js

Node version: 22.x

El backend se ejecuta automáticamente en cada push al branch main.

## 🧠 Estado actual (v1.0 – AI Integration)
✅ IA funcional con generación automática de planeaciones

✅ Conexión estable con Supabase

✅ CORS configurado para producción

✅ Logs de error detallados para depuración

⚙️ Preparado para futuras mejoras (IA adaptativa, autenticación Supabase)

## 📄 Licencia
© 2026 Rafael Menchaca.
Proyecto en desarrollo por **Rafael Menchaca, Juan Zuñiga**
Todos los derechos reservados.