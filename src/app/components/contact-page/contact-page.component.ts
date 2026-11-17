import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';

import { LandingContactComponent } from '../landing-contact/landing-contact.component';
import { LandingFooterComponent } from '../landing-footer/landing-footer.component';
import { LandingHeaderComponent } from '../landing-header/landing-header.component';
import { SeoService } from '../../services/seo.service';

/**
 * Página de contacto (ruta `/contacto`).
 *
 * SEO: es contenido público real, así que se declara indexable con su
 * propio `title`, `description` y `canonical`. Antes esta ruta devolvía
 * exactamente el mismo HTML que la landing (mismo `<title>`, mismo
 * canonical, mismo `<h1>`): Google la veía como un duplicado y la
 * consolidaba, desperdiciando la URL.
 *
 * El `<h1>` de la página es el título de la sección de
 * `LandingContactComponent` (`<h1 class="section-title">`): ese componente
 * solo se usa aquí, así que no hay riesgo de duplicar el `<h1>` de la
 * landing.
 */
@Component({
  selector: 'app-contact-page',
  imports: [LandingHeaderComponent, LandingContactComponent, LandingFooterComponent],
  templateUrl: './contact-page.component.html',
  styleUrl: './contact-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactPageComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.update({
      title: 'Contacto · Tu Boda Online',
      description:
        '¿Tienes dudas sobre tu invitación de boda online? Escribinos y te respondemos en menos de 24 horas. Pago único de 59€, lista en 24-48 horas.',
      canonical: 'https://tubodaonline.onrender.com/contacto',
      robots: 'index, follow',
    });
  }
}
