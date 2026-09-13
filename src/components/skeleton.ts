export type SkeletonShape = 'text' | 'block' | 'pill' | 'circle'

export interface SkeletonInput {
  shape?: SkeletonShape
  width?: string
  height?: string
}

export interface SkeletonStyle {
  className: string
  width: string
  height: string
}

const SHAPE_CLASS: Record<SkeletonShape, string> = {
  text: 'skeleton rounded',
  block: 'skeleton rounded-md',
  pill: 'skeleton rounded-full',
  circle: 'skeleton rounded-full',
}

const DEFAULT_WIDTH = '100%'
const DEFAULT_HEIGHT = '1em'

/**
 * Toda forma sempre devolve uma altura definida — é essa garantia que permite
 * ao skeleton reservar o espaço do conteúdo final antes de ele existir. Num
 * círculo, a largura acompanha a altura para não virar uma elipse.
 */
export function skeletonStyle(input: SkeletonInput): SkeletonStyle {
  const shape = input.shape ?? 'block'
  const height = input.height ?? DEFAULT_HEIGHT
  const width = shape === 'circle' ? height : (input.width ?? DEFAULT_WIDTH)
  return { className: SHAPE_CLASS[shape], width, height }
}
