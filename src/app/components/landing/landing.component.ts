import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LandingFooterComponent } from '../landing-footer/landing-footer.component';
import { LandingHeaderComponent } from '../landing-header/landing-header.component';
import { SectionNavigationService } from '../../services/section-navigation.service';

interface Testimonial {
  couple: string;
  location: string;
  date: string;
  quote: string;
  rating: number;
  avatar: string;
  tag: string;
}

interface FaqItem {
  question: string;
  answer: string;
  category: string;
}

interface FeaturePill {
  icon: string;
  title: string;
  description: string;
  badge?: string;
}

@Component({
  selector: 'app-landing',
  imports: [RouterLink, LandingHeaderComponent, LandingFooterComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {
  /** Acceso público al servicio para usarlo desde la plantilla. */
  readonly nav = inject(SectionNavigationService);

  readonly activePreviewTab = signal<'guest' | 'couple'>('guest');
  readonly openFaqIndex = signal<number | null>(0);

  readonly features: FeaturePill[] = [
    {
      icon: '💌',
      title: 'Invitación Web Personalizada',
      description:
        'Tu propia web con fotos, historia de amor, cuenta atrás interactiva y estilo visual cuidado al detalle.',
      badge: 'El favorito de los invitados',
    },
    {
      icon: '⚡',
      title: 'Confirmación RSVP en Tiempo Real',
      description:
        'Controlá quién asiste, alergias alimentarias, preferencias de menú y necesidad de autobús con un clic.',
      badge: 'Cero llamadas telefónicas',
    },
    {
      icon: '🪑',
      title: 'Organizador Visual de Mesas',
      description:
        'Asigná asientos arrastrando a cada invitado. Visualizá mesas redondas y rectangulares y exportá en PDF para el salón.',
      badge: 'Exclusivo',
    },
    {
      icon: '📍',
      title: 'Ubicaciones GPS y Cronograma',
      description:
        'Navegación directa con Google Maps y Waze a la ceremonia y finca, además del itinerario completo del día.',
    },
    {
      icon: '🎵',
      title: 'Playlist Colaborativa',
      description:
        'Tus invitados pueden sugerir las canciones que quieren bailar para que la fiesta sea inolvidable.',
    },
    {
      icon: '💰',
      title: 'Presupuesto y Control de Gastos',
      description:
        'Seguimiento detallado de pagos, presupuestos de proveedores y números de cuenta o Bizum para regalos.',
    },
  ];

  readonly comparisonPoints = [
    {
      feature: 'Confirmación de asistencia',
      traditional: 'Semanas llamando uno por uno',
      ourApp: 'Instantáneo con registro automático y estadísticas',
    },
    {
      feature: 'Control de alergias y menús',
      traditional: 'Papelitos perdidos y notas confusas',
      ourApp: 'Filtros automáticos para celíacos, veganos, etc.',
    },
    {
      feature: 'Cambios o imprevistos de última hora',
      traditional: 'Imposible de actualizar sin reimprimir',
      ourApp: 'Actualizá horarios o detalles en 1 segundo',
    },
    {
      feature: 'Ubicaciones y cómo llegar',
      traditional: 'Mapas impresos difíciles de seguir',
      ourApp: 'Apertura directa en Google Maps, Waze y Apple Maps',
    },
    {
      feature: 'Organización de mesas',
      traditional: 'Borradores eternos en hojas de cálculo',
      ourApp: 'Panel visual drag & drop con exportación a PDF',
    },
    {
      feature: 'Costo total',
      traditional: '300€ - 800€ en imprentas y envíos',
      ourApp: 'Solo 59€ pago único para invitados ilimitados',
    },
  ];

  readonly testimonials: Testimonial[] = [
    {
      couple: 'Judith & Jesús',
      location: 'Salon Azahar, Murcia',
      date: 'Boda en Julio 2026',
      quote:
        'Nuestros invitados quedaron fascinados. Muchos nos dijeron que fue la mejor invitación que habían visto en su vida. La gestión de mesas nos ahorró horas de discusiones.',
      rating: 5,
      avatar: 'assets/reviews/foto1.webp',
      tag: '160 invitados',
    },
    {
      couple: 'Marta & Alejandro',
      location: 'Cortijo de los Caballos, Sevilla',
      date: 'Boda en Septiembre 2025',
      quote:
        'El control de alergias y el autobús nos salvó la vida para coordinar con el catering. Vale cada euro invertido, súper intuitivo tanto para nosotros como para nuestros abuelos.',
      rating: 5,
      avatar: 'assets/reviews/foto2.webp',
      tag: '210 invitados',
    },
    {
      couple: 'Elena & David',
      location: 'Masía Ribas, Barcelona',
      date: 'Boda en Junio 2025',
      quote:
        'Lo configuramos en una tarde y lo mandamos por WhatsApp. En menos de 48 horas ya teníamos más del 70% de las confirmaciones registradas.',
      rating: 5,
      avatar: 'assets/reviews/foto3.webp',
      tag: '135 invitados',
    },
  ];

  readonly faqs: FaqItem[] = [
    {
      category: 'Envío y Acceso',
      question: '¿Cómo reciben mis invitados la invitación?',
      answer:
        'Les enviás un enlace personalizado por WhatsApp, email o redes sociales. No necesitan descargar ninguna aplicación ni registrarse: se abre al instante en cualquier navegador de móvil, tablet u ordenador.',
    },
    {
      category: 'Personalización',
      question: '¿Puedo personalizar los textos, fotos, horarios y colores?',
      answer:
        'Sí, 100%. Podés añadir vuestras fotos, la historia de cómo os conocisteis, los horarios del itinerario, mapas exactos con GPS, cuenta bancaria para regalos y solicitar las secciones que necesites.',
    },
    {
      category: 'Gestión',
      question: '¿Cómo funciona la confirmación de asistencia y el organizador de mesas?',
      answer:
        'Cada vez que un invitado confirma asistencia desde la web, sus datos (nombre, acompañantes, alergias, autobús y canciones sugeridas) entran automáticamente en tu panel privado. Desde allí podés arrastrar a cada persona a su mesa y exportar la lista completa en PDF para el salón o catering.',
    },
    {
      category: 'Pagos y Garantía',
      question: '¿Hay cuotas mensuales o pagos adicionales?',
      answer:
        'No. Es un pago único de 59€ con acceso ilimitado hasta 1 mes después de tu fecha de boda. No hay suscripciones recurrentes, no cobramos por número de invitados y disfrutás de todas las actualizaciones y soporte prioritario.',
    },
    {
      category: 'Soporte',
      question: '¿Qué pasa si cambian los horarios o algún detalle antes de la boda?',
      answer:
        'Puedés entrar a tu panel en cualquier momento, modificar cualquier dato y se actualiza al instante para todos tus invitados sin tener que volver a enviar nada.',
    },
  ];

  setPreviewTab(tab: 'guest' | 'couple'): void {
    this.activePreviewTab.set(tab);
  }

  toggleFaq(index: number): void {
    this.openFaqIndex.update((current) => (current === index ? null : index));
  }
}
