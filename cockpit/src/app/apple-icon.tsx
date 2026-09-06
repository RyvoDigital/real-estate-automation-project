import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// Generated rather than committed as a binary: one less asset to keep in
// step with the palette, and the gradient is the locked brand (§2.2).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #e8453c 0%, #7a1a16 100%)',
          color: '#ffffff',
          fontSize: 108,
          fontWeight: 700,
          letterSpacing: '-0.05em',
        }}
      >
        R
      </div>
    ),
    size,
  )
}
