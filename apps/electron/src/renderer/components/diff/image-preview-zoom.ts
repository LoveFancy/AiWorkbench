export const DEFAULT_IMAGE_ZOOM = 0.25
const MAX_INITIAL_SVG_ZOOM = 1
const MIN_INITIAL_SVG_ZOOM = 0.1

interface InitialImageZoomInput {
  ext: string
  imageWidth: number
  imageHeight: number
  viewportWidth: number
  viewportHeight: number
}

export function getInitialImageZoom(input: InitialImageZoomInput): number {
  if (input.ext !== '.svg') return DEFAULT_IMAGE_ZOOM
  if (input.imageWidth <= 0 || input.imageHeight <= 0) return DEFAULT_IMAGE_ZOOM
  if (input.viewportWidth <= 0 || input.viewportHeight <= 0) return DEFAULT_IMAGE_ZOOM

  const fitZoom = Math.min(input.viewportWidth / input.imageWidth, input.viewportHeight / input.imageHeight)
  return Math.max(MIN_INITIAL_SVG_ZOOM, Math.min(MAX_INITIAL_SVG_ZOOM, fitZoom))
}
