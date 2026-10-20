'use client';

import { useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase/client';
import { Alert, Avatar, Button } from './ui';

/**
 * Profile photo: pick or take a picture, square-crop and shrink it in the browser (512px JPEG),
 * upload it to the person's own folder in the `avatars` bucket, then tell the API the URL.
 */
export function AvatarUpload({
  name,
  current,
  save,
}: {
  name: string;
  current: string | null;
  /** Server action that stores the URL (or null to remove) on the profile. */
  save: (url: string | null) => Promise<{ error?: string }>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function squareJpeg(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(512, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize images');
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not encode image'))),
        'image/jpeg',
        0.86,
      ),
    );
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await squareJpeg(file);
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in again to change your photo');
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const result = await save(data.publicUrl);
      if (result.error) throw new Error(result.error);
      setPreview(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await save(null);
      if (result.error) throw new Error(result.error);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove photo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={preview} size={72} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input
          ref={input}
          id="avatar-file"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? 'Working…' : preview ? 'Change photo' : 'Add a photo'}
          </Button>
          {preview ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void remove()}
            >
              Remove
            </Button>
          ) : null}
        </div>
        <span className="text-xs text-muted">
          Shown next to your name on rosters and court boards. Square-cropped, 512px.
        </span>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </div>
  );
}
