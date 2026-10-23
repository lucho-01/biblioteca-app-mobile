import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ConnectionBanner } from '@/components/connection-banner';
import { LoanCard } from '@/components/loan-card';
import { Screen } from '@/components/screen';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useLoans } from '@/hooks/use-library-data';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';
import { describeError } from '@/services/api/client';
import type { LoanAction, LocalLoan } from '@/types';

type Filter = 'open' | 'all';

export default function LoansScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { online, syncing, lastError, syncNow, transitionLoan, dismissLoan } = useData();
  const { loans, status } = useLoans();
  const librarian = user?.role === 'librarian';
  const [filter, setFilter] = useState<Filter>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Bibliotecario: por defecto lo que requiere acción (solicitados y prestados).
  const visible =
    librarian && filter === 'open'
      ? loans.filter((l) => l.status === 'requested' || l.status === 'approved')
      : loans;

  // PRIORIDAD UX: Los conflictos y pendientes van primero para que el usuario los resuelva.
  const sortedVisible = [...visible].sort((a, b) => {
    if (a.syncState === 'conflict') return -1;
    if (b.syncState === 'conflict') return 1;
    if (a.syncState === 'pending') return -1;
    if (b.syncState === 'pending') return 1;
    return 0;
  });

  const conflicts = visible.filter((l) => l.syncState === 'conflict');

  async function onAction(loan: LocalLoan, action: LoanAction) {
    setBusyId(loan.id);
    try {
      await transitionLoan(loan.id, action);
    } catch (err) {
      Alert.alert('No se pudo completar la acción', describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle" accessibilityRole="header">
          {librarian ? 'Gestión de préstamos' : 'Mis préstamos'}
        </ThemedText>
        <ConnectionBanner />
        
        {/* BANNER DE CONFLICTOS: Avisar al usuario que hay errores de sincronización */}
        {conflicts.length > 0 && (
          <View style={[styles.conflictBanner, { backgroundColor: theme.danger + '20', borderColor: theme.danger }]}>
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              ⚠️ Tienes {conflicts.length} solicitud(es) con error de sincronización.
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.danger }}>
              Revisa los detalles abajo para descartarlas o reintentar.
            </ThemedText>
          </View>
        )}

        {librarian ? (
          <View style={styles.filters}>
            {(['open', 'all'] as const).map((f) => {
              const selected = f === filter;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.chip,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected ? theme.primary : 'transparent',
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: selected ? theme.onPrimary : theme.text }}>
                    {f === 'open' ? 'Por gestionar' : 'Todos'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      <FlatList
        data={sortedVisible}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => (
          <LoanCard
            loan={item}
            librarian={librarian}
            online={online}
            busy={busyId === item.id}
            onAction={onAction}
            onDismiss={(l) => void dismissLoan(l.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        contentContainerStyle={[styles.list, { paddingBottom: BottomTabInset + Spacing.four }]}
        refreshControl={
          <RefreshControl
            refreshing={syncing && sortedVisible.length > 0}
            onRefresh={() => void syncNow()}
          />
        }
        ListEmptyComponent={
          status === 'loading' ? (
            <LoadingView message="Cargando préstamos…" />
          ) : status === 'error' ? (
            <ErrorView message={lastError ?? 'Error desconocido'} onRetry={() => void syncNow()} />
          ) : (
            <EmptyView
              title={librarian ? 'Nada por gestionar' : 'Aún no has solicitado libros'}
              message={
                librarian
                  ? 'Las nuevas solicitudes aparecerán aquí.'
                  : 'Entra a un libro y pulsa “Solicitar préstamo”.'
              }
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, paddingTop: Spacing.two, paddingBottom: Spacing.two },
  filters: { flexDirection: 'row', gap: Spacing.two },
  chip: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  conflictBanner: {
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    gap: Spacing.one,
  },
  list: { flexGrow: 1 },
});
