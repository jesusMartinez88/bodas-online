import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { SeoService } from '../../services/seo.service';
import { InvitationFooterComponent } from '../../shared/components/invitation-footer/invitation-footer.component';

/**
 * Pantalla que se muestra cuando una invitación no existe (`:tenant`).
 *
 * SEO: esta ruta es la que se carga cuando alguien teclea una URL
 * inválida. Sin un `noindex` explícito, cada slug inventado (`/pedro-luis`,
 * `/xyz123`, …) devuelve el mismo HTML con `index, follow` y Google los
 * indexa como páginas de contenido: son los soft 404 que consumen el
 * presupuesto de rastreo y hacen que el sitio entero parezca de baja
 * calidad. Con `noindex, follow` Google los descarta pero sigue los
 * enlaces, así que no pierde el descubrimiento por backlinks.
 *
 * El canonical apunta a la home: si algún día esta URL se enlaza desde
 * fuera, la autoridad se transfiere a la landing en lugar de quedar
 * repartida en URLs de error.
 */
@Component({
  selector: 'app-invitation-not-found',
  imports: [RouterLink, InvitationFooterComponent],
  templateUrl: './invitation-not-found.component.html',
  styleUrl: './invitation-not-found.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvitationNotFoundComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.update({
      title: 'Invitación no encontrada · Tu Boda Online',
      description:
        'Esta invitación no existe o el enlace no es válido. Descubre Tu Boda Online para crear la invitación de boda online de tu pareja.',
      canonical: 'https://tubodaonline.onrender.com/',
      robots: 'noindex, follow',
    });
  }
}
