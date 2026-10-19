import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { VisitStats, RegisterClickStats } from '../../../../services/admin.service';

@Component({
  selector: 'app-admin-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-stats.component.html',
  styleUrl: './admin-stats.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminStatsComponent {
  totalCount = input.required<number>();
  paidCount = input.required<number>();
  invitationCount = input.required<number>();
  noInvitationCount = input.required<number>();
  visitStats = input<VisitStats | null>(null);
  registerClickStats = input<RegisterClickStats | null>(null);

  paidPercentage = computed(() => {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.paidCount() / total) * 100);
  });

  invitationPercentage = computed(() => {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.invitationCount() / total) * 100);
  });

  /** Ratio de conversión visita → click en registrar. */
  visitToClickRate = computed(() => {
    const visits = this.visitStats()?.totalVisits ?? 0;
    const clicks = this.registerClickStats()?.totalClicks ?? 0;
    if (visits === 0) return 0;
    return Math.round((clicks / visits) * 100);
  });
}
