import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  input,
} from '@angular/core';
import AOS from 'aos';

import { HeroComponent } from '../../hero/hero.component';
import { GalleryComponent } from '../../gallery/gallery.component';
import { TimelineComponent } from '../../timeline/timeline.component';
import { MapComponent } from '../../map/map.component';
import { RsvpFormComponent } from '../../rsvp-form/rsvp-form.component';
import { MusicPlayerComponent } from '../../music-player/music-player.component';
import { GiftsComponent } from '../../gifts/gifts.component';
import { ContactComponent } from '../../contact/contact.component';
import { CalendarComponent } from '../../calendar/calendar.component';
import { InvitationFooterComponent } from '../../../shared/components/invitation-footer/invitation-footer.component';

/**
 * Plantilla genérica de invitación de boda.
 *
 * Cualquier boda del sistema reutiliza este template y solo cambia
 * sus inputs. Las invitaciones individuales (`judith-jesus`,
 * `helena-juan`, etc.) son ahora meros wrappers que pasan los datos.
 *
 * Para crear una nueva invitación, ejecuta:
 *   `node scripts/create-invitation.mjs <slug> <partner1Name> <partner2Name>`
 */
@Component({
  selector: 'app-invitation-template',
  standalone: true,
  imports: [
    HeroComponent,
    GalleryComponent,
    TimelineComponent,
    MapComponent,
    RsvpFormComponent,
    MusicPlayerComponent,
    GiftsComponent,
    ContactComponent,
    CalendarComponent,
    InvitationFooterComponent,
  ],
  templateUrl: './invitation-template.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvitationTemplateComponent implements OnInit {
  /** Slug del usuario (identificador de la boda; coincide con la URL pública) */
  readonly slug = input.required<string>();

  /** Nombre de la primera persona de la pareja */
  readonly partner1Name = input.required<string>();

  /** Nombre de la segunda persona de la pareja */
  readonly partner2Name = input.required<string>();

  /** Canción de fondo (por defecto, "background-music.mp3" dentro de la carpeta del usuario) */
  readonly song = input<string>('background-music.mp3');

  /** URL de la imagen de portada del hero */
  readonly coverUrl = computed(
    () => `assets/${this.slug()}/covery/hero.jpeg`,
  );

  async ngOnInit() {
    AOS.init({
      duration: 1000,
      once: true,
      easing: 'ease-out-cubic',
    });
  }
}
