import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
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
  selector: 'app-helena-juan-invitation',
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
  templateUrl: './helena-juan.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelenaJuanComponent implements OnInit {
  readonly coverUrl = signal<string | null>(null);

  async ngOnInit() {
    AOS.init({
      duration: 1000,
      once: true,
      easing: 'ease-out-cubic',
    });
  }
}
