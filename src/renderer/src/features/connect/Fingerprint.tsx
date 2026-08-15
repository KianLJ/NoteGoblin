/** Renders a sha256 hex fingerprint as colon-separated byte pairs, the way TLS fingerprints are conventionally shown. */
export function Fingerprint({ value }: { value: string }): JSX.Element {
  const grouped = value.match(/.{1,2}/g)?.join(':') ?? value
  return (
    <code
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        wordBreak: 'break-all',
        color: 'var(--text-secondary)'
      }}
    >
      {grouped}
    </code>
  )
}
