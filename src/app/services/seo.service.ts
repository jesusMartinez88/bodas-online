import { Injectable, inject, DOCUMENT } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

/**
 * Configuración que recibe {@link SeoService.update}. Todos los campos
 * son opcionales: si no se pasan, no se tocan (útil para re-aplicar
 * sólo una parte sin machacar lo demás).
 *
 * `og` y `twitter` se mapean 1:1 a sus meta-tags estándar:
 *   - `og.title`     → `<meta property="og:title">`
 *   - `og.description` → `<meta property="og:description">`
 *   - `og.image`     → `<meta property="og:image">`
 *   - `og.url`       → `<meta property="og:url">`
 *   - `og.type`      → `<meta property="og:type">`
 *   - `og.siteName`  → `<meta property="og:site_name">`
 *
 * Si no se pasan `og.*` pero sí `title`/`description`/`image`, el
 * servicio los reusa para llenar `og.title`/`og.description` y deja
 * el `og.image` configurado explícitamente.
 */
export interface SeoConfig {
  title?: string;
  description?: string;
  /** URL absoluta. Si se omite, se rellena con `location.origin + path`. */
  canonical?: string;
  /** Imagen para Open Graph / Twitter. URL absoluta recomendada. */
  image?: string;
  /** Keywords (opcional; Google ya las ignora, pero algunos crawlers sí). */
  keywords?: string;
  og?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: 'website' | 'article' | 'profile' | string;
    siteName?: string;
    locale?: string;
  };
  twitter?: {
    card?: 'summary' | 'summary_large_image' | 'app' | 'player';
    title?: string;
    description?: string;
    image?: string;
    site?: string;
    creator?: string;
  };
  /**
   * Objeto que se serializa a JSON y se inyecta dentro de un
   * `<script type="application/ld+json">`. Si se pasa `null` se
   * elimina el bloque anterior.
   */
  jsonLd?: Record<string, unknown> | null;
  /**
   * Si `true`, no aplica cambios sobre tags que ya existían con el
   * mismo `name`/`property`. Útil para no duplicar cuando el mismo
   * componente monta/desmonta varias veces.
   */
  keepExisting?: boolean;
}

const META = 'name';
const OG = 'property';

