const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMessage } = require('./message');

const base = {
  name: 'Ana García',
  company: 'Industrias Ejemplo S.A.',
  email: 'ana@ejemplo.com',
  phone: '+34 600 000 000',
  technology: 'machining',
  projectType: 'short-run',
  pieces: 5000,
  date: '2027-03-15',
  message: 'Necesitamos 5.000 ejes mecanizados.',
  services: ['tooling', 'approval'],
  lang: 'es',
  createdAt: new Date('2026-10-08T14:20:00Z')
};

test('incluye los datos principales con etiquetas legibles', () => {
  const mail = buildMessage(base, { to: 'info@lcc.test', from: 'web@lcc.test' });
  assert.equal(mail.to, 'info@lcc.test');
  assert.equal(mail.replyTo, 'ana@ejemplo.com');
  assert.match(mail.subject, /Industrias Ejemplo S\.A\. \(Ana García\)/);
  assert.match(mail.text, /Tipo de fabricación: Mecanizado/);
  assert.match(mail.text, /Tipo de proyecto: Serie corta/);
  assert.match(mail.text, /Servicios adicionales: Utillajes, Homologación/);
  assert.match(mail.text, /Recibida: 2026-10-08 14:20 UTC/);
  assert.match(mail.text, /Mensaje:\nNecesitamos 5\.000 ejes mecanizados\./);
});

test('omite los campos opcionales vacíos', () => {
  const mail = buildMessage({ ...base, phone: undefined, services: [], pieces: undefined }, { to: 'a@b.c', from: 'd@e.f' });
  assert.doesNotMatch(mail.text, /Teléfono/);
  assert.doesNotMatch(mail.text, /Servicios adicionales/);
  assert.doesNotMatch(mail.text, /Piezas por año/);
});

test('evita la inyección de cabeceras en asunto y respuesta', () => {
  const mail = buildMessage({ ...base, name: 'Eva\r\nBcc: x@y.z', email: 'eva@x.com\r\nBcc: x@y.z' }, { to: 'a@b.c', from: 'd@e.f' });
  assert.doesNotMatch(mail.subject, /[\r\n]/);
  assert.doesNotMatch(mail.replyTo, /[\r\n]/);
});

test('acepta fechas de Firestore (Timestamp)', () => {
  const timestamp = { toDate: () => new Date('2026-01-02T03:04:00Z') };
  const mail = buildMessage({ ...base, createdAt: timestamp }, { to: 'a@b.c', from: 'd@e.f' });
  assert.match(mail.text, /Recibida: 2026-01-02 03:04 UTC/);
});
