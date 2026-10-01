import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { gsap } from 'gsap';

interface Photo {
  id: number;
  title: string;
  placeholder: string;
  description: string;
  date?: string;
}

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.css',
})
export class GalleryComponent implements AfterViewInit, OnDestroy {
  readonly galleryUrls = input<string[]>([]);
  readonly partner1Name = input<string>('');
  readonly partner2Name = input<string>('');
  readonly user = input<string>('');
  readonly sliderTrack = viewChild.required<ElementRef>('sliderTrack');

  // Lista reactiva de fotos: se reconstruye cuando cambia el input `user`
  // (los signal inputs se asignan DESPUÉS de la inicialización de campos,
  // por eso no se pueden usar en inicializadores planos).
  readonly photos = computed<Photo[]>(() => {
    const u = this.user();
    return [
      {
        id: 1,
        title: 'El comienzo',
        placeholder: `assets/${u}/history/foto12.jpg`,
        description: 'Todo empezó por una casualidad',
        date: '2018',
      },
      {
        id: 2,
        title: 'Viajes inolvidables',
        placeholder: `assets/${u}/history/foto20.jpeg`,
        description: 'Nuestro primer viaje juntos fue el inicio de mil aventuras más.',
        date: '2018',
      },
      {
        id: 3,
        title: 'Cómplices',
        placeholder: `assets/${u}/history/foto2.jpeg`,
        description: 'Entre risas y momentos compartidos, supimos que era para siempre.',
        date: '2022',
      },
      {
        id: 4,
        title: 'Sumando aventuras',
        placeholder: `assets/${u}/history/foto19.jpeg`,
        description: 'Una escapada diferente.',
        date: '2023',
      },
      {
        id: 5,
        title: 'La gran pregunta',
        placeholder: `assets/${u}/history/foto17.jpeg`,
        description: 'Un día cualquiera que se convirtió en el más importante de nuestras vidas.',
        date: '2025',
      },
      {
        id: 6,
        title: 'Hacia el altar',
        placeholder: `assets/${u}/history/foto1.jpeg`,
        description: 'Contando los días para decir "Sí, quiero" rodeados de nuestra gente.',
        date: '2025',
      },
      {
        id: 7,
        title: 'Ya falta poco...',
        placeholder: `assets/${u}/history/foto18.jpeg`,
        description: 'Nuestra fecha mas esperada .',
        date: '2026',
      },
    ];
  });

  // Lista reactiva del slider infinito: depende del input `user`.
  readonly sliderImages = computed<string[]>(() => {
    const u = this.user();
    return [
      `assets/${u}/gallery/foto3.jpeg`,
      `assets/${u}/gallery/foto4.jpeg`,
      `assets/${u}/gallery/foto5.jpeg`,
      `assets/${u}/gallery/foto6.jpeg`,
      `assets/${u}/gallery/foto7.jpeg`,
      `assets/${u}/gallery/foto8.jpeg`,
      `assets/${u}/gallery/foto9.jpeg`,
      `assets/${u}/gallery/foto10.jpeg`,
      `assets/${u}/gallery/foto11.jpeg`,
      `assets/${u}/gallery/foto13.jpg`,
      `assets/${u}/gallery/foto14.jpg`,
      `assets/${u}/gallery/foto15.jpg`,
      `assets/${u}/gallery/foto16.jpg`,
    ];
  });

  selectedPhoto = signal<Photo | null>(null);
  private ctx?: gsap.Context;

  ngAfterViewInit() {
    this.initInfiniteSlider();
  }

  ngOnDestroy() {
    if (this.ctx) {
      this.ctx.revert();
    }
  }

  private initInfiniteSlider() {
    if (!this.sliderTrack()) return;

    this.ctx = gsap.context(() => {
      const track = this.sliderTrack().nativeElement;

      // Calculate total width of one set of items
      const totalWidth = track.scrollWidth / 2;

      gsap.to(track, {
        x: -totalWidth,
        duration: 30,
        ease: 'none',
        repeat: -1,
        onReverseComplete: () => {
          gsap.set(track, { x: 0 });
        },
      });

      // Pause/Resume on hover
      track.addEventListener('mouseenter', () => gsap.globalTimeline.pause());
      track.addEventListener('mouseleave', () => gsap.globalTimeline.resume());
    });
  }

  openModal(photo: Photo) {
    this.selectedPhoto.set(photo);
  }

  closeModal() {
    this.selectedPhoto.set(null);
  }
}
