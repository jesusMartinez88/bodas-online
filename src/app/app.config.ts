import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './services/auth.interceptor';

// En Angular 22+ el backend HTTP por defecto ya usa fetch.
// `withFetch()` quedó deprecado y no es necesario en SSR ni en browser.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        // Sin esto, el router ignora el fragmento de la URL y devuelve el
        // scroll al inicio: los deep-links del tipo `/judith-jesus#rsvp`
        // se abrían en la sección equivocada.
        anchorScrolling: 'enabled',
      }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
