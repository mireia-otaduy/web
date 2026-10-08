/**
 * Construye el correo de aviso a partir de una solicitud guardada en Firestore.
 * Es una función pura (sin Firebase ni red) para poder probarla fácilmente.
 */

const LABELS = {
  technology: {
    stamping: 'Estampación metálica',
    forging: 'Forja',
    tube: 'Conformado de tubo',
    machining: 'Mecanizado',
    wire: 'Corte por hilo',
    welding: 'Soldadura',
    molds: 'Moldes de inyección',
    other: 'Otra'
  },
  projectType: { prototype: 'Prototipo', 'short-run': 'Serie corta', 'long-run': 'Serie larga' },
  services: { approval: 'Homologación', tooling: 'Utillajes', warehouse: 'Almacén regulador' },
  lang: { es: 'Español', en: 'Inglés', zh: 'Chino' }
};

/** Quita saltos de línea de los campos que van a la cabecera del correo (evita inyección de cabeceras). */
const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

/** Fecha de Firestore (Timestamp), Date o cadena ISO → texto legible. */
function formatDate(value) {
  const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function buildMessage(data, { to, from }) {
  const services = Array.isArray(data.services) ? data.services.map((key) => LABELS.services[key] ?? key).join(', ') : '';
  const rows = [
    ['Nombre', data.name],
    ['Empresa', data.company],
    ['Email', data.email],
    ['Teléfono', data.phone],
    ['Tipo de fabricación', LABELS.technology[data.technology] ?? data.technology],
    ['Tipo de proyecto', LABELS.projectType[data.projectType] ?? data.projectType],
    ['Piezas por año', data.pieces],
    ['Primeras piezas para el', data.date],
    ['Servicios adicionales', services],
    ['Idioma de la web', LABELS.lang[data.lang] ?? data.lang],
    ['Recibida', formatDate(data.createdAt)]
  ]
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `${label}: ${value}`);

  return {
    from,
    to,
    replyTo: oneLine(data.email),
    subject: `Nueva solicitud de presupuesto web: ${oneLine(data.company)} (${oneLine(data.name)})`,
    text: `${rows.join('\n')}\n\nMensaje:\n${String(data.message ?? '').trim()}\n`
  };
}

module.exports = { buildMessage };
