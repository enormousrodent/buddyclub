import QRCode from 'qrcode';

/** Renders a QR code as an inline SVG string (server side). */
export async function qrSvg(text: string, size = 200): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    width: size,
    errorCorrectionLevel: 'M',
    color: { dark: '#141e33', light: '#ffffff' },
  });
}
