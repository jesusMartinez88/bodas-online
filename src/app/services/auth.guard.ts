import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }
  router.navigate(['/login']);
  return false;
};

/**
 * Bloquea rutas que requieren pago confirmado. Asume que `authGuard`
 * corre antes.
 *
 *   - Si el usuario NO ha pagado (`paidAt === null`) → redirige a
 *     `/complete-payment` para que complete el checkout con Stripe
 *     (o el modo demo si no hay claves configuradas).
 *   - Si ya pagó → deja pasar.
 *   - El admin no se bloquea nunca (gestiona el sistema, no es un
 *     "cliente" que deba pasar por el pago).
 *
 * Importante: este guard consulta la signal `currentUser.paidAt`,
 * que se mantiene sincronizada de forma optimista tras un pago
 * exitoso (ver `AuthService.markAsPaid`). El webhook sigue siendo
 * la fuente de verdad para el backend.
 */
export const paymentGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (authService.isAdmin()) {
    return true;
  }

  const user = authService.currentUser();
  if (user?.paidAt) {
    return true;
  }

  // No pagado → mandamos a completar el pago. El componente
  // `/complete-payment` es el único punto de entrada válido.
  router.navigate(['/complete-payment']);
  return false;
};

/**
 * Protege rutas que solo el admin puede ver. Asume que `authGuard` corre antes
 * (el canActivate se evalúa en orden y todos deben pasar). Si el usuario
 * está autenticado pero NO es admin, lo mandamos a su dashboard.
 */
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (authService.isAdmin()) {
    return true;
  }

  // Usuario autenticado pero sin permisos: lo mandamos a su dashboard.
  // Si aún no ha pagado, el `paymentGuard` del dashboard lo redirigirá
  // a `/complete-payment` cuando navegue allí.
  const slug = authService.currentUser()?.slug;
  router.navigate(slug ? [`/${slug}/dashboard`] : ['/login']);
  return false;
};
