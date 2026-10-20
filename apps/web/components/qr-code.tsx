import { qrSvg } from '../lib/qr';
import { CopyButton } from './copy-button';

/** QR tile with the link underneath and a share/copy button. Server component. */
export async function QrCode({
  url,
  caption,
  size = 180,
}: {
  url: string;
  caption?: string;
  size?: number;
}) {
  const svg = await qrSvg(url, size);
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-paper p-4">
      <div
        role="img"
        aria-label={`QR code for ${url}`}
        className="overflow-hidden rounded-control bg-surface p-2"
        style={{ width: size + 16, height: size + 16 }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {caption ? <div className="text-center text-sm font-semibold">{caption}</div> : null}
      <div className="flex w-full items-center gap-2 rounded-control border border-hairline bg-surface p-2">
        <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
        <CopyButton value={url} />
      </div>
    </div>
  );
}
