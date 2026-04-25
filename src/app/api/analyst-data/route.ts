import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 3600; // 1 hour

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get('symbols')?.split(',') || [];

  if (symbols.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const db = createClient();

  try {
    const { data, error } = await db
      .from('analyst_cache')
      .select('symbol, target_mean, current_price, upside_pct, n_analysts')
      .in('symbol', symbols);

    if (error) {
      console.error('Error fetching analyst data:', error);
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('Analyst data endpoint error:', error);
    return NextResponse.json({ data: [] });
  }
}
