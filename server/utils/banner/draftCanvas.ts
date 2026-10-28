/** Native one-artboard 300x250 MRec draft used by banner project creation tools. */
export function buildMrecDraftCanvas(headline: string): Record<string, unknown> {
  return {
    mrec: {
      bgColor: '#0a0a10',
      layers: [
        {
          id: 1,
          type: 'bg',
          name: 'Background',
          x: 0,
          y: 0,
          w: 300,
          h: 250,
          zIndex: 0,
          opacity: 1,
          locked: true,
          bgColor: '#0a0a10',
          animIn: 'none',
          animInDur: 0,
          startTime: 0,
          endTime: 5,
          ease: 'none',
          animOut: 'none',
          animOutEase: 'none'
        },
        {
          id: 2,
          type: 'text',
          name: 'Headline',
          text: headline,
          x: 20,
          y: 80,
          w: 260,
          h: 90,
          zIndex: 10,
          opacity: 1,
          fontSize: 56,
          fontWeight: 900,
          fontFamily: 'Barlow Condensed',
          color: '#ffffff',
          textTransform: 'none',
          letterSpacing: '0',
          lineHeight: 1,
          textAlign: 'center',
          animIn: 'fadeIn',
          animInDur: 0.6,
          startTime: 0.2,
          endTime: 4.2,
          ease: 'power2.out',
          animOut: 'fadeOut',
          animOutEase: 'power1.in'
        }
      ]
    }
  }
}
