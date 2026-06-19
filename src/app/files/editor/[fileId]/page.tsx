'use client';

import React from 'react';
import { useParams } from 'next/navigation';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';

export default function FileEditorPage() {
  const params = useParams<{ fileId: string }>();
  const fileId = params.fileId;

  return (
    <main style={{ height: '100vh', background: '#0f172a' }}>
      <iframe
        title="File editor"
        src={`${apiBase}/api/files/editor/${fileId}`}
        style={{ width: '100%', height: '100%', border: 0 }}
      />
    </main>
  );
}
