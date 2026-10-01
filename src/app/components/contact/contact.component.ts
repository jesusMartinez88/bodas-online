import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.css',
})
export class ContactComponent {
  readonly partner1Name = input<string>('Judith');
  readonly partner2Name = input<string>('Jesús');

  contacts = computed(() => [
    {
      name: this.partner1Name(),
      role: 'La Novia',
      phone: '+34 650 028 304',
      whatsapp: 'https://wa.me/34650028304',
    },
    {
      name: this.partner2Name(),
      role: 'El Novio',
      phone: '+34 695 677 269',
      whatsapp: 'https://wa.me/34695677269',
    },
  ]);
}
