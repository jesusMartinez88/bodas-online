export const environment = {
  production: true,
  apiUrl: 'https://boda-backend-4e6z.onrender.com/api/guests',
  apiBaseUrl: 'https://boda-backend-4e6z.onrender.com',

  /**
   * Clave publishable de Stripe para producción. Rellenar con la
   * clave `pk_live_...` del dashboard de Stripe cuando se quiera
   * activar el cobro real a los nuevos registros.
   *
   * Vacía → el frontend mantiene el modo demo (botón simulador) y
   * muestra el aviso "modo desarrollo" como hasta ahora.
   */
  stripePublishableKey: 'pk_live_51UKZeFFmKdwVE0OE8L5UDain37gMfNWdgwGtSDni8dNqyZY9CtQOmqel3JoVAWV8eKZhjoRFEwykLCBzdsmKU8tY00Jn2sXOJy',

  landingContact: {
    supportEmail: 'jesusmartinezsanchez9@gmail.com',
    whatsappNumber: '34695677269',
    whatsappDisplay: '+34 695 677 269',
    whatsappPrefill:
      'Hola Jesús, vengo de la web de BodasOnline y me gustaría hacerte una consulta.',
  },
};

