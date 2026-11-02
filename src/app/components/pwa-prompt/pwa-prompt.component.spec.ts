import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { PwaPromptComponent } from './pwa-prompt.component';

/**
 * En qué rutas se ofrece la instalación.
 *
 * El componente usaba `url.startsWith('/dashboard')`, pero el panel cuelga
 * de `/:tenant/dashboard` y el admin de `/admin/users`: ese `startsWith`
 * nunca era cierto, así que el aviso **no se pintaba nunca**, ni
 * siquiera con el evento de instalación capturado y el usuario dentro.
 */
describe('PwaPromptComponent (dónde se ofrece la instalación)', () => {
  let component: PwaPromptComponent;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PwaPromptComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: ':tenant/dashboard', children: [] },
          { path: 'admin/users', children: [] },
          { path: '**', children: [] },
        ]),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PwaPromptComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  });

  it('se ofrece en el panel de la pareja', async () => {
    await router.navigateByUrl('/jesus/dashboard');

    expect(component.isInAppArea()).toBe(true);
  });

  it('se ofrece en el panel de administración', async () => {
    await router.navigateByUrl('/admin/users');

    expect(component.isInAppArea()).toBe(true);
  });

  it('no se ofrece en la landing', async () => {
    await router.navigateByUrl('/');

    expect(component.isInAppArea()).toBe(false);
  });

  it('no se ofrece en la invitación pública', async () => {
    await router.navigateByUrl('/judith-jesus');

    expect(component.isInAppArea()).toBe(false);
  });

  it('no se ofrece en la página de contacto', async () => {
    await router.navigateByUrl('/contacto');

    expect(component.isInAppArea()).toBe(false);
  });
});
