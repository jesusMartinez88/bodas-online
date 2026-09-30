import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  PLATFORM_ID,
  inject,
  input,
  output,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AdminUser } from '../../../../../types/api';

@Component({
  selector: 'app-admin-delete-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-delete-modal.component.html',
  styleUrl: './admin-delete-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDeleteModalComponent {
  private platformId = inject(PLATFORM_ID);

  user = input.required<AdminUser>();
  isDeleting = input<boolean>(false);
  actionError = input<string | null>(null);

  confirm = output<void>();
  close = output<void>();

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!isPlatformBrowser(this.platformId)) return;
    if (event.key === 'Escape' && !this.isDeleting()) {
      this.close.emit();
    }
  }

  onClose() {
    if (this.isDeleting()) return;
    this.close.emit();
  }

  onConfirm() {
    if (this.isDeleting()) return;
    this.confirm.emit();
  }
}
