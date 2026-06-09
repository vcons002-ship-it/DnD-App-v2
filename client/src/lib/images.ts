/**
 * Many browsers (notably Chrome/Firefox on desktop) can't render HEIC/HEIF
 * photos, so an iPhone/iPad upload of one would be stored but never display.
 * Safari itself usually transcodes HEIC→JPEG when picked through a file input,
 * so this mainly guards other browsers handed a `.heic` file. Returns a friendly
 * message to show the user, or null when the image is fine to upload.
 */
export function unsupportedImageReason(file: File): string | null {
  const heic = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
  if (heic)
    return (
      `“${file.name}” is a HEIC/HEIF photo, which most browsers can't display. ` +
      `Save or export it as JPEG or PNG first — on iPhone/iPad you can set ` +
      `Settings → Camera → Formats → “Most Compatible”, or share the photo as a JPEG.`
    );
  return null;
}
