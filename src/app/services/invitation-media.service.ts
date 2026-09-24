import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface InvitationMedia {
  coverUrl: string | null;
  galleryUrls: string[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class InvitationMediaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/api/invitation-media`;

  listMine() {
    return this.http
      .get<ApiResponse<InvitationMedia>>(this.baseUrl)
      .pipe(map((response) => this.withAbsoluteUrls(response.data)));
  }

  listPublic(slug: string) {
    return this.http
      .get<ApiResponse<InvitationMedia>>(`${this.baseUrl}/public/${encodeURIComponent(slug)}`)
      .pipe(map((response) => this.withAbsoluteUrls(response.data)));
  }

  uploadCover(image: Blob) {
    const body = new FormData();
    body.append('image', image, 'cover.webp');
    return this.http
      .post<ApiResponse<{ url: string }>>(`${this.baseUrl}/cover`, body)
      .pipe(map((response) => this.absoluteUrl(response.data.url)));
  }

  uploadGallery(images: Blob[]) {
    const body = new FormData();
    images.forEach((image, index) => body.append('images', image, `gallery-${index + 1}.webp`));
    return this.http
      .post<ApiResponse<{ urls: string[] }>>(`${this.baseUrl}/gallery`, body)
      .pipe(map((response) => response.data.urls.map((url) => this.absoluteUrl(url))));
  }

  uploadHistory(images: Blob[]) {
    const body = new FormData();
    images.forEach((image, index) => body.append('images', image, `history-${index + 1}.webp`));
    return this.http
      .post<ApiResponse<{ urls: string[] }>>(`${this.baseUrl}/history`, body)
      .pipe(map((response) => response.data.urls.map((url) => this.absoluteUrl(url))));
  }

  remove(url: string) {
    const name = new URL(url).pathname.split('/').pop();
    if (!name) throw new Error('Invalid media URL');
    return this.http.delete(`${this.baseUrl}/${encodeURIComponent(name)}`);
  }

  private withAbsoluteUrls(media: InvitationMedia): InvitationMedia {
    return {
      coverUrl: media.coverUrl ? this.absoluteUrl(media.coverUrl) : null,
      galleryUrls: media.galleryUrls.map((url) => this.absoluteUrl(url)),
    };
  }

  private absoluteUrl(path: string) {
    return new URL(path, environment.apiBaseUrl).toString();
  }
}
