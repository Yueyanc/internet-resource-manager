export function BrandLogo({
  size = 28,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/logo-64.png"
      srcSet="/logo-64.png 1x, /logo-128.png 2x, /logo-256.png 4x"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      className={className ? `brand-logo-img ${className}` : 'brand-logo-img'}
    />
  );
}
