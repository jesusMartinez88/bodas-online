import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { App } from './app/app';
import { config } from './app/app.config.server';

// Mismo registro que en `main.ts`: el prerender de `/login` y `/register`
// evalúa los templates en el servidor, donde también se necesitan los
// datos de locale para los pipes `number` / `date` con `'es-ES'`.
registerLocaleData(localeEs, 'es-ES');

const bootstrap = (context: BootstrapContext) =>
  bootstrapApplication(App, config, context);

export default bootstrap;
