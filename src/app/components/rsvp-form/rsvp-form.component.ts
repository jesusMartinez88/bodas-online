import { Component, signal, inject, input } from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GuestService, Guest } from '../../services/guest.service';
import { ChromeAiService } from '../../services/chrome-ai.service';
import { AiGenerateService, AiGenerateRequest } from '../../services/ai-generate.service';
import { ApiResponse } from '../../../types/api';
import confetti from 'canvas-confetti';

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const apiError = error.error as ApiResponse<unknown> | undefined;
    return (
      apiError?.message || apiError?.error || 'Error al registrar asistencia. Intenta de nuevo.'
    );
  }

  return 'Error al registrar asistencia. Intenta de nuevo.';
}

/** Version: 1.5.2 - FULL RECOVERY - Forced Local AI Flow */
@Component({
  selector: 'app-rsvp-form',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './rsvp-form.component.html',
  styleUrl: './rsvp-form.component.css',
})
export class RsvpFormComponent {
  readonly user = input<string>('');

  form: FormGroup;
  isSubmitting = signal(false);
  submitSuccess = signal(false);
  submitError = signal(false);
  errorMessage = signal('');

  private chromeAi = inject(ChromeAiService);
  private aiGenerate = inject(AiGenerateService);
  private formBuilder = inject(FormBuilder);
  private guestService = inject(GuestService);

  aiAvailable = this.chromeAi.isAvailable;
  aiLoading = this.chromeAi.isLoading;
  showDownloadModal = signal(false);
  showErrorModal = signal(false);
  aiErrorMessage = signal('');
  isDownloading = signal(false);
  downloadProgress = this.chromeAi.downloadProgress;
  streamingText = signal('');

