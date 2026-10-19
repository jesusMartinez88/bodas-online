import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SectionNavigationService } from '../../services/section-navigation.service';
import { AdminService } from '../../services/admin.service';

interface NavItem {
  label: string;
  sectionId: string;
}

/**
 * Header sticky compartido por las páginas públicas de marketing:
 *  - Landing principal (`/`)
 *  - Página de contacto (`/contacto`)
 *  - Cualquier futura ruta pública que herede la misma identidad visual.
 *
 * Mantiene su propio estado (drawer móvil) y delega la navegación a
 * secciones a `SectionNavigationService` para que sea consistente con el
 * footer.
 */
@Component({
  selector: 'app-landing-header',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing-header.component.html',
  styleUrl: './landing-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingHeaderComponent {
  private readonly nav = inject(SectionNavigationService);
  private readonly adminService = inject(AdminService);

  /** Secciones ancladas de la landing principal. */
  readonly sectionLinks: NavItem[] = [
    { label: 'Funcionalidades', sectionId: 'caracteristicas' },
    { label: 'Vista Previa', sectionId: 'demo' },
    { label: '¿Por qué digital?', sectionId: 'comparativa' },
    { label: 'Opiniones', sectionId: 'testimonios' },
    { label: 'Precios', sectionId: 'precios' },
    { label: 'Preguntas', sectionId: 'faq' },
  ];

  readonly isMobileMenuOpen = signal<boolean>(false);

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  /** Wrapper para que la plantilla pueda pasar `$event` directamente. */
  goToSection(event: Event, sectionId: string): void {
    this.nav.goToSection(event, sectionId);
    // Si el drawer estaba abierto al scrollear, lo cerramos.
    this.closeMobileMenu();
  }

  /** Notifica al backend que el visitante ha hecho click en un CTA de "Registrar". */
  onRegisterClick(): void {
    this.adminService.trackRegisterClick();
    this.closeMobileMenu();
  }
}
