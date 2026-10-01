import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
  AfterViewInit,
  ElementRef,
  viewChild,
  input,
} from '@angular/core';

import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MusicPlaylistService, MusicSong } from '../../../services/music-playlist.service';
import { YouTubeService, YouTubeVideoResult } from '../../../services/youtube.service';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { fromEvent, Subject, timer, of } from 'rxjs';
import {
  takeUntil,
  filter,
  switchMap,
  debounceTime,
  distinctUntilChanged,
  catchError,
} from 'rxjs/operators';

interface YouTubePlayer {
  loadVideoById(videoId: string): void;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

interface YouTubeApi {
  Player: new (
    id: string,
    options: {
      events: {
        onStateChange: (event: { data: number }) => void;
        onError: () => void;
      };
    },
  ) => YouTubePlayer;
}

declare const YT: YouTubeApi | undefined;

@Component({
  selector: 'app-music',
  standalone: true,
  imports: [ReactiveFormsModule, DragDropModule],
  templateUrl: './music.component.html',
  styleUrl: './music.component.css',
})
export class MusicComponent implements OnInit, OnDestroy, AfterViewInit {
  private musicService = inject(MusicPlaylistService);
  private fb = inject(FormBuilder);
  private sanitizer = inject(DomSanitizer);
  private youtubeService = inject(YouTubeService);
  private destroy$ = new Subject<void>();

  readonly keepAliveAudio = viewChild.required<ElementRef<HTMLAudioElement>>('keepAliveAudio');

  // Slug del usuario actual (su tenant). Se usa para personalizar la
  // metadata de MediaSession (album) y otros lugares donde se identifica al usuario.
  readonly slug = input<string>('judith-jesus');

  // Signals para el estado de la UI
  songs = this.musicService.songs;
  isLoading = this.musicService.isLoading;
  showModal = signal(false);
  isEditing = signal(false);
  isSubmitting = signal(false);
  currentPlayingId = signal<number | null | undefined>(null);
  songToDelete = signal<MusicSong | null>(null);

  // Estado del reproductor
  isVideoExpanded = signal(false);
  private player: YouTubePlayer | null = null;
  private apiReady = false;

  // Búsqueda
  searchQuery = signal('');

  // YouTube Search
  youtubeSearchQuery = signal('');
  youtubeSearchResults = signal<YouTubeVideoResult[]>([]);
  isSearching = signal(false);
  searchError = signal<string | null>(null);
  showSearchDropdown = signal(false);
  useManualUrl = signal(false);
  private searchSubject = new Subject<string>();

  // Canción actual computada
  currentSong = computed(() => {
    const id = this.currentPlayingId();
    if (!id) return null;
    return this.songs().find((s) => s.id === id) || null;
  });

  // Filtrado de canciones basado en la búsqueda
  filteredSongs = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.songs();

