import { describe, expect, it } from 'vite-plus/test'
import { getGpuTransition, getGpuTransitionIds } from './index'

describe('GPU transition registry', () => {
  it('registers liquid distort as a directional GPU transition', () => {
    const def = getGpuTransition('liquidDistort')

    expect(getGpuTransitionIds()).toContain('liquidDistort')
    expect(def).toMatchObject({
      id: 'liquidDistort',
      name: 'Liquid Distort',
      category: 'custom',
      entryPoint: 'liquidDistortFragment',
      hasDirection: true,
      directions: ['from-left', 'from-right', 'from-top', 'from-bottom'],
      uniformSize: 48,
    })
  })

  it('packs liquid distort uniforms within its declared buffer size', () => {
    const def = getGpuTransition('liquidDistort')

    expect(def).toBeDefined()
    const uniforms = def!.packUniforms(0.35, 1920, 1080, 2, {
      intensity: 1.25,
      scale: 5,
      turbulence: 0.9,
      edgeSoftness: 0.16,
      chroma: 0.5,
      swirl: 1.1,
      shine: 0.8,
    })

    expect(uniforms.byteLength).toBeLessThanOrEqual(def!.uniformSize)
    expect(Array.from(uniforms)).toEqual([
      expect.closeTo(0.35),
      1920,
      1080,
      2,
      1.25,
      5,
      expect.closeTo(0.9),
      expect.closeTo(0.16),
      0.5,
      expect.closeTo(1.1),
      expect.closeTo(0.8),
      0,
    ])
  })

  it('registers lens warp zoom as a GPU transition', () => {
    const def = getGpuTransition('lensWarpZoom')

    expect(getGpuTransitionIds()).toContain('lensWarpZoom')
    expect(def).toMatchObject({
      id: 'lensWarpZoom',
      name: 'Lens Warp Zoom',
      category: 'custom',
      entryPoint: 'lensWarpZoomFragment',
      hasDirection: false,
      uniformSize: 48,
    })
  })

  it('packs lens warp zoom uniforms within its declared buffer size', () => {
    const def = getGpuTransition('lensWarpZoom')

    expect(def).toBeDefined()
    const uniforms = def!.packUniforms(0.42, 1280, 720, 0, {
      zoomStrength: 1.2,
      warpStrength: 0.8,
      blurStrength: 0.7,
      chroma: 0.45,
      vignette: 0.5,
      centerX: 0.4,
      centerY: 0.6,
      glow: 0.9,
    })

    expect(uniforms.byteLength).toBeLessThanOrEqual(def!.uniformSize)
    expect(Array.from(uniforms)).toEqual([
      expect.closeTo(0.42),
      1280,
      720,
      expect.closeTo(1.2),
      expect.closeTo(0.8),
      expect.closeTo(0.7),
      expect.closeTo(0.45),
      expect.closeTo(0.5),
      expect.closeTo(0.4),
      expect.closeTo(0.6),
      expect.closeTo(0.9),
      0,
    ])
  })

  it('registers light leak burn as a directional GPU transition', () => {
    const def = getGpuTransition('lightLeakBurn')

    expect(getGpuTransitionIds()).toContain('lightLeakBurn')
    expect(def).toMatchObject({
      id: 'lightLeakBurn',
      name: 'Light Leak Burn',
      category: 'light',
      entryPoint: 'lightLeakBurnFragment',
      hasDirection: true,
      directions: ['from-left', 'from-right', 'from-top', 'from-bottom'],
      uniformSize: 48,
    })
  })

  it('packs light leak burn uniforms within its declared buffer size', () => {
    const def = getGpuTransition('lightLeakBurn')

    expect(def).toBeDefined()
    const uniforms = def!.packUniforms(0.33, 1920, 1080, 3, {
      intensity: 1.4,
      spread: 0.9,
      warmth: 0.8,
      burn: 1.2,
      edgeSoftness: 0.14,
      grain: 0.35,
    })

    expect(uniforms.byteLength).toBeLessThanOrEqual(def!.uniformSize)
    expect(Array.from(uniforms)).toEqual([
      expect.closeTo(0.33),
      1920,
      1080,
      3,
      expect.closeTo(1.4),
      expect.closeTo(0.9),
      expect.closeTo(0.8),
      expect.closeTo(1.2),
      expect.closeTo(0.14),
      expect.closeTo(0.35),
      0,
      0,
    ])
  })

  it('registers film gate slip as a GPU transition', () => {
    const def = getGpuTransition('filmGateSlip')

    expect(getGpuTransitionIds()).toContain('filmGateSlip')
    expect(def).toMatchObject({
      id: 'filmGateSlip',
      name: 'Film Gate Slip',
      category: 'custom',
      entryPoint: 'filmGateSlipFragment',
      hasDirection: false,
      uniformSize: 48,
    })
  })

  it('packs film gate slip uniforms within its declared buffer size', () => {
    const def = getGpuTransition('filmGateSlip')

    expect(def).toBeDefined()
    const uniforms = def!.packUniforms(0.61, 1280, 720, 0, {
      slip: 1.1,
      shake: 0.8,
      exposure: 0.7,
      gateWidth: 0.06,
      grain: 0.5,
      chroma: 0.4,
      roll: 0.9,
    })

    expect(uniforms.byteLength).toBeLessThanOrEqual(def!.uniformSize)
    expect(Array.from(uniforms)).toEqual([
      expect.closeTo(0.61),
      1280,
      720,
      expect.closeTo(1.1),
      expect.closeTo(0.8),
      expect.closeTo(0.7),
      expect.closeTo(0.06),
      expect.closeTo(0.5),
      expect.closeTo(0.4),
      expect.closeTo(0.9),
      0,
      0,
    ])
  })

  it.each([
    ['textReveal', 'Text Reveal', 'mask', 'textRevealFragment'],
    ['inkSpread', 'Ink Spread', 'mask', 'inkSpreadFragment'],
    ['radialShatter', 'Radial Shatter', 'mask', 'radialShatterFragment'],
  ])('registers %s as a GPU mask transition', (id, name, category, entryPoint) => {
    const def = getGpuTransition(id)

    expect(getGpuTransitionIds()).toContain(id)
    expect(def).toMatchObject({
      id,
      name,
      category,
      entryPoint,
      hasDirection: false,
    })
  })

  it('packs text reveal uniforms within its declared buffer size', () => {
    const def = getGpuTransition('textReveal')
    const uniforms = def!.packUniforms(0.45, 1920, 1080, 0, {
      scale: 0.85,
      softness: 0.02,
      fillSpeed: 1.2,
      zoom: 0.8,
      textPreset: 2,
      text: 'HELLO 7!',
    })

    expect(uniforms.byteLength).toBeLessThanOrEqual(def!.uniformSize)
    expect(Array.from(uniforms)).toEqual([
      expect.closeTo(0.45),
      1920,
      1080,
      expect.closeTo(0.85),
      expect.closeTo(0.02),
      expect.closeTo(1.2),
      expect.closeTo(0.8),
      7,
      8,
      5,
      12,
      12,
      15,
      0,
      34,
      0,
      0,
      0,
      0,
      0,
    ])
  })

  it('packs ink spread uniforms within its declared buffer size', () => {
    const def = getGpuTransition('inkSpread')
    const uniforms = def!.packUniforms(0.52, 1280, 720, 0, {
      density: 0.9,
      softness: 0.05,
      turbulence: 1.1,
      bleed: 0.7,
    })

    expect(uniforms.byteLength).toBeLessThanOrEqual(def!.uniformSize)
    expect(Array.from(uniforms)).toEqual([
      expect.closeTo(0.52),
      1280,
      720,
      expect.closeTo(0.9),
      expect.closeTo(0.05),
      expect.closeTo(1.1),
      expect.closeTo(0.7),
      0,
    ])
  })

  it('packs radial shatter uniforms within its declared buffer size', () => {
    const def = getGpuTransition('radialShatter')
    const uniforms = def!.packUniforms(0.37, 1920, 1080, 0, {
      pieces: 20,
      spread: 1.2,
      rotation: 0.9,
      edgeSoftness: 0.1,
      centerX: 0.45,
      centerY: 0.55,
      flash: 0.8,
    })

    expect(uniforms.byteLength).toBeLessThanOrEqual(def!.uniformSize)
    expect(Array.from(uniforms)).toEqual([
      expect.closeTo(0.37),
      1920,
      1080,
      20,
      expect.closeTo(1.2),
      expect.closeTo(0.9),
      expect.closeTo(0.1),
      expect.closeTo(0.45),
      expect.closeTo(0.55),
      expect.closeTo(0.8),
      0,
      0,
    ])
  })
})
