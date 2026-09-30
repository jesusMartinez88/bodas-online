import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  PLATFORM_ID,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AdminUser, LandingQuestionnaire } from '../../../../../types/api';

@Component({
  selector: 'app-admin-questionnaire-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-questionnaire-modal.component.html',
  styleUrl: './admin-questionnaire-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuestionnaireModalComponent {
  private platformId = inject(PLATFORM_ID);

  user = input.required<AdminUser>();
  questionnaire = input<LandingQuestionnaire | null>(null);
  isLoading = input<boolean>(false);
  error = input<string | null>(null);

  closed = output<void>();

  copiedBank = signal<boolean>(false);

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!isPlatformBrowser(this.platformId)) return;
    if (event.key === 'Escape') {
      this.onClose();
    }
  }

  onClose() {
    if (this.isLoading()) return;
    this.closed.emit();
  }

  copyBankAccount(account: string) {
    if (!isPlatformBrowser(this.platformId) || !account) return;
    navigator.clipboard.writeText(account).then(() => {
      this.copiedBank.set(true);
      setTimeout(() => this.copiedBank.set(false), 2000);
    });
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  }

  formatShortDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  }

  formatYesNo(value: 0 | 1 | boolean | null | undefined): string {
    if (value === 1 || value === true) return 'Sí';
    if (value === 0 || value === false) return 'No';
    return '—';
  }

  parseOurStoryEntries(
    value: string | null | undefined,
  ): { url: string; caption: string }[] | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return null;
      const cleaned = parsed
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const url = typeof entry.url === 'string' ? entry.url.trim() : '';
          const caption =
            typeof entry.caption === 'string' ? entry.caption.trim() : '';
          if (!url) return null;
          return { url, caption };
        })
        .filter((e): e is { url: string; caption: string } => e !== null);
      return cleaned.length > 0 ? cleaned : null;
    } catch {
      return null;
    }
  }

  parseLegacyOurStoryCaptions(
    value: string | null | undefined,
  ): string[] | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return null;
      const cleaned = parsed
        .map((c) => (typeof c === 'string' ? c.trim() : ''))
        .filter((c) => c.length > 0);
      return cleaned.length > 0 ? cleaned : null;
    } catch {
      return null;
    }
  }
}
