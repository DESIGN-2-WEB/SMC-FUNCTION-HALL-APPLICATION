import { fail, str } from './http.js';

// Photos arrive already shrunk by the browser, as JPEG/PNG/WebP image data
const IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * An item's photo from a form: { photo, thumb } (large and small). Leaving `photo` out keeps
 * the item's current one; an empty `photo` removes it. Photos are optional.
 */
export function parsePhoto(b, item) {
  if (b.photo === undefined) return { photo: item?.photo || '', thumb: item?.thumb || '' }; // unchanged
  const photo = str(b.photo), thumb = str(b.thumb);
  if (!photo) return { photo: '', thumb: '' }; // removed
  if (!IMAGE.test(photo) || !IMAGE.test(thumb)) fail('That photo could not be read. Try another picture.');
  if (photo.length > 600000 || thumb.length > 80000) fail('That photo is too large. Try a smaller picture.');
  return { photo, thumb };
}
