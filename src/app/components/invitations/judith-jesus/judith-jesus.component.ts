import { ChangeDetectionStrategy, Component, computed, OnInit, signal } from '@angular/core';
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

@Component({
  selector: 'app-judith-jesus-invitation',
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
  templateUrl: './judith-jesus.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudithJesusComponent implements OnInit {
  // Slug del usuario (identificador de la boda en el sistema y en la URL)
  readonly userSlug = signal<string>('judith-jesus');

  // Nombres de la pareja (dinámicos: cualquier boda los puede reutilizar)
  readonly partner1Name = signal<string>('Judith');
  readonly partner2Name = signal<string>('Jesús');

   coverUrl = computed(() => {
    return `assets/${this.userSlug()}/covery/hero.jpeg`;
  });

  async ngOnInit() {
    AOS.init({
      duration: 1000,
      once: true,
      easing: 'ease-out-cubic',
    });
  }
}
