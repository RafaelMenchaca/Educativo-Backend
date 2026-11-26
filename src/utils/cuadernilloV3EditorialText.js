function normalizeParagraphSeparators(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/(?:(?:\\r\\n|\\n|\\r)){2,}/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n');
}

function normalizeStringArray(values) {
  return Array.isArray(values) ? values.map(normalizeParagraphSeparators) : values;
}

export function normalizeCuadernilloV3EditorialBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
  if (typeof block.titulo === 'string') block.titulo = normalizeParagraphSeparators(block.titulo);
  switch (block.tipo) {
    case 'texto':
      block.contenido = normalizeParagraphSeparators(block.contenido);
      break;
    case 'lista':
      block.items = normalizeStringArray(block.items);
      break;
    case 'conceptos':
      if (Array.isArray(block.items)) block.items = block.items.map((item) => ({
        ...item,
        termino: normalizeParagraphSeparators(item?.termino),
        explicacion: normalizeParagraphSeparators(item?.explicacion),
        ...(item?.ejemplo === undefined ? {} : { ejemplo: normalizeParagraphSeparators(item.ejemplo) })
      }));
      break;
    case 'actividad':
      block.instrucciones = normalizeParagraphSeparators(block.instrucciones);
      if (Array.isArray(block.items)) block.items = block.items.map((item) => ({
        ...item,
        enunciado: normalizeParagraphSeparators(item?.enunciado),
        ...(Array.isArray(item?.opciones) ? { opciones: normalizeStringArray(item.opciones) } : {})
      }));
      break;
    case 'procedimiento':
      block.pasos = normalizeStringArray(block.pasos);
      break;
    case 'ejemplo_resuelto':
      block.enunciado = normalizeParagraphSeparators(block.enunciado);
      block.pasos = normalizeStringArray(block.pasos);
      block.interpretacion = normalizeParagraphSeparators(block.interpretacion);
      block.verificacion = normalizeStringArray(block.verificacion);
      break;
    case 'proyecto':
      block.producto = normalizeParagraphSeparators(block.producto);
      block.instrucciones = normalizeParagraphSeparators(block.instrucciones);
      block.etapas = normalizeStringArray(block.etapas);
      break;
    case 'registro':
      block.campos = normalizeStringArray(block.campos);
      break;
    case 'espacio_respuesta':
      block.etiqueta = normalizeParagraphSeparators(block.etiqueta);
      break;
    default:
      break;
  }
  return block;
}

export { normalizeParagraphSeparators };
