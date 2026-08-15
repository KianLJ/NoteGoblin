import { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'primary', className, ...rest }: ButtonProps): JSX.Element {
  const classes = ['gb-btn', `gb-btn--${variant}`, className].filter(Boolean).join(' ')
  return <button className={classes} {...rest} />
}
