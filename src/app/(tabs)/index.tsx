import { useDeferredValue, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { BookCard } from '@/components/book-views';
import { ConnectionBanner } from '@/components/connection-banner';
import { Screen } from '@/components/screen';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useBooks, useCategories } from '@/hooks/use-library-data';
import { useTheme } from '@/hooks/use-theme';
import { useData } from '@/providers/data-provider';

export default function BooksScreen() {
  const theme = useTheme();
  const { syncNow, syncing, lastError } = useData();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const q = useDeferredValue(search);
  const { books, status } = useBooks({ q, category });
  const categories = useCategories();
  const filtering = q.trim().length > 0 || category !== null;

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle" accessibilityRole="header">
          Catálogo
        </ThemedText>
        <ConnectionBanner />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por título o autor"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Buscar libros por título o autor"
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          style={[
            styles.search,
            {
              color: theme.text,
              borderColor: theme.border,
              backgroundColor: theme.backgroundElement,
            },
          ]}
        />
        {categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {[null, ...categories].map((c) => {
              const selected = c === category;
              return (
                <Pressable
                  key={c ?? 'all'}
                  onPress={() => setCategory(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={c ? `Categoría ${c}` : 'Todas las categorías'}
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
                    {c ?? 'Todas'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <BookCard book={item} />}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        contentContainerStyle={[styles.list, { paddingBottom: BottomTabInset + Spacing.four }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={syncing && books.length > 0}
            onRefresh={() => void syncNow()}
          />
        }
        ListEmptyComponent={
          status === 'loading' ? (
            <LoadingView message="Cargando catálogo…" />
          ) : status === 'error' ? (
            <ErrorView message={lastError ?? 'Error desconocido'} onRetry={() => void syncNow()} />
          ) : (
            <EmptyView
              title={filtering ? 'Sin resultados' : 'El catálogo está vacío'}
              message={
                filtering
                  ? 'Prueba con otro título, autor o categoría.'
                  : 'Aún no hay libros registrados.'
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
  search: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  chips: { gap: Spacing.two, paddingVertical: Spacing.one },
  chip: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  list: { flexGrow: 1 },
});
