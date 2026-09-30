import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  PLATFORM_ID,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-account-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-account-modal.component.html',
  styleUrl: './admin-account-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAccountModalComponent {
  private platformId = inject(PLATFORM_ID);

  isOpen = input<boolean>(false);
  currentEmail = input<string | null>(null);
  isSaving = input<boolean>(false);
  accountError = input<string | null>(null);
  emailSuccess = input<string | null>(null);
  passwordSuccess = input<string | null>(null);

  changeEmail = output<{ email: string; currentPassword: string }>();
  changePassword = output<{ currentPassword: string; newPassword: string }>();
  closed = output<void>();

  // Form states
  newEmail = signal<string>('');
  emailPassword = signal<string>('');
  showEmailPassword = signal<boolean>(false);

  currentPassword = signal<string>('');
  newPassword = signal<string>('');
  confirmPassword = signal<string>('');
  showPasswords = signal<boolean>(false);

  localValidationError = signal<string | null>(null);

  constructor() {
    effect(() => {
      // Clear forms when modal opens
      if (this.isOpen()) {
        this.resetForms();
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!isPlatformBrowser(this.platformId)) return;
    if (event.key === 'Escape' && this.isOpen()) {
      this.onClose();
    }
  }

  onClose() {
    if (this.isSaving()) return;
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent) {
    // Solo cierra si el click fue directamente sobre el backdrop,
    // no cuando se propaga desde la modal-card.
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  resetForms() {
    this.newEmail.set('');
    this.emailPassword.set('');
    this.showEmailPassword.set(false);
    this.currentPassword.set('');
    this.newPassword.set('');
    this.confirmPassword.set('');
    this.showPasswords.set(false);
    this.localValidationError.set(null);
  }

  toggleEmailPasswordVisibility() {
    this.showEmailPassword.update((v) => !v);
  }

  togglePasswordsVisibility() {
    this.showPasswords.update((v) => !v);
  }

  onSubmitEmail() {
    this.localValidationError.set(null);
    const email = this.newEmail().trim();
    const pwd = this.emailPassword();

    if (!email) {
      this.localValidationError.set('Introduce un email o déjalo vacío para eliminarlo.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.localValidationError.set('El formato del email no es válido.');
      return;
    }

    if (email === (this.currentEmail() ?? '')) {
      this.localValidationError.set('El nuevo email es igual al actual.');
      return;
    }

    if (!pwd) {
      this.localValidationError.set('Introduce tu contraseña actual para confirmar el cambio.');
      return;
    }

    this.changeEmail.emit({ email, currentPassword: pwd });
  }

  onSubmitPassword() {
    this.localValidationError.set(null);
    const current = this.currentPassword();
    const next = this.newPassword();
    const confirm = this.confirmPassword();

    if (!current || !next || !confirm) {
      this.localValidationError.set('Rellena todos los campos de contraseña.');
      return;
    }

    if (next.length < 8) {
      this.localValidationError.set('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (next !== confirm) {
      this.localValidationError.set('Las contraseñas no coinciden.');
      return;
    }

    if (current === next) {
      this.localValidationError.set('La nueva contraseña es igual a la actual.');
      return;
    }

    this.changePassword.emit({ currentPassword: current, newPassword: next });
  }
}