  constructor() {
    this.form = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: [''],
      phone: ['', [Validators.pattern(/^[0-9]{9}$/)]],
      attendance: [true],
      adults: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
      children: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      mealType: ['normal', Validators.required],
      needsTransport: [false, Validators.required],
      isSavedInBbdd: [false, Validators.required],
      allergies: [''],
      notes: [''],
    });

    this.form.get('attendance')?.valueChanges.subscribe((att) => {
      this.form.patchValue({ notes: '' }, { emitEvent: false });
      if (att) {
        this.applyAttendanceValidators();
      } else {
        this.clearAttendanceValidators();
      }
    });

    if (this.form.get('attendance')?.value) {
      this.applyAttendanceValidators();
    } else {
      this.clearAttendanceValidators();
    }
  }

  async onSubmit() {
    if (this.form.invalid) {
      Object.keys(this.form.controls).forEach((key) => {
        this.form.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(false);
    this.submitSuccess.set(false);

    try {
      const guestData: Guest = { ...this.form.value };
      if (!guestData.attendance) {
        guestData.attending = 0;
      } else {
        guestData.attending = Number(guestData.adults || 0) + Number(guestData.children || 0);
      }
      
      await this.guestService.registerGuest(guestData, this.user());

      this.submitSuccess.set(true);

      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#be185d', '#ec4899', '#f472b6', '#ffffff'],
      });

      this.form.reset({
        adults: 1,
        children: 0,
        mealType: 'normal',
        needsTransport: false,
        isSavedInBbdd: false,
        attendance: guestData.attendance,
      });

      const startTime = performance.now();
      const checkDelay = (now: number) => {
        if (now - startTime >= 3000) {
          this.submitSuccess.set(false);
          const contactSection = document.getElementById('contact');
          if (contactSection) {
            contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } else {
          requestAnimationFrame(checkDelay);
        }
      };
      requestAnimationFrame(checkDelay);
    } catch (error: unknown) {
      this.submitError.set(true);
      this.errorMessage.set(getSubmitErrorMessage(error));
      setTimeout(() => this.submitError.set(false), 5000);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  private applyAttendanceValidators() {
    this.form
      .get('adults')
      ?.setValidators([Validators.required, Validators.min(1), Validators.max(10)]);
    this.form
      .get('children')
      ?.setValidators([Validators.required, Validators.min(0), Validators.max(10)]);
    this.form.get('mealType')?.setValidators(Validators.required);
    this.form.get('needsTransport')?.setValidators(Validators.required);
    this.form.get('isSavedInBbdd')?.setValidators(Validators.required);

    ['adults', 'children', 'mealType', 'needsTransport', 'isSavedInBbdd'].forEach((key) => {
      this.form.get(key)?.updateValueAndValidity();
    });
  }

  private clearAttendanceValidators() {
    ['adults', 'children', 'mealType', 'needsTransport', 'isSavedInBbdd'].forEach((key) => {
      this.form.get(key)?.clearValidators();
      this.form.get(key)?.updateValueAndValidity();
    });
  }

  async generateAiSuggestion() {
    await this.chromeAi.recheckAvailability();

    // 1. Si está listo localmente, es la prioridad absoluta
    if (this.chromeAi.isAvailable()) {
      await this.runLocalGeneration();
      return;
    }

    // 2. Si no está listo localmente, intentamos el BACKEND primero
    this.chromeAi.isLoading.set(true);
    try {
      await this.performAiGenerationViaBackend();
    } catch {
      // 3. Si el BACKEND falla, vemos si podemos ofrecer la descarga local
      if (this.chromeAi.needsDownload()) {
        this.showDownloadModal.set(true);
      } else {
        this.aiErrorMessage.set('La IA no está disponible en este momento.');
        this.showErrorModal.set(true);
      }
    } finally {
      this.chromeAi.isLoading.set(false);
    }
  }

  async generateAiExcuse() {
    await this.chromeAi.recheckAvailability();

    // 1. Local listo
    if (this.chromeAi.isAvailable()) {
      await this.runLocalExcuseGeneration();
      return;
    }

    // 2. Intentamos BACKEND
    this.chromeAi.isLoading.set(true);
    try {
      await this.performAiExcuseGenerationViaBackend();
    } catch {
      // 3. Si falla BACKEND, ofrecemos descarga local
      if (this.chromeAi.needsDownload()) {
        this.showDownloadModal.set(true);
      } else {
        this.aiErrorMessage.set('La IA no está disponible en este momento.');
        this.showErrorModal.set(true);
      }
    } finally {
      this.chromeAi.isLoading.set(false);
    }
  }

  async executeLocalDownloadProcess() {
    this.isDownloading.set(true);

    try {
      // 1. Descargamos el modelo
      await this.chromeAi.downloadModel();

      // 2. Generamos localmente
      const guestName = this.form.get('name')?.value || 'Invitado';
      if (this.form.get('attendance')?.value) {
        await this.performLocalStream(this.chromeAi.generateAttendanceNoteStream(guestName));
      } else {
        await this.performLocalStream(this.chromeAi.generateExcuseStream());
      }

      this.showDownloadModal.set(false);
      this.chromeAi.needsDownload.set(false);
    } catch (error) {
      console.error('Error en proceso local:', error);
      this.aiErrorMessage.set('Error al activar la IA local.');
      this.showErrorModal.set(true);
    } finally {
      this.isDownloading.set(false);
    }
  }

  cancelDownload() {
    console.log('Descarga cancelada por el usuario');
    this.showDownloadModal.set(false);
  }

  private async runLocalGeneration() {
    const guestName = this.form.get('name')?.value || 'Invitado';
    await this.performLocalStream(this.chromeAi.generateAttendanceNoteStream(guestName));
  }

  private async runLocalExcuseGeneration() {
    //const guestName = this.form.get('name')?.value || 'Invitado';
    await this.performLocalStream(this.chromeAi.generateExcuseStream());
  }

  private async performLocalStream(stream$: Observable<string>) {
    this.streamingText.set('');
    this.form.patchValue({ notes: '' });
    this.chromeAi.isLoading.set(true);

    return new Promise<void>((resolve, reject) => {
      stream$.subscribe({
        next: (chunk: string) => {
          this.streamingText.update((prev) => prev + chunk);

          const display = this.streamingText().replace('MENSAJE:', '').replace('CANCION:', '\n🎵 ');

          this.form.patchValue({ notes: display.trim() });
        },
        error: (err: unknown) => {
          this.chromeAi.isLoading.set(false);
          reject(err);
        },
        complete: () => {
          this.chromeAi.isLoading.set(false);
          resolve();
        },
      });
    });
  }

  private async performAiGenerationViaBackend() {
    const guestName = this.form.get('name')?.value || 'Invitado';
    await this.performAiStream({ type: 'attendance_full', guestName });
  }

  private async performAiExcuseGenerationViaBackend() {
    const guestName = this.form.get('name')?.value || 'Invitado';
    await this.performAiStream({ type: 'absence_reason', guestName });
  }

  private async performAiStream(payload: AiGenerateRequest) {
    this.streamingText.set('');
    this.form.patchValue({ notes: '' });

    return new Promise<void>((resolve, reject) => {
      this.aiGenerate.generateStream(payload).subscribe({
        next: (chunk: string) => {
          this.streamingText.update((prev) => prev + chunk);

          const display = this.streamingText().replace('MENSAJE:', '').replace('CANCION:', '\n🎵 ');

          this.form.patchValue({ notes: display.trim() });
        },
        error: (err: unknown) => {
          console.error('Streaming error:', err);
          reject(err);
        },
        complete: () => {
          resolve();
        },
      });
    });
  }

  closeErrorModal() {
    this.showErrorModal.set(false);
  }
}
