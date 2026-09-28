import { Routes } from '@angular/router';

import { authGuard, adminGuard, paymentGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./components/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'complete-payment',
    loadComponent: () =>
      import('./components/complete-payment/complete-payment.component').then(
        (m) => m.CompletePaymentComponent,
      ),
    canActivate: [authGuard],
  },
  // Páginas de retorno de Stripe Hosted Checkout (`success_url` /
  // `cancel_url`). Ambas exigen sesión pero NO `paymentGuard`: el
  // usuario aún no ha pagado al llegar a `/payment/success` y debe
  // poder visitar `/payment/cancel` aunque siga sin pagar.
  {
    path: 'payment/success',
    loadComponent: () =>
      import('./components/payment-success/payment-success.component').then(
        (m) => m.PaymentSuccessComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'payment/cancel',
    loadComponent: () =>
      import('./components/payment-cancel/payment-cancel.component').then(
        (m) => m.PaymentCancelComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'judith-jesus',
    loadComponent: () =>
      import('./components/invitations/judith-jesus/judith-jesus.component').then(
        (m) => m.JudithJesusComponent,
      ),
  },
  {
    path: 'helena-juan',
    loadComponent: () =>
      import('./components/invitations/helena-juan/helena-juan.component').then(
        (m) => m.HelenaJuanComponent,
      ),
  },
  {
    path: 'contacto',
    loadComponent: () =>
      import('./components/contact-page/contact-page.component').then(
        (m) => m.ContactPageComponent,
      ),
  },
  {
    path: ':tenant/dashboard',
    loadComponent: () =>
      import('./components/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    // `authGuard` valida el JWT; `paymentGuard` se asegura de que el
    // usuario haya pagado (paidAt !== null) antes de dejarle ver el
    // panel. El admin se salta ambos en la práctica.
    canActivate: [authGuard, paymentGuard],
  },
  {
    path: ':tenant',
    loadComponent: () =>
      import('./components/invitation-not-found/invitation-not-found.component').then(
        (m) => m.InvitationNotFoundComponent,
      ),
  },
  {
    path: 'admin/users',
    loadComponent: () =>
      import('./components/admin-users/admin-users.component').then(
        (m) => m.AdminUsersComponent,
      ),
    canActivate: [authGuard, adminGuard],
  },
  { path: '**', redirectTo: '' },
];
