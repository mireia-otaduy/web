/**
 * Aviso por correo de nuevas solicitudes de presupuesto (OPCIONAL).
 *
 * Se ejecuta cada vez que el formulario web guarda un documento en la colección
 * "solicitudes" de Firestore y envía un correo con los datos a la dirección configurada.
 *
 * Requisitos: plan Blaze de Firebase (las funciones necesitan poder salir a internet)
 * y una cuenta de correo SMTP. Instrucciones completas en el README, apartado
 * "Avisos por correo".
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const nodemailer = require('nodemailer');
const { buildMessage } = require('./message');

// Parámetros: el servidor y el usuario se piden al desplegar; la contraseña se guarda como secreto
const SMTP_HOST = defineString('SMTP_HOST');
const SMTP_PORT = defineString('SMTP_PORT', { default: '465' });
const SMTP_USER = defineString('SMTP_USER');
const MAIL_TO = defineString('MAIL_TO');
const SMTP_PASS = defineSecret('SMTP_PASS');

exports.notificarSolicitud = onDocumentCreated(
  {
    document: 'solicitudes/{requestId}',
    // Debe coincidir con la ubicación de la base de datos Firestore (consola de Firebase → Firestore)
    region: 'europe-west1',
    secrets: [SMTP_PASS]
  },
  async (event) => {
    const data = event.data && event.data.data();
    if (!data) return;

    const port = Number(SMTP_PORT.value());
    const transport = nodemailer.createTransport({
      host: SMTP_HOST.value(),
      port,
      secure: port === 465,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() }
    });

    await transport.sendMail(buildMessage(data, { to: MAIL_TO.value(), from: SMTP_USER.value() }));
    logger.info('Solicitud de presupuesto notificada por correo', { requestId: event.params.requestId });
  }
);
