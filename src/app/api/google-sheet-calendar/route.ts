import { NextResponse } from 'next/server';

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1uBQeUD1j3Jb6HXLrD87Y7vZ26ghjPS6DWHWYb5PKs6k/export?format=csv';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(`${GOOGLE_SHEET_CSV_URL}&cacheBust=${Date.now()}`, {
      cache: 'no-store',
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Google Sheet could not be loaded (${response.status}).` },
        { status: 502 },
      );
    }

    return new NextResponse(await response.text(), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Google Sheet could not be loaded.' },
      { status: 502 },
    );
  }
}
