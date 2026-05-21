'use client';

export async function uploadToStorage(file: File, path: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);

  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok) throw new Error(data.error ?? 'Upload failed');
  return data.url as string;
}
