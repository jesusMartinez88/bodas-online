import { ChangeDetectionStrategy, Component } from '@angular/core';
import { InvitationTemplateComponent } from '../invitation-template/invitation-template.component';

/**
 * Wrapper para la invitación de Helena & Juan.
 *
 * Toda la lógica y el layout viven en `InvitationTemplateComponent`.
 * Este componente solo aporta los datos concretos de esta boda
 * (slug + nombres) y se mantiene por compatibilidad con la ruta
 * `/helena-juan` registrada en `app.routes.ts`.
 */
@Component({
  selector: 'app-helena-juan-invitation',
  standalone: true,
  imports: [InvitationTemplateComponent],
  template: `
    <app-invitation-template
      slug="helena-juan"
      partner1Name="Helena"
      partner2Name="Juan"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelenaJuanComponent {}
