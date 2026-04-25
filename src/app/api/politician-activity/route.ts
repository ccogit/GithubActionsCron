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
      .from('politician_trade_summary')
      .select(
        'symbol, buy_count, sell_count, news_sentiment, trends_direction, trends_score'
      )
      .in('symbol', symbols);

    if (error) {
      console.error('Error fetching politician activity:', error);
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('Politician activity endpoint error:', error);
    return NextResponse.json({ data: [] });
  }
}
