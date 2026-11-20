// RNF04: reduz e converte a foto para WebP antes do upload (máx. 1200 px no maior lado).
export async function compressImage(file: File, maxSide = 1200, quality = 0.82): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao converter'))), 'image/webp', quality),
  )
  return new File([blob], 'foto.webp', { type: 'image/webp' })
}
