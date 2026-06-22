import { describe, expect, test } from 'bun:test'

import { getInitialImageZoom } from './image-preview-zoom'

describe('图片预览初始缩放', () => {
  test('SVG 按预览容器自适应显示完整画面', () => {
    const zoom = getInitialImageZoom({
      ext: '.svg',
      imageWidth: 1920,
      imageHeight: 1080,
      viewportWidth: 1280,
      viewportHeight: 720,
    })

    expect(zoom).toBeCloseTo(2 / 3, 4)
  })

  test('SVG 自适应时不会放大小图', () => {
    const zoom = getInitialImageZoom({
      ext: '.svg',
      imageWidth: 640,
      imageHeight: 360,
      viewportWidth: 1280,
      viewportHeight: 720,
    })

    expect(zoom).toBe(1)
  })

  test('普通图片沿用原来的 25% 初始缩放', () => {
    const zoom = getInitialImageZoom({
      ext: '.png',
      imageWidth: 1920,
      imageHeight: 1080,
      viewportWidth: 1280,
      viewportHeight: 720,
    })

    expect(zoom).toBe(0.25)
  })
})
