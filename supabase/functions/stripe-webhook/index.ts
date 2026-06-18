// ============================================================
// Supabase Edge Function: stripe-webhook
// Stripeからのサブスクリプション関連イベントを受け取り、
// sites テーブルの subscription_status を更新する。
//
// 必要な環境変数（supabase secrets set で設定）:
//   STRIPE_SECRET_KEY         Stripeのシークレットキー
//   STRIPE_WEBHOOK_SECRET     このエンドポイント用のWebhook署名シークレット
//   SUPABASE_URL              （Supabaseが自動で注入）
//   SUPABASE_SERVICE_ROLE_KEY （Supabaseが自動で注入）
//
// Stripeダッシュボードで以下のイベントを購読してください:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
// ============================================================

import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function mapStripeStatus(status: string): string {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      return 'canceled';
  }
}

async function updateBySiteId(siteId: string, patch: Record<string, unknown>) {
  await supabase.from('sites').update(patch).eq('id', siteId);
}

async function updateBySubscriptionId(subscriptionId: string, patch: Record<string, unknown>) {
  await supabase.from('sites').update(patch).eq('stripe_subscription_id', subscriptionId);
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err}`, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const siteId = session.metadata?.site_id;
      if (siteId && session.subscription) {
        await updateBySiteId(siteId, {
          subscription_status: 'active',
          stripe_subscription_id: session.subscription as string,
        });
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const status = mapStripeStatus(subscription.status);
      const siteId = subscription.metadata?.site_id;
      if (siteId) {
        await updateBySiteId(siteId, { subscription_status: status });
      } else {
        await updateBySubscriptionId(subscription.id, { subscription_status: status });
      }
      break;
    }
    default:
      // 未対応のイベントは無視
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
