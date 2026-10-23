import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { API_URL } from '@/config/env';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Book } from '@/types';

import { ThemedText } from './themed-text';

export function BookCover({ book, width, height }: { book: Book; width: number; height: number }) {
  const theme = useTheme();
  const size = { width, height, borderRadius: 10 };
  if (book.coverUrl) {
    return (
      <Image
        source={{ uri: `${API_URL}${book.coverUrl}` }}
        style={size}
        contentFit="cover"
        transition={150}
        accessibilityLabel={`Portada de ${book.title}`}
      />
    );
  }
  return (
    <View
      accessible={false}
      style={[size, styles.placeholder, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="subtitle" themeColor="textSecondary">
        {book.title.charAt(0)}
      </ThemedText>
    </View>
  );
}

export function availabilityLabel(book: Pick<Book, 'availableCopies' | 'totalCopies'>): string {
  return book.availableCopies > 0
    ? `${book.availableCopies} de ${book.totalCopies} disponibles`
    : 'Sin ejemplares disponibles';
}

export function BookCard({ book }: { book: Book }) {
  const theme = useTheme();
  const available = book.availableCopies > 0;
  return (
    <Link href={{ pathname: '/book/[id]', params: { id: book.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${book.title}, de ${book.author}. ${availabilityLabel(book)}`}
        accessibilityHint="Abre el detalle del libro"
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          pressed && { opacity: 0.85 },
        ]}>
        <BookCover book={book} width={64} height={88} />
        <View style={styles.info}>
          <ThemedText type="smallBold" numberOfLines={2} style={{ fontSize: 16 }}>
            {book.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {book.author}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {book.category} · {book.year}
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: available ? theme.success : theme.danger }}>
            {availabilityLabel(book)}
          </ThemedText>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  info: { flex: 1, gap: Spacing.half, justifyContent: 'center' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
