import { Component, input } from '@angular/core';

@Component({
  selector: 'app-gifts',
  imports: [],
  templateUrl: './gifts.component.html',
  styleUrl: './gifts.component.css',
})
export class GiftsComponent {
  readonly partner1Name = input<string>('Judith');
  readonly partner2Name = input<string>('Jesús');
}
