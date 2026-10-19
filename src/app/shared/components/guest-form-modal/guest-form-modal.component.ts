import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
  input,
  output,
  linkedSignal,
} from '@angular/core';
import { form, FormField, required, email, minLength, submit } from '@angular/forms/signals';
import { Guest, GuestService } from '../../../services/guest.service';

@Component({
  selector: 'app-guest-form-modal',
  imports: [FormField],
  templateUrl: './guest-form-modal.component.html',
  styleUrl: './guest-form-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestFormModalComponent implements OnInit {
  private guestService = inject(GuestService);

  readonly guest = input<Guest | null>(null);
  /** Slug del tenant (boda) al que pertenece el invitado. Se envía a Google Sheets como copia de seguridad. */
  readonly tenantSlug = input<string>('');
  readonly modalClose = output<void>();

  isLoading = signal(false);
  isEditingGuest = signal(false);
  editingGuestId = signal<string | null>(null);

  protected readonly guestModel = linkedSignal<
    Guest | null,
    {
      name: string;
      email: string;
      phone: string;
      attendance: boolean;
      isAdult: string;
      mealType: string;
      allergies: string;
      notes: string;
      needsTransport: boolean;
    }
  >({
    source: () => this.guest(),
    computation: (guest) => ({
      name: guest?.name || '',
      email: guest?.email || '',
      phone: guest?.phone || '',
      attendance: guest ? guest.attendance !== false && guest.attending !== 0 : true,
      isAdult: String(guest?.isAdult ?? 1),
      mealType: guest?.mealType || 'normal',
      allergies: guest?.allergies || '',
      notes: guest?.notes || '',
      needsTransport: !!guest?.needsTransport,
    }),
  });

  protected readonly guestForm = form(this.guestModel, (s) => {
    required(s.name, { message: 'El nombre es obligatorio' });
    minLength(s.name, 3);
    email(s.email);
    required(s.isAdult);
    required(s.mealType);
  });

  ngOnInit() {
    const guest = this.guest();
    if (guest) {
      this.isEditingGuest.set(true);
      this.editingGuestId.set(guest.id || null);
    } else {
      this.isEditingGuest.set(false);
      this.editingGuestId.set(null);
    }
  }

  closeModal() {
    this.modalClose.emit();
  }

  async saveGuest() {
    submit(this.guestForm, async () => {
      try {
        this.isLoading.set(true);

        const formValue = this.guestModel();
        const isAdult = formValue.isAdult === '1';
        const guestData: Guest = {
          name: (formValue.name || '').trim(),
          email: (formValue.email || '').trim(),
          phone: (formValue.phone || '').trim(),
          attendance: formValue.attendance !== false,
          isAdult: isAdult ? 1 : 0,
          adults: isAdult ? 1 : 0,
          children: isAdult ? 0 : 1,
          attending: formValue.attendance === false ? 0 : 1,
          mealType: formValue.mealType || 'normal',
          allergies: formValue.allergies || '',
          notes: formValue.notes || '',
          needsTransport: !!formValue.needsTransport,
          isSavedInBbdd: false,
        };

        if (this.isEditingGuest() && this.editingGuestId()) {
          await this.guestService.updateGuest(this.editingGuestId()!, guestData);
        } else {
          guestData.sendEmail = false;
          await this.guestService.registerGuest(guestData, this.tenantSlug() || undefined);
        }

        this.closeModal();
      } catch (error) {
        console.error('Error saving guest:', error);
        alert('Hubo un problema al guardar los datos. Por favor, inténtalo de nuevo.');
      } finally {
        this.isLoading.set(false);
      }
    });
  }
}