    return this.songs().filter(
      (song) =>
        song.title.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        (song.note && song.note.toLowerCase().includes(query)),
    );
  });

  // URL segura computada
  safeYoutubeUrl = computed<SafeResourceUrl | null>(() => {
    const id = this.currentPlayingId();
    if (!id) return null;

    const song = this.songs().find((s) => s.id === id);
    if (!song || !song.youtubeId) return null;

    const url = `https://www.youtube.com/embed/${song.youtubeId}?enablejsapi=1&autoplay=1&origin=${window.location.origin}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  hasPrevious = computed(() => {
    const id = this.currentPlayingId();
    if (!id) return false;
    const index = this.filteredSongs().findIndex((s) => s.id === id);
    return index > 0;
  });

  hasNext = computed(() => {
    const id = this.currentPlayingId();
    if (!id) return false;
    const index = this.filteredSongs().findIndex((s) => s.id === id);
    return index !== -1 && index < this.filteredSongs().length - 1;
  });

  musicForm: FormGroup;
  editingSongId: number | null = null;

  constructor() {
    this.musicForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(2)]],
      artist: ['', [Validators.required, Validators.minLength(2)]],
      youtubeUrl: [
        '',
        [
          Validators.required,
          Validators.pattern(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/),
        ],
      ],
      note: [''],
    });

    // Manejo reactivo de cambios de canción
    effect(() => {
      const song = this.currentSong();
      if (song && song?.youtubeId && this.player && this.player.loadVideoById) {
        this.player.loadVideoById(song.youtubeId);
        this.updateMediaSession(song);
        this.startKeepAlive();
      } else if (!song) {
        this.stopKeepAlive();
      }
    });
  }

  ngOnInit() {
    this.musicService.loadSongs().catch((error) => {
      console.error('Error loading songs:', error);
    });
    this.initYoutubeApi();
    this.setupMediaSessionHandlers();
    this.setupReactiveVisibility();
    this.setupYouTubeSearch();
  }

  ngAfterViewInit() {
    if (this.currentPlayingId()) {
      this.initPlayer();
    }
  }

  ngOnDestroy() {
    this.stopPlayback();
    this.destroy$.next();
    this.destroy$.complete();
    if (this.player) {
      this.player.destroy();
    }
  }

  // --- Lógica Reactiva de Visibilidad ---
  private setupReactiveVisibility() {
    fromEvent(document, 'visibilitychange')
      .pipe(
        takeUntil(this.destroy$),
        filter(() => document.visibilityState === 'hidden' && !!this.currentPlayingId()),
        switchMap(() => timer(200)),
      )
      .subscribe(() => {
        this.startKeepAlive();
        if (this.player && this.player.getPlayerState() === 2) {
          this.player.playVideo();
        }
      });
  }

  // --- Lógica de Keep-Alive ---
  private startKeepAlive() {
    const keepAliveAudio = this.keepAliveAudio();
    if (keepAliveAudio?.nativeElement) {
      keepAliveAudio.nativeElement.volume = 0.01;
      keepAliveAudio.nativeElement.play().catch(() => undefined);
    }
  }

  private stopKeepAlive() {
    const keepAliveAudio = this.keepAliveAudio();
    if (keepAliveAudio?.nativeElement) {
      keepAliveAudio.nativeElement.pause();
      keepAliveAudio.nativeElement.currentTime = 0;
    }
  }

  // --- Media Session API ---
  private setupMediaSessionHandlers() {
    if ('mediaSession' in navigator) {
      const actions: [MediaSessionAction, () => void][] = [
        [
          'play',
          () => {
            this.player?.playVideo();
            this.startKeepAlive();
          },
        ],
        [
          'pause',
          () => {
            this.player?.pauseVideo();
            this.stopKeepAlive();
          },
        ],
        ['previoustrack', () => this.previousSong()],
        ['nexttrack', () => this.nextSong()],
        ['stop', () => this.stopPlayback()],
      ];

      actions.forEach(([action, handler]) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {
          console.warn(`Action ${action} not supported`, error);
        }
      });
    }
  }

  private updateMediaSession(song: MusicSong) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: this.slug(),
        artwork: [
          {
            src: `https://img.youtube.com/vi/${song.youtubeId}/hqdefault.jpg`,
            sizes: '480x360',
            type: 'image/jpeg',
          },
          {
            src: `https://img.youtube.com/vi/${song.youtubeId}/maxresdefault.jpg`,
            sizes: '1280x720',
            type: 'image/jpeg',
          },
        ],
      });
      navigator.mediaSession.playbackState = 'playing';
    }
  }

  initYoutubeApi() {
    const win = window as Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };

    if (win.YT?.Player) {
      this.apiReady = true;
      return;
    }

    win.onYouTubeIframeAPIReady = () => {
      this.apiReady = true;
      if (this.currentPlayingId()) this.initPlayer();
    };

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  initPlayer() {
    if (!this.apiReady) return;

    timer(500)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const iframe = document.getElementById('youtube-player-iframe');
        if (!iframe) return;
        if (typeof YT === 'undefined') return;

        this.player = new YT.Player('youtube-player-iframe', {
          events: {
            onStateChange: (event: { data: number }) => {
              const state = event.data;
              if (state === 0) {
                // ENDED
                this.nextSong();
              } else if (state === 1) {
                // PLAYING
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                this.startKeepAlive();
              } else if (state === 2) {
                // PAUSED
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                if (document.visibilityState === 'hidden') {
                  timer(300)
                    .pipe(takeUntil(this.destroy$))
                    .subscribe(() => {
                      if (this.player?.getPlayerState() === 2) this.player.playVideo();
                    });
                }
              }
            },
            onError: () =>
              timer(2000)
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => this.nextSong()),
          },
        });
      });
  }

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  openAddModal() {
    this.isEditing.set(false);
    this.editingSongId = null;
    this.musicForm.reset();
    this.showModal.set(true);
    this.resetYouTubeSearch();
  }

  editSong(song: MusicSong) {
    this.isEditing.set(true);
    this.editingSongId = song.id || null;
    this.musicForm.patchValue({
      title: song.title,
      artist: song.artist,
      youtubeUrl: song.youtubeUrl,
      note: song.note,
    });
    this.showModal.set(true);
    this.resetYouTubeSearch();
  }

  closeModal() {
    this.showModal.set(false);
    this.musicForm.reset();
    this.isSubmitting.set(false);
    this.resetYouTubeSearch();
  }

  async onSubmit() {
    if (this.musicForm.invalid) {
      this.musicForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const songData: MusicSong = this.musicForm.value;

    try {
      if (this.isEditing() && this.editingSongId) {
        await this.musicService.updateSong(this.editingSongId, songData);
      } else {
        await this.musicService.addSong(songData);
      }
      this.closeModal();
    } catch (error) {
      console.error('Error saving song:', error);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  confirmDelete(song: MusicSong) {
    this.songToDelete.set(song);
  }

  async deleteSong() {
    const song = this.songToDelete();
    if (!song?.id) return;

    try {
      await this.musicService.removeSong(song.id);
      if (this.currentPlayingId() === song.id) this.stopPlayback();
      this.songToDelete.set(null);
    } catch (error) {
      console.error('Error deleting song:', error);
    }
  }

  playSong(song: MusicSong) {
    if (!song.youtubeId) {
      console.warn('Song has no valid YouTube ID:', song);
      return;
    }

    if (this.currentPlayingId() === song.id) {
      if (this.player) {
        const state = this.player.getPlayerState();
        if (state === 1) {
          this.player.pauseVideo();
        } else {
          this.player.playVideo();
        }
      }
    } else {
      const isFirstPlay = !this.currentPlayingId();
      this.currentPlayingId.set(song.id);
      if (isFirstPlay) this.initPlayer();
      this.startKeepAlive();
    }
  }

  playAll() {
    if (this.filteredSongs().length > 0) {
      this.playSong(this.filteredSongs()[0]);
    }
  }

  nextSong() {
    const id = this.currentPlayingId();
    if (!id) return;
    const index = this.filteredSongs().findIndex((s) => s.id === id);
    if (index !== -1 && index < this.filteredSongs().length - 1) {
      this.currentPlayingId.set(this.filteredSongs()[index + 1].id);
    } else {
      this.stopPlayback();
    }
  }

  previousSong() {
    const id = this.currentPlayingId();
    if (!id) return;
    const index = this.filteredSongs().findIndex((s) => s.id === id);
    if (index > 0) {
      this.currentPlayingId.set(this.filteredSongs()[index - 1].id);
    }
  }

  stopPlayback() {
    this.currentPlayingId.set(null);
    this.isVideoExpanded.set(false);
    this.stopKeepAlive();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
  }

  toggleVideoExpand() {
    this.isVideoExpanded.update((v) => !v);
  }

  drop(event: CdkDragDrop<MusicSong[]>) {
    if (this.searchQuery().trim() !== '') return;
    const currentSongs = [...this.songs()];
    moveItemInArray(currentSongs, event.previousIndex, event.currentIndex);
    this.musicService.updateOrder(currentSongs).catch((error) => {
      console.error('Error updating songs order:', error);
    });
  }

  // --- YouTube Search Methods ---
  private setupYouTubeSearch() {
    this.searchSubject
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((termino) => {
          return this.youtubeService.buscarVideos(termino).pipe(
            catchError((error) => {
              console.error('YouTube search error:', error);
              this.searchError.set(
                'Error al buscar videos. Verifica tu API key o intenta más tarde.',
              );
              this.isSearching.set(false);
              return of([]);
            }),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (results) => {
          this.youtubeSearchResults.set(results);
          this.isSearching.set(false);
        },
        error: (error) => {
          console.error('Search error:', error);
          this.searchError.set('Error al buscar videos. Verifica tu API key o intenta más tarde.');
          this.isSearching.set(false);
        },
      });
  }

  resetYouTubeSearch() {
    this.youtubeSearchQuery.set('');
    this.youtubeSearchResults.set([]);
    this.isSearching.set(false);
    this.searchError.set(null);
    this.showSearchDropdown.set(false);
    this.useManualUrl.set(false);
  }

  onYouTubeSearch(termino: string) {
    this.youtubeSearchQuery.set(termino);

    if (!termino.trim()) {
      this.youtubeSearchResults.set([]);
      this.showSearchDropdown.set(false);
      this.searchError.set(null);
      return;
    }

    if (termino.trim().length < 3) {
      this.youtubeSearchResults.set([]);
      this.showSearchDropdown.set(false);
      this.searchError.set(null);
      return;
    }

    this.isSearching.set(true);
    this.searchError.set(null);
    this.showSearchDropdown.set(true);

    this.searchSubject.next(termino);
  }

  selectVideo(video: YouTubeVideoResult) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${video.id}`;
    this.musicForm.patchValue({ youtubeUrl });

    // Auto-fill title
    this.musicForm.patchValue({ title: video.title });

    // Prefer explicit channel title returned by API as artist
    const channel = video.channelTitle || '';
    if (channel) {
      this.musicForm.patchValue({ artist: channel });
    } else {
      // Fallback: Try to extract artist from title (common format: "Artist - Song" or "Artist: Song")
      const artistMatch = video.title.match(/^(.+?)\s[-–:]\s.+$/);
      if (artistMatch) {
        this.musicForm.patchValue({ artist: artistMatch[1].trim() });
      }
    }

    // Force validators to re-evaluate after patching values
    this.musicForm.updateValueAndValidity({ onlySelf: false, emitEvent: true });

    this.youtubeSearchQuery.set(video.title);
    this.showSearchDropdown.set(false);
  }

  clearYouTubeSearch() {
    this.youtubeSearchQuery.set('');
    this.youtubeSearchResults.set([]);
    this.showSearchDropdown.set(false);
    this.searchError.set(null);
  }

  toggleUrlMode() {
    this.useManualUrl.update((v) => !v);
    this.clearYouTubeSearch();
  }
}
