import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { VisitStats } from '../../../../services/admin.service';

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
}
