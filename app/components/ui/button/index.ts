import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*=\'size-\'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-primary focus-visible:ring-primary/50 focus-visible:ring-3 aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-inverted hover:bg-primary/90',
        destructive:
          'bg-error text-white hover:bg-error/90 focus-visible:ring-error/20 dark:focus-visible:ring-error/40 dark:bg-error/60',
        outline:
          'border bg-default shadow-xs hover:bg-accented hover:text-highlighted dark:bg-elevated/30 dark:border-default dark:hover:bg-elevated/50',
        secondary:
          'bg-elevated text-default hover:bg-elevated/80',
        ghost:
          'hover:bg-accented hover:text-highlighted dark:hover:bg-accented/50',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        'default': 'h-9 px-4 py-2 has-[>svg]:px-3',
        'xs': 'h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*=\'size-\'])]:size-3',
        'sm': 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        'lg': 'h-10 rounded-md px-6 has-[>svg]:px-4',
        'icon': 'size-9',
        'icon-xs': 'size-6 rounded-md [&_svg:not([class*=\'size-\'])]:size-3',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
