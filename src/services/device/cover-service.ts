/**
 * Servicio del dispositivo integrado con la API (semana 12): foto de portada.
 *
 * Flujo: permiso → cámara/galería → reducir y comprimir → PUT /api/books/:id/cover.
 *
 * Buenas prácticas aplicadas:
 * - Permisos mínimos: solo CAMERA, solo cuando el bibliotecario pulsa el botón (no al abrir la app).
 *   La galería usa el selector del sistema, que no requiere permiso de almacenamiento.
 * - Se reduce la imagen ANTES de subirla (ahorra datos y cumple el límite de la API).
 * - Cada paso queda en la bitácora local (activity_log) sin guardar la imagen ni datos personales.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { Repositories } from '@/db/repositories';
import type { ApiClient } from '@/services/api/client';
import type { Book } from '@/types';

export type CoverSource = 'camera' | 'library';

/** La API acepta hasta 700 000 caracteres en base64 (~520 KB de imagen). */
export const MAX_BASE64_LENGTH = 700_000;

const COVER_WIDTH = 600;

/** Se prueban calidades decrecientes hasta que entre en el límite. */
const QUALITIES = [0.7, 0.5, 0.35, 0.2];

export class PermissionDeniedError extends Error {
  constructor(
    /** false si el sistema ya no volverá a mostrar el diálogo: hay que enviar al usuario a Ajustes. */
    readonly canAskAgain: boolean,
  ) {
    super('Permiso de cámara denegado');
    this.name = 'PermissionDeniedError';
  }
}

export class ImageTooLargeError extends Error {
  constructor() {
    super('La imagen es demasiado grande incluso después de comprimirla');
    this.name = 'ImageTooLargeError';
  }
}

export interface PickedCover {
  base64: string;
  contentType: 'image/jpeg';
}

/** Devuelve null si el usuario cancela. */
export async function pickCover(
  source: CoverSource,
  activity: Pick<Repositories['activity'], 'log'>,
): Promise<PickedCover | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    await activity.log('cover.permission', `cámara: ${permission.status}`);
    if (!permission.granted) throw new PermissionDeniedError(permission.canAskAgain);
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || result.assets.length === 0) {
    await activity.log('cover.pick', `${source}: cancelado`);
    return null;
  }
  const asset = result.assets[0];
  for (const compress of QUALITIES) {
    const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    context.resize({ width: COVER_WIDTH });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: ImageManipulator.SaveFormat.JPEG,
      compress,
      base64: true,
    });
    if (saved.base64 && saved.base64.length <= MAX_BASE64_LENGTH) {
      await activity.log(
        'cover.pick',
        `${source}: ${Math.round(saved.base64.length / 1024)} KB base64, calidad ${compress}`,
      );
      return { base64: saved.base64, contentType: 'image/jpeg' };
    }
  }
  await activity.log('cover.pick', `${source}: imagen demasiado grande`);
  throw new ImageTooLargeError();
}

/** Sube la portada. Requiere conexión: si falla por red, el error llega a la pantalla. */
export async function uploadCover(
  api: Pick<ApiClient, 'put'>,
  activity: Pick<Repositories['activity'], 'log'>,
  bookId: string,
  cover: PickedCover,
): Promise<Book> {
  try {
    const { book } = await api.put<{ book: Book }>(`/api/books/${bookId}/cover`, {
      contentType: cover.contentType,
      data: cover.base64,
    });
    await activity.log('cover.upload', `OK libro ${bookId}`);
    return book;
  } catch (err) {
    await activity.log('cover.upload', `ERROR libro ${bookId}: ${(err as Error).name}`);
    throw err;
  }
}
