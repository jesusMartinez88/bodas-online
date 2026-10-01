import { Component, input } from '@angular/core';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css',
})
export class CalendarComponent {
  readonly partner1Name = input<string>('Judith');
  readonly partner2Name = input<string>('Jesús');

  addToGoogleCalendar() {
    const title = encodeURIComponent(`Boda de ${this.partner1Name()} & ${this.partner2Name()} 💍`);
    const details = encodeURIComponent('¡Nos encantaría que nos acompañaras en nuestro gran día!');
    const location = encodeURIComponent('Pericon Azahar, Granada, España');
    const dates = '20260711T160000Z/20260712T020000Z';

    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
    window.open(url, '_blank');
  }

  downloadIcs() {
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//${this.partner1Name()} y ${this.partner2Name()}//Boda//ES
BEGIN:VEVENT
DTSTART:20260711T180000
DTEND:20260712T040000
SUMMARY:Boda de ${this.partner1Name()} & ${this.partner2Name()} 💍
DESCRIPTION:¡Nos encantaría que nos acompañaras en nuestro gran día!
LOCATION:Pericon Azahar, Granada, España
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `boda-${this.partner1Name().toLowerCase()}-${this.partner2Name().toLowerCase()}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
