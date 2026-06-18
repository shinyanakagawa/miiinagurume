// ============================================================
// Supabase Edge Function: create-checkout-session
// ログイン中のユーザーが所有するサイトに対して、Stripeの月額
// サブスクリプション用Checkoutセッションを作成し、決済URLを返す。
//
// 必要な環境変数（supabase secrets set で設定）:
//   STRIPE_SECRET_KEY        Stripeのシークレットキー
//   STRIPE_PRICE_ID          月額プランのPrice ID
//   APP_URL                  アプリの公開URL（例: https://example.com/グルメHP作成アプリ）
//   SUPABASE_URL             （Supabaseが自動で注入）
//   SUPABASE_SERVICE_ROLE_KEY （Supabaseが自動で注入）
// ============================================================

import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (userError || !user) {
      return new Response(JSON.stringify({ error: '認証に失敗しました' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { siteId } = await req.json();
    if (!siteId) {
      return new Response(JSON.stringify({ error: 'siteIdが必要です' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: site, error: siteError } = await supabase
      .from('sites').select('*').eq('id', siteId).eq('user_id', user.id).single();
    if (siteError || !site) {
      return new Response(JSON.stringify({ error: 'サイトが見つかりません' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let customerId = site.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id, site_id: site.id },
      });
      customerId = customer.id;
      await supabase.from('sites').update({ stripe_customer_id: customerId }).eq('id', site.id);
    }

    const appUrl = Deno.env.get('APP_URL')!;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID')!, quantity: 1 }],
      success_url: `${appUrl}/editor.html?id=${site.id}&checkout=success`,
      cancel_url: `${appUrl}/editor.html?id=${site.id}&checkout=cancel`,
      metadata: { site_id: site.id },
      subscription_data: { metadata: { site_id: site.id } },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
