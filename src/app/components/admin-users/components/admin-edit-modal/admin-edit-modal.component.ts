import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  PLATFORM_ID,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminUser } from '../../../../../types/api';

export interface EditFormState {
  email: string;
  paid: boolean;
  invitationCompleted: boolean;
  notes: string;
}

@Component({
  selector: 'app-admin-edit-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-edit-modal.component.html',
  styleUrl: './admin-edit-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEditModalComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);

  user = input.required<AdminUser>();
  isSaving = input<boolean>(false);
  actionError = input<string | null>(null);
  musicUploading = input<boolean>(false);
  musicError = input<string | null>(null);
  musicSuccess = input<string | null>(null);

  save = output<EditFormState>();
  uploadMusic = output<{ userId: number; event: Event }>();
  closed = output<void>();

  private firstFieldRef = viewChild<ElementRef<HTMLElement>>('firstField');
  private dialogRef = viewChild<ElementRef<HTMLElement>>('editDialog');

  form = signal<EditFormState>({
    email: '',
    paid: false,
    invitationCompleted: false,
    notes: '',
  });

  constructor() {
    effect(() => {
      const u = this.user();
      this.form.set({
        email: u.email ?? '',
        paid: u.paid,
        invitationCompleted: !!u.invitationCompletedAt,
        notes: u.notes ?? '',
      });
    });

    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        queueMicrotask(() => {
          this.firstFieldRef()?.nativeElement?.focus();
        });
      }
    });
  }

  ngOnInit() {
    const u = this.user();
    this.form.set({
      email: u.email ?? '',
      paid: u.paid,
      invitationCompleted: !!u.invitationCompletedAt,
      notes: u.notes ?? '',
    });
  }

  updateField<K extends keyof EditFormState>(key: K, value: EditFormState[K]) {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  onSave() {
    this.save.emit(this.form());
  }

  onFileChange(event: Event) {
    this.uploadMusic.emit({ userId: this.user().id, event });
  }

  onClose() {
    if (this.isSaving() || this.musicUploading()) return;
    this.closed.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!isPlatformBrowser(this.platformId)) return;
    if (event.key === 'Escape') {
      this.onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = this.dialogRef()?.nativeElement;
    if (!dialog) return;

    const focusables = dialog.querySelectorAll<HTMLElement>(
      'input, select, button, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  getUserInitials(username: string): string {
    if (!username) return 'U';
    const parts = username.split(/[\s_-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  }
}
