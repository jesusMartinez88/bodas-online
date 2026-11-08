import {
  ChangeDetectionStrategy,
  Component,
  AfterViewInit,
  DestroyRef,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CountdownComponent } from '../countdown/countdown.component';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-hero',
  imports: [CountdownComponent],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroComponent implements AfterViewInit, OnDestroy {
  readonly coverUrl = input<string | null>(null);
  readonly partner1Name = input<string>('Judith');
  readonly partner2Name = input<string>('Jesús');

  /**
   * Id de la sección a la que apunta el CTA dentro de esta misma vista
   * (por defecto, el formulario de confirmación de asistencia).
   */
  readonly ctaTargetId = input<string>('rsvp');
  readonly heroContent = viewChild.required<ElementRef>('heroContent');
  readonly heroTitle = viewChild.required<ElementRef>('heroTitle');
  readonly heroSubtitle = viewChild.required<ElementRef>('heroSubtitle');
  readonly heroLocation = viewChild.required<ElementRef>('heroLocation');
  readonly heroCta = viewChild.required<ElementRef>('heroCta');
  readonly countdownWrapper = viewChild.required<ElementRef>('countdownWrapper');
  readonly heroBackground = viewChild.required<ElementRef>('heroBackground');
  readonly heroOverlay = viewChild.required<ElementRef>('heroOverlay');
  readonly particlesCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('particlesCanvas');

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Ruta actual sin fragmento (`/judith-jesus`, `/helena-juan`, …).
   *
   * Hace falta porque `<base href="/">` hace que un `href="#rsvp"` a secas
   * se resuelva contra la raíz del sitio: el navegador interpretaría
   * `/judith-jesus` + `#rsvp` como `/#rsvp` y recargaría la landing en
   * lugar de desplazarse a la sección de esta misma vista.
   */
  private readonly currentPath = signal<string>(this.router.url.split('#')[0] || '/');

  /** href real del CTA: ruta actual + fragmento. */
  readonly ctaHref = computed(() => `${this.currentPath()}#${this.ctaTargetId()}`);

  private particles: {
    x: number;
    y: number;
    size: number;
    speedX: number;
    speedY: number;
    opacity: number;
  }[] = [];
  private animationFrameId?: number;

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.currentPath.set(event.urlAfterRedirects.split('#')[0] || '/'));
  }

  ngAfterViewInit() {
    this.initAnimations();
    this.initScrollEffects();
    this.initParticles();
  }

  /**
   * Desplaza la vista hasta la sección objetivo del CTA.
   *
   * Se gestiona a mano (en vez de dejar que el navegador resuelva el
   * fragmento) por dos motivos:
   *  - El `href` debe apuntar a esta misma vista, no a la raíz del sitio
   *    (ver `currentPath`).
   *  - El scroll lo hacemos nosotros para respetar
   *    `prefers-reduced-motion`.
   */
  onCtaClick(event: Event): void {
    event.preventDefault();

    const targetId = this.ctaTargetId();
    const target = document.getElementById(targetId);
    if (!target) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

    // Actualiza el fragmento sin recargar ni disparar la navegación del router.
    // Ojo: un `'#rsvp'` a secas se resolvería contra `<base href="/">` y
    // dejaría la URL en `/#rsvp` en vez de `/{ruta}#rsvp`.
    history.replaceState(null, '', `${this.currentPath()}#${targetId}`);
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  }

  private initAnimations() {
    const heroTitle = this.heroTitle();
    const heroSubtitle = this.heroSubtitle();
    const heroLocation = this.heroLocation();
    const heroCta = this.heroCta();
    const countdownWrapper = this.countdownWrapper();
    if (!heroTitle || !heroSubtitle || !heroLocation || !heroCta || !countdownWrapper) {
      console.warn('HeroComponent: Some elements not found for animations');
      return;
    }

    const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 1.2 } });

    // Configurar estado inicial de todos los elementos
    gsap.set(
      [
        heroTitle.nativeElement,
        heroSubtitle.nativeElement,
        heroLocation.nativeElement,
        countdownWrapper.nativeElement,
        heroCta.nativeElement,
      ],
      {
        opacity: 0,
        y: 50,
      },
    );

    // Animación de entrada secuencial
    tl.to(heroTitle.nativeElement, {
      opacity: 1,
      y: 0,
      delay: 0.5,
    })
      .to(
        heroSubtitle.nativeElement,
        {
          opacity: 1,
          y: 0,
        },
        '-=0.8',
      )
      .to(
        heroLocation.nativeElement,
        {
          opacity: 1,
          y: 0,
        },
        '-=0.8',
      )
      .to(
        countdownWrapper.nativeElement,
        {
          opacity: 1,
          y: 0,
        },
        '-=0.8',
      )
      .to(
        heroCta.nativeElement,
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: 'back.out(1.7)',
        },
        '-=0.6',
      );
  }

  private initScrollEffects() {
    const heroBackground = this.heroBackground();
    const heroContent = this.heroContent();
    const heroOverlay = this.heroOverlay();
    if (!heroBackground || !heroContent || !heroOverlay) {
      return;
    }

    // Parallax 3D en el fondo con zoom
    gsap.to(heroBackground.nativeElement, {
      scale: 1.3,
      y: '30%',
      ease: 'none',
      scrollTrigger: {
        trigger: heroBackground.nativeElement,
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
      },
    });

    // Efecto de zoom out en el contenido
    gsap.to(heroContent.nativeElement, {
      scale: 0.8,
      y: -100,
      ease: 'power2.in',
      scrollTrigger: {
        trigger: heroContent.nativeElement,
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
      },
    });

    // Morphing de colores en el overlay
    gsap.to(heroOverlay.nativeElement, {
      background:
        'linear-gradient(135deg, rgba(190, 24, 93, 0.7) 0%, rgba(219, 39, 119, 0.8) 100%)',
      ease: 'none',
      scrollTrigger: {
        trigger: heroOverlay.nativeElement,
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
      },
    });

    // NO hay animación de desaparición para el título - debe permanecer visible
  }

  private initParticles() {
    const canvas = this.particlesCanvas()?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Crear partículas
    for (let i = 0; i < 50; i++) {
      this.particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 3 + 1,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.5,
        opacity: Math.random() * 0.5 + 0.2,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      this.particles.forEach((particle) => {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
        ctx.fill();

        particle.x += particle.speedX;
        particle.y += particle.speedY;

        if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1;
      });

      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Redimensionar canvas
    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }
}
