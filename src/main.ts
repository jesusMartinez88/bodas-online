import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { HealthService } from './app/services/health.service';

// Necesario para que los pipes `number`, `currency`, `date` y `decimal`
// acepten el locale `'es-ES'`. Sin esto, Angular lanza
// `NG0701: Missing locale data for the locale "es-ES"` cada vez que
// el template evalúa `{{ x | number:'1.2-2':'es-ES' }}`. La app usa
// el bundle genérico `es` y lo aliasa al identificador regional
// `es-ES` para mantener consistencia con `Intl` y con
// `toLocaleString('es-ES', ...)`.
registerLocaleData(localeEs, 'es-ES');

bootstrapApplication(App, appConfig)
  .then((moduleRef) => {
    // Warm-up del servidor en paralelo
    const healthService = moduleRef.injector.get(HealthService);
    healthService.warmUpServer();
  })
  .catch((err) => console.error(err));