/**
 * Servicio centralizado para actualizar los meta-tags del documento.
 *
 * Por qué existe:
 *  - Antes cada página renderizaba el mismo `<title>` / `<meta>` del
 *    `index.html` estático. Con este servicio cada componente puede
 *    declarar su propio SEO en una sola línea (`seo.update({...})`).
 *  - Centraliza Open Graph, Twitter Cards, canonical y JSON-LD para
 *    no repetir la lógica de `Meta.addTags / updateTag` en cada sitio.
 *  - En SSR/prerender, `Meta` y `Title` escriben sobre el HTML que
 *    el servidor envía al cliente, así que Google ve los tags
 *    correctos sin necesidad de ejecutar JS.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private title = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);

  /** Tag identificador del `<script>` JSON-LD que gestionamos. */
  private static readonly JSON_LD_ID = 'app-jsonld';

  /**
   * Aplica la configuración de SEO al `<head>` actual. Idempotente:
   * llamarla varias veces con los mismos valores no duplica tags.
   */
  update(config: SeoConfig): void {
    const { title, description, canonical, image, keywords, og, twitter, jsonLd } =
      config;

    // ── Title ──
    if (title !== undefined) {
      this.title.setTitle(title);
    }

    // ── Description ──
    if (description !== undefined) {
      this.upsertMeta(META, 'description', description);
    }

    // ── Keywords ──
    if (keywords !== undefined) {
      this.upsertMeta(META, 'keywords', keywords);
    }

    // ── Canonical ──
    if (canonical !== undefined) {
      this.upsertLink('canonical', canonical);
    } else if (this.canDeriveCanonical()) {
      // Si no se pasa canonical pero estamos en el browser, lo
      // derivamos de la URL actual para cubrir el caso "el usuario
      // solo rellenó title/description y olvidó canonical".
      const derived = this.doc.location.origin + this.doc.location.pathname;
      this.upsertLink('canonical', derived);
    }

    // ── Open Graph ──
    // Reusamos title/description/image si no se pasaron og.* específicos.
    const ogResolved = {
      title: og?.title ?? title,
      description: og?.description ?? description,
      image: og?.image ?? image,
      url: og?.url ?? canonical ?? this.currentUrl(),
      type: og?.type ?? 'website',
      siteName: og?.siteName ?? 'Bodas Online',
      locale: og?.locale ?? 'es_ES',
    };

    if (ogResolved.title !== undefined) {
      this.upsertMeta(OG, 'og:title', ogResolved.title);
    }
    if (ogResolved.description !== undefined) {
      this.upsertMeta(OG, 'og:description', ogResolved.description);
    }
    if (ogResolved.image !== undefined) {
      this.upsertMeta(OG, 'og:image', ogResolved.image);
    }
    if (ogResolved.url !== undefined) {
      this.upsertMeta(OG, 'og:url', ogResolved.url);
    }
    this.upsertMeta(OG, 'og:type', ogResolved.type);
    this.upsertMeta(OG, 'og:site_name', ogResolved.siteName);
    this.upsertMeta(OG, 'og:locale', ogResolved.locale);

    // ── Twitter Cards ──
    const twCard = twitter?.card ?? 'summary_large_image';
    this.upsertMeta(META, 'twitter:card', twCard);

    const twResolved = {
      title: twitter?.title ?? ogResolved.title ?? title,
      description: twitter?.description ?? ogResolved.description ?? description,
      image: twitter?.image ?? ogResolved.image ?? image,
      site: twitter?.site,
      creator: twitter?.creator,
    };
    if (twResolved.title !== undefined) {
      this.upsertMeta(META, 'twitter:title', twResolved.title);
    }
    if (twResolved.description !== undefined) {
      this.upsertMeta(META, 'twitter:description', twResolved.description);
    }
    if (twResolved.image !== undefined) {
      this.upsertMeta(META, 'twitter:image', twResolved.image);
    }
    if (twResolved.site) {
      this.upsertMeta(META, 'twitter:site', twResolved.site);
    }
    if (twResolved.creator) {
      this.upsertMeta(META, 'twitter:creator', twResolved.creator);
    }

    // ── JSON-LD ──
    if (jsonLd === null) {
      this.removeJsonLd();
    } else if (jsonLd !== undefined) {
      this.upsertJsonLd(jsonLd);
    }
  }

  /**
   * Elimina todos los meta-tags que este servicio gestiona (description,
   * keywords, og:*, twitter:* y el JSON-LD). Útil si una página quiere
   * "resetear" al estado del `index.html` (raro, pero a veces útil en
   * tests).
   */
  reset(): void {
    this.meta.removeTag('name="description"');
    this.meta.removeTag('name="keywords"');
    for (const p of [
      'og:title',
      'og:description',
      'og:image',
      'og:url',
      'og:type',
      'og:site_name',
      'og:locale',
    ]) {
      this.meta.removeTag(`property="${p}"`);
    }
    for (const n of [
      'twitter:card',
      'twitter:title',
      'twitter:description',
      'twitter:image',
      'twitter:site',
      'twitter:creator',
    ]) {
      this.meta.removeTag(`name="${n}"`);
    }
    this.removeJsonLd();
  }

  // ── Helpers internos ──

  private upsertMeta(attr: 'name' | 'property', key: string, value: string): void {
    // `updateTag` con `attr=value` reemplaza el tag si ya existe;
    // si no existe lo crea. Mucho más limpio que addTags + removeTag.
    this.meta.updateTag({ [attr]: key, content: value });
  }

  private upsertLink(rel: string, href: string): void {
    const head = this.doc.head;
    let link = head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', rel);
      head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private upsertJsonLd(data: Record<string, unknown>): void {
    const head = this.doc.head;
    let script = this.doc.getElementById(
      SeoService.JSON_LD_ID,
    ) as HTMLScriptElement | null;
    if (!script) {
      script = this.doc.createElement('script');
      script.id = SeoService.JSON_LD_ID;
      script.type = 'application/ld+json';
      head.appendChild(script);
    }
    // Si el JSON es idéntico al que ya estaba, evitamos re-serializar
    // (cosmético, pero ayuda al no parpadear JSON en devtools).
    const next = JSON.stringify(data);
    if (script.textContent !== next) {
      script.textContent = next;
    }
  }

  private removeJsonLd(): void {
    const existing = this.doc.getElementById(SeoService.JSON_LD_ID);
    if (existing?.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  private currentUrl(): string | undefined {
    if (!this.canDeriveCanonical()) return undefined;
    return this.doc.location.origin + this.doc.location.pathname;
  }

  private canDeriveCanonical(): boolean {
    // En SSR el `location` no existe; solo derivamos URL en browser.
    return typeof this.doc !== 'undefined' && !!this.doc.location?.origin;
  }
}