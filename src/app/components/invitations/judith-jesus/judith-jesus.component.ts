import { ChangeDetectionStrategy, Component } from '@angular/core';
import { InvitationTemplateComponent } from '../invitation-template/invitation-template.component';

/**
 * Wrapper para la invitación de Judith & Jesús.
 *
 * Toda la lógica y el layout viven en `InvitationTemplateComponent`.
 * Este componente solo aporta los datos concretos de esta boda
 * (slug + nombres) y se mantiene por compatibilidad con la ruta
 * `/judith-jesus` registrada en `app.routes.ts`.
 */
@Component({
  selector: 'app-judith-jesus-invitation',
  standalone: true,
  imports: [InvitationTemplateComponent],
  template: `
    <app-invitation-template
      slug="judith-jesus"
      partner1Name="Judith"
      partner2Name="Jesús"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudithJesusComponent {}
