import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/text';
import type { LoanAction, LocalLoan, LoanStatus } from '@/types';

import { Button } from './button';
import { ThemedText } from './themed-text';

const STATUS_LABEL: Record<LoanStatus, string> = {
  requested: 'Solicitado',
  approved: 'Prestado',
  rejected: 'Rechazado',
  returned: 'Devuelto',
};

export function actionsFor(status: LoanStatus): LoanAction[] {
  if (status === 'requested') return ['approve', 'reject'];
  if (status === 'approved') return ['return'];
  return [];
}

const ACTION_LABEL: Record<LoanAction, string> = {
  approve: 'Prestar',
  reject: 'Rechazar',
  return: 'Registrar devolución',
};

interface LoanCardProps {
  loan: LocalLoan;
  /** Bibliotecario: muestra quién pidió el libro y los botones de gestión. */
  librarian: boolean;
  online: boolean;
  busy: boolean;
  onAction: (loan: LocalLoan, action: LoanAction) => void;
  onDismiss: (loan: LocalLoan) => void;
}

export function LoanCard({ loan, librarian, online, busy, onAction, onDismiss }: LoanCardProps) {
  const theme = useTheme();
  const conflict = loan.syncState === 'conflict';
  const pending = loan.syncState === 'pending';
  const statusColor = conflict
    ? theme.danger
    : pending
      ? theme.warning
      : loan.status === 'approved'
        ? theme.success
        : loan.status === 'rejected'
          ? theme.danger
          : theme.textSecondary;
  const statusText = conflict
    ? 'No se pudo solicitar'
    : pending
      ? 'Pendiente de envío'
      : STATUS_LABEL[loan.status];
  const lines = [
    `Solicitado ${formatDate(loan.requestedAt)}`,
    loan.status === 'approved' && loan.dueDate ? `Entrega ${formatDate(loan.dueDate)}` : null,
    loan.status === 'returned' ? `Devuelto ${formatDate(loan.returnedAt)}` : null,
  ].filter(Boolean);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: conflict ? theme.danger : theme.border,
        },
      ]}
      accessible
      accessibilityLabel={`${loan.bookTitle}. ${statusText}. ${lines.join('. ')}`}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={[styles.title, { fontSize: 16 }]} numberOfLines={2}>
          {loan.bookTitle}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: statusColor }}>
          {statusText}
        </ThemedText>
      </View>
      {librarian ? (
        <ThemedText type="small" themeColor="textSecondary">
          {loan.userName} · {loan.userEmail}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {lines.join(' · ')}
      </ThemedText>
      {conflict ? (
        <>
          <ThemedText type="small" style={{ color: theme.danger }}>
            {loan.syncError}
          </ThemedText>
          <Button title="Descartar" variant="secondary" onPress={() => onDismiss(loan)} />
        </>
      ) : null}
      {librarian && !pending && !conflict && actionsFor(loan.status).length > 0 ? (
        <View style={styles.actions}>
          {actionsFor(loan.status).map((action) => (
            <View key={action} style={styles.actionItem}>
              <Button
                title={ACTION_LABEL[action]}
                variant={action === 'approve' ? 'primary' : 'secondary'}
                disabled={!online || busy}
                onPress={() => onAction(loan, action)}
              />
            </View>
          ))}
        </View>
      ) : null}
      {librarian && !online && actionsFor(loan.status).length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Conéctate a internet para gestionar préstamos.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: 14, borderWidth: 1, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  title: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  actionItem: { flexGrow: 1 },
});
