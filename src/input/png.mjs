// PNG 머리 읽기 — 그림을 줄일지, 어떤 CSS 크기로 실을지 정하는 데 필요한 값(폭 · 높이 · 배율)을 PNG 바이트에서 읽는다. 순수 함수다.
// 부르는 곳: input/images.mjs, input/image-shrinker.mjs.
// 먼저 읽을 파일: 없음.

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** 72dpi 를 미터당 픽셀로 바꾼 값. pHYs 가 이 값의 두 배면 2배(레티나) 캡처다. */
export const PPM_1X = 2835

/** PNG 바이트 → { width, height, ppm }. ppm 은 pHYs 단위가 미터일 때만 있다. PNG 가 아니면 null. */
export function pngHeader(bytes) {
  if (!bytes || bytes.length < 24 || !bytes.subarray(0, 8).equals(SIGNATURE)) return null
  const header = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), ppm: null }
  let at = 8
  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(at)
    const type = bytes.toString('latin1', at + 4, at + 8)
    if (type === 'pHYs' && length >= 9 && bytes[at + 16] === 1) header.ppm = bytes.readUInt32BE(at + 8)
    if (type === 'IDAT' || type === 'IEND') break
    at += 12 + length
  }
  return header
}

/** 그림 배율 — pHYs → 파일 이름의 @Nx → 1. */
export function pngDensity(fileName, header) {
  if (header?.ppm) return Math.max(1, Math.round(header.ppm / PPM_1X))
  const match = /@(\d)x\.png$/i.exec(String(fileName))
  return match ? Number(match[1]) : 1
}

/** 줄일 크기. 긴 변이 maxPx 이하이거나 maxPx 가 0 이면 null(그대로 싣는다). 가로세로 비율은 지킨다. */
export function shrinkSize(width, height, maxPx) {
  const longSide = Math.max(width, height)
  if (!(maxPx > 0) || !(longSide > maxPx)) return null
  const ratio = maxPx / longSide
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}
