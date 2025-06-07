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