import { runtimeConfig } from './config/runtime.js';
import app from './app.js';

const PORT = runtimeConfig.port;

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
