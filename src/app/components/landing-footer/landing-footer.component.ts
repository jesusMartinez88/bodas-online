import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { SectionNavigationService } from '../../services/section-navigation.service';
import { AdminService } from '../../services/admin.service';

/**
 * Footer compartido por las páginas públicas de marketing:
 *  - Landing principal (`/`)
 *  - Página de contacto (`/contacto`)
 *  - Cualquier futura ruta pública que herede la misma identidad visual.
 *
 * Importante: este componente **no** forma parte de las invitaciones
 * personales (`:tenant` → `JudithJesusComponent`, etc.), que tienen su
 * propio `InvitationFooterComponent` en `shared/components/invitation-footer`.
 *
 * La navegación a secciones se delega a `SectionNavigationService` para
 * que sea consistente con `LandingHeaderComponent`.
 */
@Component({
  selector: 'app-landing-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing-footer.component.html',
  styleUrl: './landing-footer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingFooterComponent {
  private readonly nav = inject(SectionNavigationService);
  private readonly adminService = inject(AdminService);

  /** Año del copyright: se evalúa una sola vez al instanciar el componente. */
  readonly copyrightYear = new Date().getFullYear();

  /** Email de soporte que se muestra en el footer y al que apunta el `mailto:`. */
  readonly supportEmail = environment.landingContact.supportEmail;

  /** Texto del email (alias legible si difiere del address). */
  readonly supportEmailLabel = environment.landingContact.supportEmail;

  /** Número de WhatsApp en formato internacional SIN `+` (formato wa.me). */
  readonly whatsappNumber = environment.landingContact.whatsappNumber;

  /** Texto humano del WhatsApp. */
  readonly whatsappDisplay = environment.landingContact.whatsappDisplay;

  /**
   * URL completa de `wa.me`. Si hay mensaje predefinido, se añade como
   * query string `?text=` codificado.
   */
  readonly whatsappUrl = this.buildWhatsAppUrl();

  private buildWhatsAppUrl(): string {
    const base = `https://wa.me/${this.whatsappNumber}`;
    const prefill = environment.landingContact.whatsappPrefill;
    if (!prefill) return base;
    return `${base}?text=${encodeURIComponent(prefill)}`;
  }

  /**
   * Wrapper que se usa desde la plantilla: delega en el servicio y
   * mantiene la forma `(click)="goToSection($event, 'X')"`.
   */
  goToSection(event: Event, sectionId: string): void {
    this.nav.goToSection(event, sectionId);
  }

  /** Notifica al backend que el visitante ha hecho click en un CTA de "Registrar". */
  onRegisterClick(): void {
    this.adminService.trackRegisterClick();
  }
}
